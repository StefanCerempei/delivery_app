// Căutarea adreselor pentru rezervare. Două surse, rezultatele exacte primele:
//   1. US Census Geocoder — registrul oficial al SUA, are numerele caselor (gratuit, fără cheie);
//   2. Photon (OpenStreetMap) — locuri, clădiri, străzi.
// Când OpenStreetMap știe doar strada, păstrăm numărul scris de client (altfel s-ar pierde).

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const PHOTON_URL = 'https://photon.komoot.io/api/';
// Zona deservită: nord-estul SUA (aceeași ca în formular)
const BBOX = { west: -80.6, south: 38.8, east: -66.8, north: 47.6 };
const BIAS = { lat: 42.26, lon: -71.46 };

const STATE_ABBR = {
    Massachusetts: 'MA', 'New Hampshire': 'NH', 'Rhode Island': 'RI', Connecticut: 'CT', Vermont: 'VT', Maine: 'ME',
    'New York': 'NY', 'New Jersey': 'NJ', Pennsylvania: 'PA', Delaware: 'DE', Maryland: 'MD'
};

const inArea = (lat, lng) => lat >= BBOX.south && lat <= BBOX.north && lng >= BBOX.west && lng <= BBOX.east;

/** „98 MOUNTAIN GATE RD” → „98 Mountain Gate Rd” (păstrează N/S/E/W, NE etc. cu majuscule). */
const titleCase = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/\b([a-z])([a-z]*)/g, (m, a, b) => (/^(ne|nw|se|sw)$/.test(m) ? m.toUpperCase() : a.toUpperCase() + b));

/** Numărul casei de la începutul căutării („98 Mountain…” → „98”, „12-14 Main” → „12-14”). */
export function leadingHouseNumber(q) {
    const m = /^\s*(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+\S/.exec(q);
    return m ? m[1] : null;
}

async function fetchJson(url, ms = 6000) {
    const res = await fetch(url, {
        signal: AbortSignal.timeout(ms),
        headers: { 'User-Agent': 'RELOQ-booking/1.0 (+https://reloqmove.com)', Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function censusSearch(q) {
    const params = new URLSearchParams({ address: q, benchmark: 'Public_AR_Current', format: 'json' });
    const data = await fetchJson(`${CENSUS_URL}?${params}`);
    return (data?.result?.addressMatches || [])
        .map((m) => {
            const lat = Number(m.coordinates?.y);
            const lng = Number(m.coordinates?.x);
            // „98 MOUNTAIN GATE RD, ASHLAND, MA, 01721”
            const [street, city, state, zip] = String(m.matchedAddress || '').split(',').map((s) => s.trim());
            if (!street || !Number.isFinite(lat) || !inArea(lat, lng)) return null;
            const subtitle = [titleCase(city), [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
            return { id: `census:${m.matchedAddress}`, title: titleCase(street), subtitle, lat, lng, exact: true };
        })
        .filter(Boolean);
}

async function photonSearch(q, houseNumber) {
    const params = new URLSearchParams({
        q,
        limit: '10',
        lang: 'en',
        lat: String(BIAS.lat),
        lon: String(BIAS.lon),
        bbox: `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`
    });
    const data = await fetchJson(`${PHOTON_URL}?${params}`);
    return (data?.features || [])
        .map((f) => {
            const p = f.properties || {};
            const [lng, lat] = f.geometry?.coordinates || [];
            if (p.countrycode !== 'US' || !Number.isFinite(lat)) return null;

            // Stradă fără număr în OSM, dar clientul a scris unul → îl păstrăm
            const isStreet = !p.housenumber && (p.osm_key === 'highway' || (p.street && !p.name) || p.type === 'street');
            const streetName = p.street || (p.osm_key === 'highway' ? p.name : null);
            const number = p.housenumber || (isStreet && houseNumber ? houseNumber : null);
            const streetLine = streetName ? [number, streetName].filter(Boolean).join(' ') : null;

            const title = p.name && p.name !== streetName && p.osm_key !== 'highway' ? p.name : streetLine || p.name || p.city || '';
            const stateZip = [STATE_ABBR[p.state] || p.state, p.postcode].filter(Boolean).join(' ');
            const locality = p.city || p.town || p.village || p.district || p.county;
            const subtitle = [title !== streetLine ? streetLine : null, locality, stateZip].filter(Boolean).join(', ');
            return {
                id: `osm:${p.osm_type}${p.osm_id}:${number || ''}`,
                title,
                subtitle,
                lat: Number(lat),
                lng: Number(lng),
                exact: Boolean(p.housenumber),
                // numărul a fost adăugat de noi pe stradă: poziția pe hartă e aproximativă
                approximate: Boolean(number && !p.housenumber)
            };
        })
        .filter((s) => s && s.title);
}

/** Sugestii pentru câmpul de adresă (max 6), cu adresele exacte primele. */
export async function searchAddresses(q) {
    const houseNumber = leadingHouseNumber(q);
    const [census, photon] = await Promise.allSettled([
        houseNumber ? censusSearch(q) : Promise.resolve([]),
        photonSearch(q, houseNumber)
    ]);
    if (census.status === 'rejected' && photon.status === 'rejected') {
        throw new Error('Address search is unavailable right now.');
    }
    const exact = census.value || [];
    // Adresa exactă din registrul oficial face inutilă varianta aproximativă (stradă + numărul scris)
    const osm = (photon.value || []).filter((s) => !(exact.length && s.approximate));
    const all = [...exact, ...osm];
    const seen = new Set();
    const out = [];
    for (const s of all) {
        const key = `${s.title}|${s.subtitle}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...s, address: [s.title, s.subtitle].filter(Boolean).join(', ') });
    }
    // registrul oficial primul, apoi OpenStreetMap în ordinea lui de relevanță
    return out.slice(0, 6);
}
