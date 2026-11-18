// Prețul se calculează DOAR aici, pe server. Ce trimite browserul nu contează.
//
// Specificația RELOQ (secțiunea 3) — patru componente, fiecare afișată separat, în USD:
//   3.1 Reservation Fee  (la rezervare) = (minute garaj → pickup + minute destinație → garaj) × $2.50
//   3.2 Service Fee      (la rezervare) = $29 fix, o dată pe rezervare
//   3.3 Transportation   (la rezervare) = mile pickup → destinație × tariful pe milă al vehiculului
//   3.4 Labor            (după job)     = minute reale de la sosirea echipei la pickup până la final × tariful echipei
// Toate sumele sunt în cenți (fără erori de virgulă mobilă).

// Parcarea RELOQ: originea cursei de ducere și destinația cursei de întoarcere.
// Coordonatele implicite sunt pe Allied Dr. lângă nr. 122 (Dedham Corporate Center); se pot ajusta din env.
export const GARAGE = {
    address: '122 Allied Dr, Dedham, MA 02026',
    lat: Number(process.env.GARAGE_LAT) || 42.227,
    lng: Number(process.env.GARAGE_LNG) || -71.1744
};

export const RESERVATION_CENTS_PER_MIN = 250; // $2.50 / minut de condus
export const SERVICE_FEE_CENTS = 2900; // $29.00 / rezervare

// Manopera: tarif pe minut în funcție de numărul de muncitori.
export const LABOR_CENTS_PER_MIN = { 1: 120, 2: 215, 3: 310 };

// Cele 5 opțiuni. Id-urile = frontend-client/src/data/vehicles.js.
export const VEHICLES = {
    courier: { name: 'Courier', crew: 1, crewLabel: '1 mover + standard vehicle', perMileCents: 190 },
    van_solo: { name: 'Van – Solo', crew: 1, crewLabel: '1 mover + van', perMileCents: 220 },
    van_team: { name: 'Van – Team', crew: 2, crewLabel: '2 movers + van', perMileCents: 280 },
    truck: { name: 'Moving Truck', crew: 2, crewLabel: '2 movers + box truck (12–20 ft)', perMileCents: 340 },
    large_truck: { name: 'Large Moving Truck', crew: 3, crewLabel: '3 movers + 26 ft truck', perMileCents: 480 }
};

export const MAX_DISTANCE_MILES = 300;

const toRad = (deg) => (deg * Math.PI) / 180;
const toMiles = (meters) => Math.round((meters / 1609.344) * 10) / 10;
const toMinutes = (seconds) => Math.max(1, Math.round(seconds / 60));

function haversineMiles(a, b) {
    const R = 3958.8;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** Estimare fără serviciul de rute: drum ≈ 1.3 × linia dreaptă, ~25 mph. */
function estimateLeg(a, b) {
    const miles = Math.round(haversineMiles(a, b) * 1.3 * 10) / 10;
    return { miles, mins: Math.max(1, Math.round((miles / 25) * 60)) };
}

/**
 * Cele trei segmente ale cursei, într-un singur apel OSRM: garaj → pickup → destinație → garaj.
 * Dacă serviciul nu răspunde, folosește o estimare.
 */
export async function getTrip(pickup, dropoff) {
    const points = [GARAGE, pickup, dropoff, GARAGE].map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${points}?overview=false`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        const data = await res.json();
        const legs = data.code === 'Ok' ? data.routes?.[0]?.legs : null;
        if (legs?.length === 3) {
            const [outbound, main, back] = legs;
            return {
                distanceMiles: toMiles(main.distance),
                durationMins: toMinutes(main.duration),
                outboundMins: toMinutes(outbound.duration),
                returnMins: toMinutes(back.duration),
                source: 'osrm'
            };
        }
    } catch {
        // cade pe estimare
    }

    const outbound = estimateLeg(GARAGE, pickup);
    const main = estimateLeg(pickup, dropoff);
    const back = estimateLeg(dropoff, GARAGE);
    return {
        distanceMiles: main.miles,
        durationMins: main.mins,
        outboundMins: outbound.mins,
        returnMins: back.mins,
        source: 'estimate'
    };
}

/** Prețul pentru un vehicul, în cenți. */
export function priceFor(vehicleId, trip) {
    const vehicle = VEHICLES[vehicleId];
    if (!vehicle) throw new Error(`Vehicul necunoscut: ${vehicleId}`);

    const reservationMins = trip.outboundMins + trip.returnMins;
    const reservationFeeCents = reservationMins * RESERVATION_CENTS_PER_MIN;
    const serviceFeeCents = SERVICE_FEE_CENTS;
    const transportationCents = Math.round(trip.distanceMiles * vehicle.perMileCents);

    return {
        vehicleId,
        reservationFeeCents,
        serviceFeeCents,
        transportationCents,
        totalCents: reservationFeeCents + serviceFeeCents + transportationCents, // plătit la rezervare
        laborCentsPerMin: LABOR_CENTS_PER_MIN[vehicle.crew], // facturat după job
        crew: vehicle.crew,
        perMileCents: vehicle.perMileCents,
        outboundMins: trip.outboundMins,
        returnMins: trip.returnMins,
        distanceMiles: trip.distanceMiles
    };
}

export function allPrices(trip) {
    return Object.fromEntries(Object.keys(VEHICLES).map((id) => [id, priceFor(id, trip)]));
}

const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

/**
 * Liniile de preț afișate peste tot (pasul de vehicul, plata, emailuri, dispecerat),
 * ca să fie identice. Sumele în dolari.
 */
export function priceLines(p) {
    const laborPer5 = p.laborCentsPerMin * 5;
    return {
        lines: [
            {
                key: 'reservation',
                label: 'Reservation fee',
                detail: `${p.outboundMins + p.returnMins} min driving to/from our Dedham base × ${usd(RESERVATION_CENTS_PER_MIN)}/min`,
                amount: p.reservationFeeCents / 100
            },
            { key: 'service', label: 'Service fee', detail: 'Once per booking', amount: p.serviceFeeCents / 100 },
            {
                key: 'transportation',
                label: 'Transportation',
                detail: `${p.distanceMiles} mi pickup → destination × ${usd(p.perMileCents)}/mi`,
                amount: p.transportationCents / 100
            }
        ],
        total: p.totalCents / 100,
        labor: {
            crew: p.crew,
            perMinute: p.laborCentsPerMin / 100,
            per5Minutes: laborPer5 / 100,
            label: `${usd(p.laborCentsPerMin)}/min (${usd(laborPer5)} per 5 min) for ${p.crew} mover${p.crew > 1 ? 's' : ''}`,
            detail: 'Billed after completion — actual time from crew arrival at pickup to job completion at the destination.'
        }
    };
}
