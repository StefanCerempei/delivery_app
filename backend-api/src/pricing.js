// Prețul se calculează DOAR aici, pe server. Ce trimite browserul nu contează.

// Cele 5 opțiuni din specificația RELOQ. `perMile` = tarifele din PDF.
// base / perMin / minTotal sunt PLACEHOLDER în modelul actual simplu — de confirmat cu RELOQ
// odată cu modelul complet (taxă rezervare + taxă fixă $29 + manoperă). Id-urile = frontend/vehicles.js.
export const VEHICLES = {
    courier: { name: 'Courier', crewLabel: '1 mover + standard vehicle', base: 29, perMile: 1.9, perMin: 0.45, minTotal: 39 },
    van_solo: { name: 'Van – Solo', crewLabel: '1 mover + van', base: 39, perMile: 2.2, perMin: 0.55, minTotal: 49 },
    van_team: { name: 'Van – Team', crewLabel: '2 movers + van', base: 59, perMile: 2.8, perMin: 0.8, minTotal: 69 },
    truck: { name: 'Moving Truck', crewLabel: '2 movers + box truck', base: 89, perMile: 3.4, perMin: 1.05, minTotal: 99 },
    large_truck: { name: 'Large Moving Truck', crewLabel: '3 movers + 26 ft truck', base: 129, perMile: 4.8, perMin: 1.4, minTotal: 149 }
};

export const MAX_DISTANCE_MILES = 300;

const toRad = (deg) => (deg * Math.PI) / 180;

function haversineMiles(a, b) {
    const R = 3958.8;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distanța și durata reală pe drum (OSRM). Dacă serviciul nu răspunde, folosește o estimare. */
export async function getRoute(pickup, dropoff) {
    const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?overview=false`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        const data = await res.json();
        if (data.code === 'Ok' && data.routes?.length) {
            const route = data.routes[0];
            return {
                distanceMiles: Math.round((route.distance / 1609.344) * 10) / 10,
                durationMins: Math.max(1, Math.round(route.duration / 60)),
                source: 'osrm'
            };
        }
    } catch {
        // cade pe estimare
    }

    const straight = haversineMiles(pickup, dropoff);
    const distanceMiles = Math.round(straight * 1.3 * 10) / 10; // factor tipic drum vs. linie dreaptă
    return {
        distanceMiles,
        durationMins: Math.max(1, Math.round((distanceMiles / 25) * 60)), // ~25 mph în oraș
        source: 'estimate'
    };
}

/** Prețul pentru un vehicul, în cenți (fără erori de virgulă mobilă). */
export function priceFor(vehicleId, route) {
    const rate = VEHICLES[vehicleId];
    if (!rate) throw new Error(`Vehicul necunoscut: ${vehicleId}`);

    const distanceCost = Math.round(route.distanceMiles * rate.perMile);
    const timeCost = Math.round(route.durationMins * rate.perMin);
    const total = Math.max(rate.minTotal, rate.base + distanceCost + timeCost);

    return {
        vehicleId,
        baseFareCents: rate.base * 100,
        distanceCostCents: distanceCost * 100,
        timeCostCents: timeCost * 100,
        totalCents: total * 100
    };
}

export function allPrices(route) {
    return Object.fromEntries(Object.keys(VEHICLES).map((id) => [id, priceFor(id, route)]));
}
