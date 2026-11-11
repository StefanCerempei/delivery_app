import { useMemo } from 'react';

// Tarife temporare de dezvoltare (vor fi înlocuite de răspunsul POST /api/estimate)
const MOCK_RATES = {
    courier: { base: 45, perKm: 4.5, perMin: 0.8, minTotal: 55 },
    lite: { base: 75, perKm: 5.5, perMin: 1.0, minTotal: 89 },
    pickup: { base: 125, perKm: 7.0, perMin: 1.5, minTotal: 149 },
    van: { base: 175, perKm: 8.5, perMin: 2.0, minTotal: 199 }
};

export function usePriceEstimate(routeInfo) {
    return useMemo(() => {
        const distanceKm = routeInfo?.distanceKm || 0;
        const durationMins = routeInfo?.durationMins || 0;

        const estimates = {};

        Object.entries(MOCK_RATES).forEach(([vehicleId, rate]) => {
            const distanceCost = distanceKm * rate.perKm;
            const timeCost = durationMins * rate.perMin;
            const rawTotal = rate.base + distanceCost + timeCost;
            const total = Math.max(rate.minTotal, Math.round(rawTotal));

            estimates[vehicleId] = {
                vehicleId,
                baseFare: rate.base,
                distanceCost: Math.round(distanceCost),
                timeCost: Math.round(timeCost),
                total
            };
        });

        return estimates;
    }, [routeInfo?.distanceKm, routeInfo?.durationMins]);
}