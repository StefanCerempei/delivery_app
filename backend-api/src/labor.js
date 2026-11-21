// Plata manoperei după job.
// Stări (orders.labor_status):
//   none           — jobul nu e gata sau nu există timp măsurat
//   pending_review — jobul s-a terminat; dispecerul verifică timpul înainte de cerere
//   requested      — clientul a primit cererea de plată (email + în cont)
//   paid           — plătit online (Stripe)
//   paid_cash      — plătit cash (bifat de șofer sau de dispecer)
//   waived         — fără taxă de manoperă (decizia dispecerului)
import { pool } from './db.js';
import { stripe } from './stripe.js';
import { config } from './config.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL, laborActual } from './orders.js';
import { getSetting } from './settings.js';
import { notifyLaborPaymentRequest, notifyLaborPaid } from './emails.js';
import { waitForMail } from './mailer.js';

export const UNPAID_LABOR = ['pending_review', 'requested'];

async function loadRow(code) {
    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.code = ?`, [code]);
    return rows[0] || null;
}
const dto = (row) => toOrderDto(row, { includeCustomer: true, includeDriver: true });

/** Suma de manoperă în cenți, din timpul final (măsurat sau corectat de dispecer). */
function laborCents(row) {
    const l = laborActual(row);
    return l ? Math.round(l.amount * 100) : null;
}

/** Anulează plata Stripe pregătită pentru manoperă (ex. suma s-a schimbat sau s-a plătit cash). */
async function cancelLaborIntent(row) {
    if (!stripe || !row.labor_payment_intent_id) return;
    await stripe.paymentIntents.cancel(row.labor_payment_intent_id).catch(() => {});
    await pool.query('UPDATE orders SET labor_payment_intent_id = NULL WHERE id = ?', [row.id]);
}

/** Trimite clientului cererea de plată (status → requested). */
export async function requestLaborPayment(code) {
    const row = await loadRow(code);
    if (!row) return { error: 'Order not found.', status: 404 };
    if (row.status !== 'completed') return { error: 'The job has to be completed first.', status: 409 };
    const amount = laborCents(row);
    if (!amount) return { error: 'There is no labor time for this job yet. Enter the minutes first.', status: 409 };
    if (!['none', 'pending_review', 'requested'].includes(row.labor_status)) {
        return { error: 'Labor for this job is already settled.', status: 409 };
    }
    if (row.labor_cents !== amount) await cancelLaborIntent(row);
    await pool.query(
        "UPDATE orders SET labor_status = 'requested', labor_cents = ?, labor_requested_at = UTC_TIMESTAMP() WHERE id = ?",
        [amount, row.id]
    );
    const order = dto(await loadRow(code));
    await waitForMail(notifyLaborPaymentRequest(order));
    return { order };
}

/**
 * La finalul jobului (șoferul apasă Stop sau dispecerul pune „Completed”): calculează manopera și,
 * după setare, trimite imediat cererea de plată sau o lasă la verificarea dispecerului.
 */
export async function onJobCompleted(code) {
    const row = await loadRow(code);
    if (!row || row.status !== 'completed' || row.labor_status !== 'none') return;
    const amount = laborCents(row);
    if (!amount) return; // fără timp măsurat: dispecerul introduce minutele
    await pool.query("UPDATE orders SET labor_status = 'pending_review', labor_cents = ? WHERE id = ? AND labor_status = 'none'", [
        amount,
        row.id
    ]);
    if ((await getSetting('labor_auto_request')) === 'true') await requestLaborPayment(code);
}

/** Plătit cash (șofer sau dispecer). */
export async function markLaborCash(code) {
    const row = await loadRow(code);
    if (!row) return { error: 'Order not found.', status: 404 };
    if (!['none', ...UNPAID_LABOR].includes(row.labor_status) || row.status !== 'completed') {
        return { error: 'Labor for this job is already settled.', status: 409 };
    }
    await cancelLaborIntent(row);
    await pool.query(
        "UPDATE orders SET labor_status = 'paid_cash', labor_cents = COALESCE(?, labor_cents), labor_paid_at = UTC_TIMESTAMP(), labor_payment_method = 'cash' WHERE id = ?",
        [laborCents(row), row.id]
    );
    return { order: dto(await loadRow(code)) };
}

export async function waiveLabor(code) {
    const row = await loadRow(code);
    if (!row) return { error: 'Order not found.', status: 404 };
    if (!['none', ...UNPAID_LABOR].includes(row.labor_status)) return { error: 'Labor for this job is already settled.', status: 409 };
    await cancelLaborIntent(row);
    await pool.query("UPDATE orders SET labor_status = 'waived', labor_cents = 0 WHERE id = ?", [row.id]);
    return { order: dto(await loadRow(code)) };
}

/** Redeschide (ex. „cash” bifat din greșeală) — înapoi la verificare. Nu se aplică plăților online. */
export async function reopenLabor(code) {
    const row = await loadRow(code);
    if (!row) return { error: 'Order not found.', status: 404 };
    if (!['paid_cash', 'waived'].includes(row.labor_status)) return { error: 'Only cash or waived labor can be reopened.', status: 409 };
    await pool.query(
        "UPDATE orders SET labor_status = 'pending_review', labor_cents = ?, labor_paid_at = NULL, labor_payment_method = NULL WHERE id = ?",
        [laborCents(row), row.id]
    );
    return { order: dto(await loadRow(code)) };
}

/** Dispecerul corectează minutele (null = revine la timpul măsurat). */
export async function setLaborMinutes(code, minutes) {
    const row = await loadRow(code);
    if (!row) return { error: 'Order not found.', status: 404 };
    if (!['none', ...UNPAID_LABOR].includes(row.labor_status)) return { error: 'Labor for this job is already settled.', status: 409 };
    await pool.query('UPDATE orders SET labor_minutes_override = ? WHERE id = ?', [minutes, row.id]);
    const updated = await loadRow(code);
    const amount = laborCents(updated);
    if (row.labor_status !== 'none') {
        if (amount !== row.labor_cents) await cancelLaborIntent(updated);
        await pool.query('UPDATE orders SET labor_cents = ? WHERE id = ?', [amount, row.id]);
    } else if (updated.status === 'completed' && amount) {
        await pool.query("UPDATE orders SET labor_status = 'pending_review', labor_cents = ? WHERE id = ?", [amount, row.id]);
    }
    return { order: dto(await loadRow(code)) };
}

/** Plata online a clientului: PaymentIntent pentru suma cerută (refolosit dacă suma e aceeași). */
export async function laborPaymentIntent(row, email) {
    if (!stripe) return { error: 'Online payments are not enabled.', status: 400 };
    if (row.labor_status !== 'requested' || !row.labor_cents) return { error: 'There is no labor payment due for this booking.', status: 409 };
    if (row.labor_payment_intent_id) {
        const existing = await stripe.paymentIntents.retrieve(row.labor_payment_intent_id).catch(() => null);
        if (existing && existing.amount === row.labor_cents && !['canceled', 'succeeded'].includes(existing.status)) {
            return { clientSecret: existing.client_secret };
        }
    }
    const intent = await stripe.paymentIntents.create({
        amount: row.labor_cents,
        currency: config.currency,
        // card include Apple Pay și Google Pay; fără metode cu redirect (Amazon Pay) pentru această plată
        payment_method_types: ['card'],
        receipt_email: email,
        description: `RELOQ labor — ${row.code}`,
        metadata: { kind: 'labor', order_code: row.code, order_id: row.id }
    });
    await pool.query('UPDATE orders SET labor_payment_intent_id = ? WHERE id = ?', [intent.id, row.id]);
    return { clientSecret: intent.client_secret };
}

/** Verifică plata manoperei la Stripe și o marchează (browser + webhook; doar primul apel trimite emailul). */
export async function syncLaborPayment(paymentIntentId) {
    const [found] = await pool.query('SELECT code, labor_cents FROM orders WHERE labor_payment_intent_id = ?', [paymentIntentId]);
    if (!found[0]) return { order: null, paid: false };
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const paid = intent.status === 'succeeded' && intent.amount_received === found[0].labor_cents;
    if (paid) {
        const [result] = await pool.query(
            "UPDATE orders SET labor_status = 'paid', labor_paid_at = UTC_TIMESTAMP(), labor_payment_method = 'stripe' WHERE labor_payment_intent_id = ? AND labor_status = 'requested'",
            [paymentIntentId]
        );
        const order = dto(await loadRow(found[0].code));
        if (result.affectedRows === 1) await waitForMail(notifyLaborPaid(order));
        return { order, paid: true, status: intent.status };
    }
    return { order: dto(await loadRow(found[0].code)), paid: false, status: intent.status };
}
