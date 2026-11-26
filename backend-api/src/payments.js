// Marcarea unei comenzi ca plătite — folosită de browser (confirm-payment), de webhook-ul Stripe
// și de plata PayPal. Fluxul RELOQ: plata la rezervare → comanda ajunge la dispecer ca „paid”
// (de confirmat) → clientul primește „Order submitted” → dispecerul apasă Confirm → confirmarea.
import { pool } from './db.js';
import { stripe } from './stripe.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL } from './orders.js';
import { notifyNewOrder, notifyOrderConfirmed } from './emails.js';
import { waitForMail } from './mailer.js';

async function loadOrderDto(id) {
    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.id = ?`, [id]);
    return rows[0] ? toOrderDto(rows[0], { includeCustomer: true }) : null;
}

/**
 * Trece comanda din `pending_payment` în `paid`. Doar primul apel reușit trimite emailurile
 * (browserul, webhook-ul și un dublu-click pot ajunge aproape simultan).
 * @param {{ method: 'stripe'|'paypal', last4?: string|null, paypalCaptureId?: string|null }} payment
 */
export async function markOrderPaid(orderId, payment) {
    const [result] = await pool.query(
        // Comenzile create de dispecer (created_by) sunt deja verificate: devin direct „confirmed”
        `UPDATE orders SET status = IF(created_by IS NULL, 'paid', 'confirmed'), paid_at = UTC_TIMESTAMP(), payment_method = ?, card_last4 = ?, paypal_capture_id = ?
         WHERE id = ? AND status = 'pending_payment'`,
        [payment.method, payment.last4 || null, payment.paypalCaptureId || null, orderId]
    );
    const justPaid = result.affectedRows === 1;
    const order = await loadOrderDto(orderId);

    if (justPaid) {
        // „Order submitted” către client + „New order to confirm” către dispecer.
        // Înainte de răspunsul HTTP — pe Hostinger orice lucru după răspuns e oprit.
        await waitForMail(order.createdBy ? notifyOrderConfirmed(order) : notifyNewOrder(order));
    }
    return { order, justPaid };
}

/**
 * Verifică PaymentIntent-ul direct la Stripe și, dacă e plătit integral, marchează comanda.
 * @returns {{ order: object|null, paymentStatus: string, justPaid: boolean }}
 */
export async function syncOrderPayment(paymentIntentId) {
    const [found] = await pool.query('SELECT id, total_cents FROM orders WHERE stripe_payment_intent_id = ?', [paymentIntentId]);
    const row = found[0];
    if (!row) return { order: null, paymentStatus: 'unknown', justPaid: false };

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    const paid = intent.status === 'succeeded' && intent.amount_received === row.total_cents;

    if (paid) {
        const last4 = intent.latest_charge?.payment_method_details?.card?.last4 || null;
        const { order, justPaid } = await markOrderPaid(row.id, { method: 'stripe', last4 });
        return { order, paymentStatus: intent.status, justPaid };
    }
    return { order: await loadOrderDto(row.id), paymentStatus: intent.status, justPaid: false };
}
