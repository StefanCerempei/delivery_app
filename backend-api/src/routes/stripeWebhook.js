// POST /api/stripe/webhook — Stripe anunță serverul când o plată reușește.
// Necesar pentru că clientul poate închide tab-ul imediat după plată (sau metodele cu redirect
// îl duc pe altă pagină), caz în care browserul nu mai cheamă /confirm-payment.
//
// Setup: Stripe Dashboard → Developers → Webhooks → Add endpoint
//   URL:    https://app.reloqmove.com/api/stripe/webhook
//   Events: payment_intent.succeeded
// Apoi „Signing secret” (whsec_…) → variabila STRIPE_WEBHOOK_SECRET pe Hostinger.
import express, { Router } from 'express';
import { stripe } from '../stripe.js';
import { config } from '../config.js';
import { syncOrderPayment } from '../payments.js';
import { syncLaborPayment } from '../labor.js';

const router = Router();

// Semnătura se verifică pe corpul brut, deci ruta NU trece prin express.json().
router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (!stripe || !config.stripeWebhookSecret) {
        return res.status(503).json({ error: 'Stripe webhook is not configured.' });
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripeWebhookSecret);
    } catch (err) {
        console.warn(`[reloq] Webhook Stripe respins: ${String(err.message).split('\n')[0]}`);
        return res.status(400).json({ error: 'Invalid signature.' });
    }

    try {
        if (event.type === 'payment_intent.succeeded' && event.data.object.metadata?.kind === 'labor') {
            // Plata manoperei după job
            const { order, paid } = await syncLaborPayment(event.data.object.id);
            if (order && paid) console.log(`[reloq] Webhook: manopera comenzii ${order.id} plătită.`);
        } else if (event.type === 'payment_intent.succeeded') {
            const { order, justPaid } = await syncOrderPayment(event.data.object.id);
            if (!order) {
                console.warn(`[reloq] Webhook: nicio comandă pentru ${event.data.object.id}`);
            } else if (justPaid) {
                console.log(`[reloq] Webhook: comanda ${order.id} marcată ca plătită.`);
            }
        }
        // Tot lucrul se face înainte de răspuns (pe Hostinger procesul e înghețat după răspuns).
        res.json({ received: true });
    } catch (err) {
        // 500 → Stripe reîncearcă automat mai târziu.
        console.error(`[reloq] Webhook ${event.type} eșuat:`, err.message);
        res.status(500).json({ error: 'Webhook handler failed.' });
    }
});

export default router;
