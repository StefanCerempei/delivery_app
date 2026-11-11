import { useMemo } from 'react';

// Temporary frontend pricing rates in USD (will be replaced by POST /api/estimate)
const MOCK_RATES = {
    courier: { base: 29, perMile: 1.75, perMin: 0.45, minTotal: 35 },
    lite: { base: 45, perMile: 2.25, perMin: 0.6, minTotal: 55 },
    pickup: { base: 69, perMile: 2.85, perMin: 0.85, minTotal: 79 },
    van: { base: 95, perMile: 3.5, perMin: 1.1, minTotal: 109 }
};

export function usePriceEstimate(routeInfo) {
    return useMemo(() => {
        const distanceMiles = routeInfo?.distanceMiles || 0;
        const durationMins = routeInfo?.durationMins || 0;

        const estimates = {};

        Object.entries(MOCK_RATES).forEach(([vehicleId, rate]) => {
            const distanceCost = distanceMiles * rate.perMile;
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
    }, [routeInfo?.distanceMiles, routeInfo?.durationMins]);
}