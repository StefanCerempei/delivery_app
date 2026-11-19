import React, { useEffect, useMemo, useState } from 'react';
import {
    CardCvcElement,
    CardExpiryElement,
    CardNumberElement,
    Elements,
    ExpressCheckoutElement,
    useElements,
    useStripe
} from '@stripe/react-stripe-js';
import { api } from '../api/client';
import { formatPrice } from '../utils/formatters';
import Button from './Button';
import PaypalButton from './PaypalButton';

/*
 * Rândul de metode de plată (cu swipe pe telefon): Card · Apple Pay · Google Pay · Amazon Pay · PayPal.
 * Formularul Stripe e un iframe pe care nu-l putem așeza noi, deci rândul e al nostru, iar dedesubt
 * se afișează doar plata metodei alese:
 *   - Card        → câmpurile Stripe doar pentru card (număr, expirare, CVC) — fără Link / Bank / Klarna;
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

// Stil pentru câmpurile de card (iframe Stripe) — aceleași culori ca restul formularului.
const CARD_FIELD_OPTIONS = {
    style: {
        base: {
            color: '#f1f4f8',
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            fontSize: '16px',
            '::placeholder': { color: '#6b7682' }
        },
        invalid: { color: '#ff7a7a', iconColor: '#ff7a7a' }
    }
};

/**
 * Plata cu cardul: câmpuri separate (număr / expirare / CVC), confirmate direct pe PaymentIntent.
 * Nu folosim Payment Element aici, ca să nu apară tab-urile Bank / Klarna sau Link.
 */
const CardPanel = ({ order, clientSecret, onPaid }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [error, setError] = useState('');
    const [isPaying, setIsPaying] = useState(false);

    const pay = async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setError('');
        setIsPaying(true);

        const { error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
            payment_method: { card: elements.getElement(CardNumberElement) }
        });
        if (stripeError) {
            setError(stripeError.message || 'Your payment could not be processed.');
            setIsPaying(false);
            return;
        }

        try {
            const { order: updated } = await api.confirmPayment(order.id);
            onPaid(updated);
        } catch (err) {
            setError(err.message);
            setIsPaying(false);
        }
    };

    return (
        <form className="card-form" onSubmit={pay}>
            <label className="card-field card-field-full">
                <span>Card number</span>
                <div className="card-input">
                    <CardNumberElement options={{ ...CARD_FIELD_OPTIONS, showIcon: true, disableLink: true, placeholder: '1234 1234 1234 1234' }} />
                </div>
            </label>
            <label className="card-field">
                <span>Expiration date</span>
                <div className="card-input">
                    <CardExpiryElement options={CARD_FIELD_OPTIONS} />
                </div>
            </label>
            <label className="card-field">
                <span>Security code</span>
                <div className="card-input">
                    <CardCvcElement options={{ ...CARD_FIELD_OPTIONS, placeholder: 'CVC' }} />
                </div>
            </label>
            {error && <p className="form-inline-error card-field-full">{error}</p>}
            <div className="step-footer card-field-full">
                <Button type="submit" disabled={!stripe || !elements || isPaying}>
                    {isPaying ? 'Processing payment…' : `Pay ${formatPrice(order.totalAmount)}`}
                </Button>
            </div>
        </form>
    );
};

const WALLET_HELP = {
    applePay: 'Apple Pay works in Safari on an iPhone, iPad or Mac with a card added to Apple Wallet. Please choose Card or another method.',
    googlePay: 'Google Pay works in Chrome or on Android with a card saved to your Google account. Please choose Card or another method.',
    amazonPay: 'Amazon Pay couldn’t be loaded right now. Please choose Card or another method.'
};

/** Butonul Stripe pentru o singură metodă rapidă (Apple Pay, Google Pay sau Amazon Pay). */
const WalletPanel = ({ method, ...props }) => {
    const { pay, error, isPaying } = useConfirmPayment(props);
    // loading → ready (butonul e afișat) sau unavailable (metoda nu merge pe acest dispozitiv / browser)
    const [status, setStatus] = useState('loading');

    // Dacă Stripe nu afișează niciun buton (ex. Apple Pay pe Windows), uneori nu vine nici „ready”.
    useEffect(() => {
        const timer = setTimeout(() => setStatus((s) => (s === 'loading' ? 'unavailable' : s)), 8000);
        return () => clearTimeout(timer);
    }, [method]);


    const handleReady = ({ availablePaymentMethods }) => {
        const shown = availablePaymentMethods && (method === 'amazonPay' || availablePaymentMethods[method] !== false);
        setStatus(shown ? 'ready' : 'unavailable');
    };

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
            layout: { maxColumns: 1, maxRows: 1, overflow: 'auto' }
        }),
        [method]
    );

    return (
        <div className={`wallet-panel ${isPaying ? 'is-busy' : ''}`}>
            <ExpressCheckoutElement
                key={method}
                options={options}
                onConfirm={pay}
                onReady={handleReady}
                onLoadError={() => setStatus('unavailable')}
            />
            {status === 'loading' && <p className="trust-note">Loading {METHOD_LABELS[method]}…</p>}
            {status === 'unavailable' && (
                <div className="wallet-unavailable">
                    <strong>{METHOD_LABELS[method]} isn’t available here</strong>
                    <p>{WALLET_HELP[method]}</p>
                </div>
            )}
            {isPaying && <p className="trust-note">Completing your payment…</p>}
            {error && <p className="form-inline-error">{error}</p>}
        </div>
    );
};

/**
 * Metodele afișate: Card · Apple Pay · Google Pay · Amazon Pay (+ PayPal dacă e configurat), după dispozitiv:
 *   - Apple Pay doar pe dispozitive Apple (iPhone / iPad / Mac) — în altă parte nu poate funcționa;
 *   - Google Pay nu pe iPhone / iPad — acolo deschide un pop-up pe care Safari îl blochează (OR_BIBED_15).
 * Dacă metoda tot nu merge pe dispozitiv, panoul ei spune asta.
 */
function deviceKind() {
    const ua = navigator.userAgent || '';
    // iPadOS se prezintă ca „Macintosh”, dar are ecran tactil
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const isApple = isIOS || /Macintosh|Mac OS X/.test(ua);
    return { isIOS, isApple };
}

const methodsFor = (paypalClientId) => {
    const { isIOS, isApple } = deviceKind();
    return [
        'card',
        ...(isApple ? ['applePay'] : []),
        ...(!isIOS ? ['googlePay'] : []),
        'amazonPay',
        ...(paypalClientId ? ['paypal'] : [])
    ];
};

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
    const methods = useMemo(() => methodsFor(paypalClientId), [paypalClientId]);
    const [selected, setSelected] = useState('card');
    const active = methods.includes(selected) ? selected : 'card';

    // Card: Elements simplu (câmpuri de card). Portofele: Elements „deferred” cu metoda aleasă;
    // confirmarea folosește oricum PaymentIntent-ul comenzii (clientSecret).
    const elementsOptions = useMemo(
        () =>
            active === 'card'
                ? { appearance }
                : {
                      mode: 'payment',
                      amount: Math.round(order.totalAmount * 100),
                      currency: (order.currency || 'usd').toLowerCase(),
                      paymentMethodTypes: active === 'amazonPay' ? ['amazon_pay'] : ['card'],
                      appearance
                  },
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
