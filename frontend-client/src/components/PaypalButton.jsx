import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

// Scriptul PayPal se încarcă o singură dată, doar când e nevoie de buton.
// disable-funding: lăsăm doar portofelul PayPal (cardul se plătește prin Stripe).
let sdkPromise = null;
function loadPaypalSdk(clientId) {
    if (window.paypal) return Promise.resolve(window.paypal);
    if (!sdkPromise) {
        sdkPromise = new Promise((resolve, reject) => {
            const params = new URLSearchParams({
                'client-id': clientId,
                currency: 'USD',
                intent: 'capture',
                components: 'buttons',
                'disable-funding': 'card,credit,paylater,venmo'
            });
            const script = document.createElement('script');
            script.src = `https://www.paypal.com/sdk/js?${params}`;
            script.async = true;
            script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error('PayPal failed to load')));
            script.onerror = () => {
                sdkPromise = null;
                reject(new Error('PayPal failed to load'));
            };
            document.head.appendChild(script);
        });
    }
    return sdkPromise;
}

/**
 * Butonul PayPal pentru o comandă RELOQ deja creată pe server.
 * Suma o stabilește serverul; încasarea (capture) și verificarea se fac tot pe server.
 */
const PaypalButton = ({ order, clientId, onPaid, disabled }) => {
    const containerRef = useRef(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [failedToLoad, setFailedToLoad] = useState(false);

    useEffect(() => {
        let buttons = null;
        let cancelled = false;

        loadPaypalSdk(clientId)
            .then((paypal) => {
                if (cancelled || !containerRef.current) return;
                buttons = paypal.Buttons({
                    fundingSource: paypal.FUNDING.PAYPAL,
                    style: { layout: 'horizontal', color: 'gold', shape: 'rect', label: 'paypal', height: 48, tagline: false },
                    createOrder: async () => {
                        setError('');
                        const { paypalOrderId } = await api.paypalCreate(order.id);
                        return paypalOrderId;
                    },
                    onApprove: async (data, actions) => {
                        setBusy(true);
                        try {
                            const { order: updated } = await api.paypalCapture(order.id, data.orderID);
                            onPaid(updated);
                        } catch (err) {
                            setBusy(false);
                            // Cardul din PayPal a fost refuzat: PayPal îl lasă pe client să aleagă altă sursă.
                            if (err.data?.code === 'INSTRUMENT_DECLINED') return actions.restart();
                            setError(err.message);
                        }
                    },
                    onCancel: () => setError(''),
                    onError: () => setError('PayPal is not responding right now. Please try again or pay by card.')
                });
                if (buttons.isEligible()) buttons.render(containerRef.current);
            })
            .catch(() => !cancelled && setFailedToLoad(true));

        return () => {
            cancelled = true;
            buttons?.close?.().catch?.(() => {});
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId, order.id]);

    if (failedToLoad) return null; // fără PayPal rămâne plata cu cardul

    return (
        <div className={`paypal-pay ${disabled || busy ? 'is-busy' : ''}`}>
            <div className="paypal-divider">
                <span>or pay with</span>
            </div>
            <div ref={containerRef} className="paypal-button-slot" />
            {busy && <p className="trust-note">Completing your PayPal payment…</p>}
            {error && <p className="form-inline-error">{error}</p>}
        </div>
    );
};

export default PaypalButton;
