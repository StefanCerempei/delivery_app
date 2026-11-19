import React, { useEffect, useMemo, useState } from 'react';
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { api } from '../api/client';
import { formatPrice } from '../utils/formatters';
import Button from './Button';
import PaypalButton from './PaypalButton';

/*
 * Rândul de metode de plată (cu swipe pe telefon): Card · Apple Pay · Google Pay · Amazon Pay · PayPal.
 * Formularul Stripe e un iframe pe care nu-l putem așeza noi, deci rândul e al nostru, iar dedesubt
 * se afișează doar plata metodei alese:
 *   - Card        → Payment Element limitat la card (fără Link / Bank / Klarna);
 *   - Apple Pay / Google Pay / Amazon Pay → butonul Stripe al metodei respective (Express Checkout);
 *   - PayPal      → butonul PayPal direct.
 * Plata se confirmă pe PaymentIntent-ul deja creat pe server (clientSecret), deci suma rămâne cea de pe server.
 */

const METHOD_LABELS = {
    card: 'Card',
    applePay: 'Apple Pay',
    googlePay: 'Google Pay',
    amazonPay: 'Amazon Pay',
    paypal: 'PayPal'
};

const returnUrlFor = (order, param) => `${window.location.origin}/?${param}=${encodeURIComponent(order.id)}`;

/** Confirmă plata la Stripe pe PaymentIntent-ul comenzii, apoi serverul verifică și marchează comanda. */
function useConfirmPayment({ order, clientSecret, onPaid, returnParam }) {
    const stripe = useStripe();
    const elements = useElements();
    const [error, setError] = useState('');
    const [isPaying, setIsPaying] = useState(false);

    const pay = async () => {
        if (!stripe || !elements) return;
        setError('');
        setIsPaying(true);

        const { error: submitError } = await elements.submit();
        if (submitError) {
            setError(submitError.message || 'Please check your payment details.');
            setIsPaying(false);
            return;
        }

        const { error: stripeError } = await stripe.confirmPayment({
            elements,
            clientSecret,
            redirect: 'if_required',
            // Amazon Pay trimite clientul pe site-ul Amazon; la întoarcere BookingContext verifică plata.
            confirmParams: { return_url: returnUrlFor(order, returnParam) }
        });
        if (stripeError) {
            setError(stripeError.message || 'Your payment could not be processed.');
            setIsPaying(false);
            return;
        }

        try {
            // Serverul verifică la Stripe că plata chiar a intrat, abia apoi marchează comanda ca plătită.
            const { order: updated } = await api.confirmPayment(order.id);
            onPaid(updated);
        } catch (err) {
            setError(err.message);
            setIsPaying(false);
        }
    };

    return { pay, error, isPaying, ready: Boolean(stripe && elements) };
}

const CardPanel = (props) => {
    const { pay, error, isPaying, ready } = useConfirmPayment(props);
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                pay();
            }}
        >
            <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } }} />
            {error && <p className="form-inline-error">{error}</p>}
            <div className="step-footer">
                <Button type="submit" disabled={!ready || isPaying}>
                    {isPaying ? 'Processing payment…' : `Pay ${formatPrice(props.order.totalAmount)}`}
                </Button>
            </div>
        </form>
    );
};

/** Butonul Stripe pentru o singură metodă rapidă (Apple Pay, Google Pay sau Amazon Pay). */
const WalletPanel = ({ method, ...props }) => {
    const { pay, error, isPaying } = useConfirmPayment(props);
    const [unavailable, setUnavailable] = useState(false);

    const options = useMemo(
        () => ({
            paymentMethods: {
                applePay: method === 'applePay' ? 'always' : 'never',
                googlePay: method === 'googlePay' ? 'always' : 'never',
                amazonPay: method === 'amazonPay' ? 'auto' : 'never',
                link: 'never',
                paypal: 'never',
                klarna: 'never'
            },
            buttonType: { applePay: 'book', googlePay: 'book' },
            buttonHeight: 50,
            layout: { maxColumns: 1, maxRows: 1, overflow: 'never' }
        }),
        [method]
    );

    return (
        <div className={`wallet-panel ${isPaying ? 'is-busy' : ''}`}>
            <ExpressCheckoutElement
                key={method}
                options={options}
                onConfirm={pay}
                onReady={({ availablePaymentMethods }) => setUnavailable(!availablePaymentMethods)}
            />
            {unavailable && (
                <p className="trust-note">
                    {METHOD_LABELS[method]} isn’t available on this device or browser. Please choose another payment method.
                </p>
            )}
            {isPaying && <p className="trust-note">Completing your payment…</p>}
            {error && <p className="form-inline-error">{error}</p>}
        </div>
    );
};

/**
 * Ce metode afișăm. Apple Pay / Google Pay doar dacă browserul le suportă
 * (Apple Pay: Safari pe iPhone / Mac; Google Pay: Chrome / Android).
 */
function useAvailableMethods(stripePromise, order, paypalClientId) {
    const [wallets, setWallets] = useState({ applePay: false, googlePay: false });

    useEffect(() => {
        let cancelled = false;
        stripePromise
            ?.then((stripe) =>
                stripe
                    ?.paymentRequest({
                        country: 'US',
                        currency: (order.currency || 'usd').toLowerCase(),
                        total: { label: 'RELOQ booking', amount: Math.round(order.totalAmount * 100) }
                    })
                    .canMakePayment()
            )
            .then((result) => {
                if (!cancelled && result) setWallets({ applePay: Boolean(result.applePay), googlePay: Boolean(result.googlePay) });
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [stripePromise, order.id, order.totalAmount, order.currency]);

    return [
        'card',
        ...(wallets.applePay ? ['applePay'] : []),
        ...(wallets.googlePay ? ['googlePay'] : []),
        'amazonPay',
        ...(paypalClientId ? ['paypal'] : [])
    ];
}

const MethodIcon = ({ method }) => {
    switch (method) {
        case 'card':
            return (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="1.8" />
                </svg>
            );
        case 'applePay':
            return <span className="pm-mark">Pay</span>;
        case 'googlePay':
            return <span className="pm-mark">G</span>;
        case 'amazonPay':
            return <span className="pm-mark">a</span>;
        case 'paypal':
            return <span className="pm-mark">P</span>;
        default:
            return null;
    }
}

const PaymentMethodPicker = ({ stripePromise, appearance, order, clientSecret, paypalClientId, onPaid, returnParam }) => {
    const methods = useAvailableMethods(stripePromise, order, paypalClientId);
    const [selected, setSelected] = useState('card');
    const active = methods.includes(selected) ? selected : 'card';

    // Elements „deferred”: noi alegem ce metode apar; confirmarea folosește PaymentIntent-ul comenzii.
    const elementsOptions = useMemo(
        () => ({
            mode: 'payment',
            amount: Math.round(order.totalAmount * 100),
            currency: (order.currency || 'usd').toLowerCase(),
            paymentMethodTypes: active === 'amazonPay' ? ['amazon_pay'] : ['card'],
            appearance
        }),
        [order.totalAmount, order.currency, active, appearance]
    );

    const panelProps = { order, clientSecret, onPaid, returnParam };

    return (
        <div className="pm-picker">
            <div className="pm-row" role="tablist" aria-label="Payment method">
                {methods.map((m) => (
                    <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={active === m}
                        className={`pm-chip ${m} ${active === m ? 'active' : ''}`}
                        onClick={() => setSelected(m)}
                    >
                        <MethodIcon method={m} />
                        <span>{METHOD_LABELS[m]}</span>
                    </button>
                ))}
            </div>

            <div className="pm-panel">
                {active === 'paypal' ? (
                    <PaypalButton order={order} clientId={paypalClientId} onPaid={onPaid} />
                ) : (
                    // key: un Elements nou la fiecare schimbare de metodă (alt set de metode permise)
                    <Elements key={active} stripe={stripePromise} options={elementsOptions}>
                        {active === 'card' ? <CardPanel {...panelProps} /> : <WalletPanel method={active} {...panelProps} />}
                    </Elements>
                )}
            </div>
        </div>
    );
};

export default PaymentMethodPicker;
