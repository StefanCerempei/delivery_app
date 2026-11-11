import { useEffect, useState } from 'react';
import { api, toLocation } from '../api/client';

/**
 * Prețurile vin de la server (POST /api/estimate), exact cum vor fi facturate.
 * Returnează { estimates, routeInfo, loading, error }.
 */
export function usePriceEstimate(pickup, dropoff) {
    const [state, setState] = useState({ estimates: {}, routeInfo: null, loading: false, error: '' });

    const key = pickup && dropoff ? `${pickup.lat},${pickup.lng};${dropoff.lat},${dropoff.lng}` : '';

    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: '' }));

        api.estimate(toLocation(pickup), toLocation(dropoff))
            .then(({ estimates, routeInfo }) => {
                if (!cancelled) setState({ estimates, routeInfo, loading: false, error: '' });
            })
            .catch((err) => {
                if (!cancelled) setState({ estimates: {}, routeInfo: null, loading: false, error: err.message });
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return state;
}
