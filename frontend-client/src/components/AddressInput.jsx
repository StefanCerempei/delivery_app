import React, { useState, useEffect, useRef } from 'react';


// Autocomplete cu Photon (OpenStreetMap): sugerează adrese pe măsură ce scrii.
// Rezultatele sunt limitate la nord-estul SUA (raza de 300 mile din jurul Massachusetts)
// și favorizează zona Ashland, MA.
const PHOTON_URL = 'https://photon.komoot.io/api/';
const SERVICE_BBOX = '-80.6,38.8,-66.8,47.6'; // stânga, jos, dreapta, sus
const BIAS = { lat: 42.26, lon: -71.46 };

/** „1 Beacon Street, Boston, MA 02108” din câmpurile Photon */
function toSuggestion(feature) {
    const p = feature.properties || {};
    const [lon, lat] = feature.geometry?.coordinates || [];
    const streetLine = p.street ? [p.housenumber, p.street].filter(Boolean).join(' ') : null;
    const title = p.name && p.name !== p.street ? p.name : streetLine || p.name || p.city || '';
    const stateZip = [p.state && STATE_ABBR[p.state] ? STATE_ABBR[p.state] : p.state, p.postcode].filter(Boolean).join(' ');
    const locality = p.city || p.town || p.village || p.district || p.county;
    const subtitleParts = [title !== streetLine ? streetLine : null, locality, stateZip].filter(Boolean);
    const subtitle = subtitleParts.join(', ');
    return {
        id: `${p.osm_type}${p.osm_id}`,
        title,
        subtitle,
        address: [title, subtitle].filter(Boolean).join(', '),
        lat: Number(lat),
        lng: Number(lon),
        countrycode: p.countrycode
    };
}

const STATE_ABBR = {
    Massachusetts: 'MA', 'New Hampshire': 'NH', 'Rhode Island': 'RI', Connecticut: 'CT', Vermont: 'VT', Maine: 'ME',
    'New York': 'NY', 'New Jersey': 'NJ', Pennsylvania: 'PA', Delaware: 'DE', Maryland: 'MD'
};

const AddressInput = ({ name, label, placeholder, value, onSelect }) => {
    const [query, setQuery] = useState(value?.address || '');
    const [suggestions, setSuggestions] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [searchError, setSearchError] = useState('');
    const skipNextSearch = useRef(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        skipNextSearch.current = true;
        setQuery(value?.address || '');
    }, [value?.address]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (skipNextSearch.current) {
            skipNextSearch.current = false;
            return;
        }

        setSearched(false);
        setSearchError('');
        if (!query || query.trim().length < 3) {
            setSuggestions([]);
            setIsOpen(false);
            return;
        }

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                setLoading(true);
                const params = new URLSearchParams({
                    q: query.trim(),
                    limit: '8',
                    lang: 'en',
                    lat: String(BIAS.lat),
                    lon: String(BIAS.lon),
                    bbox: SERVICE_BBOX
                });
                const res = await fetch(`${PHOTON_URL}?${params}`, { signal: controller.signal });
                if (!res.ok) throw new Error(`Address search failed (${res.status})`);
                const data = await res.json();
                const seen = new Set();
                const results = (data.features || [])
                    .map(toSuggestion)
                    .filter((s) => s.countrycode === 'US' && s.title && Number.isFinite(s.lat))
                    .filter((s) => (seen.has(s.address) ? false : seen.add(s.address)))
                    .slice(0, 5);
                setSuggestions(results);
                setSearchError('');
                setSearched(true);
                setIsOpen(true);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    setSuggestions([]);
                    setSearchError('Address search is unavailable right now. Please try again.');
                    setIsOpen(true);
                }
            } finally {
                setLoading(false);
            }
        }, 350);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    const handleSelectSuggestion = (item) => {
        skipNextSearch.current = true;
        const selectedLocation = { address: item.address, lat: item.lat, lng: item.lng };
        setQuery(item.address);
        setSuggestions([]);
        setIsOpen(false);
        onSelect(selectedLocation);
    };

    const handleClear = () => {
        skipNextSearch.current = true;
        setQuery('');
        setSuggestions([]);
        setIsOpen(false);
        onSelect(null);
    };

    return (
        <div className="route-field-wrapper" ref={wrapperRef}>
            <input
                type="text"
                id={name}
                name={name}
                aria-label={label || placeholder}
                // sugestiile vin din lista noastră; completarea automată a browserului s-ar suprapune peste ea
                autoComplete="off"
                className="route-field-input"
                placeholder={placeholder}
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    if (!e.target.value) onSelect(null);
                }}
                onFocus={() => (suggestions.length > 0 || searched) && setIsOpen(true)}
            />

            {loading && <span className="field-spinner" />}

            {!loading && query && (
                <button type="button" className="field-clear-btn" onClick={handleClear} title="Clear">
                    ×
                </button>
            )}

            {isOpen && suggestions.length > 0 && (
                <ul className="address-dropdown">
                    {suggestions.map((item) => (
                        <li key={item.id} onClick={() => handleSelectSuggestion(item)}>
                            <span className="dropdown-pin"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg></span>
                            <div className="dropdown-text">
                                <strong>{item.title}</strong>
                                {item.subtitle && <span>{item.subtitle}</span>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {isOpen && !loading && suggestions.length === 0 && (searched || searchError) && (
                <div className="address-dropdown address-dropdown-empty" role="status">
                    {searchError || 'No matching address. Try a street and town, e.g. “98 Mountain Gate Rd, Ashland”.'}
                </div>
            )}
        </div>
    );
};

export default AddressInput;