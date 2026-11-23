import { loadStripe } from '@stripe/stripe-js';

// Stripe se încarcă o singură dată pentru toată aplicația (rezervare + plata manoperei din cont).
const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
export const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

// Formularul Stripe preia aspectul aplicației.
export const stripeAppearance = {
    theme: 'night',
    variables: {
        colorPrimary: '#ff3f34',
        colorBackground: '#141c2a',
        colorText: '#f1f4f8',
        colorTextSecondary: '#8a949e',
        colorDanger: '#ff7a7a',
        borderRadius: '12px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        spacingUnit: '4px'
    },
    rules: {
        '.Input': { border: '1px solid rgba(255,255,255,0.13)', boxShadow: 'none' },
        '.Input:focus': { border: '1px solid #ff3f34', boxShadow: '0 0 0 4px rgba(255,63,52,0.14)' }
    }
};
