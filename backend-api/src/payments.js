// Marcarea unei comenzi ca plătite — folosită și de browser (confirm-payment), și de webhook-ul Stripe.
// Fluxul RELOQ: plata online (transportul) → comanda ajunge la dispecer ca „paid” (de confirmat)
// → clientul primește „Order submitted” → dispecerul apasă Confirm → clientul primește confirmarea.
import { pool } from './db.js';
import { stripe } from './stripe.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL } from './orders.js';
import { notifyNewOrder } from './emails.js';
import { waitForMail } from './mailer.js';

/**
 * Verifică PaymentIntent-ul direct la Stripe și, dacă e plătit integral, trece comanda
 * din `pending_payment` în `paid`. Doar primul apel care reușește trimite emailurile
 * (browserul și webhook-ul pot ajunge aproape simultan).
 *
 * @returns {{ order: object|null, paymentStatus: string, justPaid: boolean }}
 */
export async function syncOrderPayment(paymentIntentId) {
    const [found] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.stripe_payment_intent_id = ?`, [paymentIntentId]);
    const row = found[0];
    if (!row) return { order: null, paymentStatus: 'unknown', justPaid: false };

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    const paid = intent.status === 'succeeded' && intent.amount_received === row.total_cents;

    let justPaid = false;
    if (paid) {
        const last4 = intent.latest_charge?.payment_method_details?.card?.last4 || null;
        const [result] = await pool.query(
            "UPDATE orders SET status = 'paid', paid_at = UTC_TIMESTAMP(), card_last4 = ? WHERE id = ? AND status = 'pending_payment'",
            [last4, row.id]
        );
        justPaid = result.affectedRows === 1;
    }

    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.id = ?`, [row.id]);
    const order = toOrderDto(rows[0], { includeCustomer: true });

    if (justPaid) {
        // „Order submitted” către client + „New order to confirm” către dispecer.
        // Înainte de răspunsul HTTP — pe Hostinger orice lucru după răspuns e oprit.
        await waitForMail(notifyNewOrder(order));
    }
    return { order, paymentStatus: intent.status, justPaid };
}
