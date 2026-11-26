// Linkul de plată pentru comenzile create de dispecer (clienți la telefon): o pagină Stripe Checkout
// pentru prețul rezervării. Plata e confirmată de webhook (payment_intent.succeeded) sau la întoarcerea
// clientului pe pagina /payment-complete (verificarea sesiunii).
import { pool } from './db.js';
import { stripe } from './stripe.js';
import { config } from './config.js';
import { mailSettings } from './mailer.js';
import { VEHICLES } from './pricing.js';
import { syncOrderPayment } from './payments.js';

const appBase = (fallback) => mailSettings.appUrl || fallback || '';

/** Creează (sau recreează, dacă a expirat) sesiunea Stripe Checkout pentru o comandă neplătită. */
export async function createPaymentLink(orderId, { base } = {}) {
    if (!stripe) return { error: 'Online payments are not enabled.', status: 400 };
    const [[row]] = await pool.query(
        `SELECT o.id, o.code, o.status, o.total_cents, o.currency, o.vehicle, o.schedule_label, o.user_id,
                o.checkout_session_id, o.payment_link_url, o.payment_link_expires_at, u.email, u.stripe_customer_id
         FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
        [orderId]
    );
    if (!row) return { error: 'Order not found.', status: 404 };
    if (row.status !== 'pending_payment') return { error: 'This order is not waiting for payment.', status: 409 };

    // Linkul existent e încă valabil (mai mult de o oră): îl refolosim
    if (row.payment_link_url && row.payment_link_expires_at && new Date(row.payment_link_expires_at).getTime() - Date.now() > 3600e3) {
        return { url: row.payment_link_url, expiresAt: new Date(row.payment_link_expires_at).toISOString() };
    }
    if (row.checkout_session_id) await stripe.checkout.sessions.expire(row.checkout_session_id).catch(() => {});

    const root = appBase(base);
    const name = `RELOQ ${VEHICLES[row.vehicle]?.name || 'move'} — ${row.code}`;
    const session = await stripe.checkout.sessions.create(
        {
            mode: 'payment',
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency: row.currency || config.currency,
                        unit_amount: row.total_cents,
                        product_data: { name, description: `Booking price (reservation, service and transportation). ${row.schedule_label || ''}`.trim() }
                    }
                }
            ],
            ...(row.stripe_customer_id ? { customer: row.stripe_customer_id } : { customer_email: row.email }),
            payment_method_types: ['card'],
            payment_intent_data: {
                description: name,
                metadata: { order_code: row.code, order_id: row.id, user_id: String(row.user_id), source: 'payment_link' }
            },
            metadata: { order_code: row.code, order_id: row.id },
            success_url: `${root}/payment-complete?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${root}/payment-complete?cancelled=1&order=${encodeURIComponent(row.code)}`,
            expires_at: Math.floor(Date.now() / 1000) + 23.5 * 3600
        },
        { idempotencyKey: `paylink-${row.id}-${row.total_cents}-${Date.now() - (Date.now() % 60000)}` }
    );
    const expiresAt = new Date(session.expires_at * 1000);
    await pool.query('UPDATE orders SET checkout_session_id = ?, payment_link_url = ?, payment_link_expires_at = ? WHERE id = ?', [
        session.id,
        session.url,
        expiresAt,
        row.id
    ]);
    return { url: session.url, expiresAt: expiresAt.toISOString() };
}

/**
 * O plată venită prin link: PaymentIntent-ul nu era cunoscut la crearea comenzii, așa că îl legăm
 * de comandă după metadata (doar dacă suma e exact prețul comenzii), apoi marcăm plata.
 */
export async function linkIntentToOrder(intent) {
    const orderId = intent?.metadata?.order_id;
    if (!orderId || intent.metadata?.source !== 'payment_link') return null;
    await pool.query(
        "UPDATE orders SET stripe_payment_intent_id = ? WHERE id = ? AND stripe_payment_intent_id IS NULL AND status = 'pending_payment'",
        [intent.id, orderId]
    );
    return syncOrderPayment(intent.id);
}

/** Întoarcerea de pe Stripe Checkout: verificăm sesiunea și marcăm plata (dacă webhook-ul n-a făcut-o deja). */
export async function completeCheckout(sessionId) {
    if (!stripe) return { error: 'Online payments are not enabled.', status: 400 };
    const session = await stripe.checkout.sessions.retrieve(String(sessionId), { expand: ['payment_intent'] }).catch(() => null);
    if (!session) return { error: 'Payment session not found.', status: 404 };
    const intent = session.payment_intent;
    const code = session.metadata?.order_code || null;
    if (session.payment_status !== 'paid' || !intent) return { paid: false, orderCode: code };
    const result = await linkIntentToOrder(typeof intent === 'string' ? await stripe.paymentIntents.retrieve(intent) : intent);
    return { paid: Boolean(result?.order?.paidOnline), orderCode: code, schedule: result?.order?.scheduleText || null };
}
