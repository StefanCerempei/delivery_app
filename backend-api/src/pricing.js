// Prețul se calculează DOAR aici, pe server. Ce trimite browserul nu contează.

export const VEHICLES = {
    courier: { name: 'Reloq Courier', crewLabel: '1 mover', base: 29, perMile: 1.75, perMin: 0.45, minTotal: 35 },
    lite: { name: 'Reloq Lite', crewLabel: '1 mover', base: 45, perMile: 2.25, perMin: 0.6, minTotal: 55 },
    pickup: { name: 'Reloq Pickup', crewLabel: '2 movers', base: 69, perMile: 2.85, perMin: 0.85, minTotal: 79 },
    van: { name: 'Reloq Van', crewLabel: '2 movers', base: 95, perMile: 3.5, perMin: 1.1, minTotal: 109 }
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
