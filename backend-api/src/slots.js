// O singură comandă pe fereastră de sosire (zi + oră). O fereastră e ocupată de:
//   - comenzile plătite / confirmate / pe drum / finalizate;
//   - comenzile fără plată online (când plățile sunt oprite) — sunt rezervări reale;
//   - comenzile la plată de cel mult HOLD_MINUTES (clientul e în pasul de plată).
// Comenzile anulate și coșurile abandonate (plată neterminată, mai vechi de HOLD_MINUTES) eliberează ora.
import { pool } from './db.js';
import { stripe } from './stripe.js';

export const HOLD_MINUTES = 20;
// Ferestrele de sosire (ora de start), aceleași ca în validation.js / pasul de rezervare
export const ALL_SLOTS = ['07:00', '09:00', '11:00', '13:00', '15:00'];

/** Ore / zile blocate de dispecer, ca { 'YYYY-MM-DD': { '09:00': 'motiv', '*': 'motiv' } }. */
export async function blockedSlots(fromDate, toDate) {
    const [rows] = await pool.query(
        "SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, slot, reason FROM blocked_slots WHERE day BETWEEN ? AND ?",
        [fromDate, toDate]
    );
    const out = {};
    for (const r of rows) (out[r.day] ||= {})[r.slot] = r.reason || '';
    return out;
}

/** Fereastra `scheduledFor` („YYYY-MM-DD HH:MM:00”) e blocată de dispecer? */
export async function isBlocked(scheduledFor) {
    const [day, time] = String(scheduledFor).split(' ');
    const [rows] = await pool.query('SELECT 1 FROM blocked_slots WHERE day = ? AND slot IN (?, ?) LIMIT 1', [day, time.slice(0, 5), '*']);
    return rows.length > 0;
}

const BLOCKING_SQL = `(
    o.status IN ('paid', 'confirmed', 'en_route', 'completed')
    OR (o.status = 'pending_payment' AND (
        (o.stripe_payment_intent_id IS NULL AND o.paypal_order_id IS NULL)
        OR o.created_at > NOW() - INTERVAL ${HOLD_MINUTES} MINUTE
    ))
)`;

const slotOf = (scheduledFor) => {
    const d = scheduledFor instanceof Date ? scheduledFor : new Date(`${String(scheduledFor).replace(' ', 'T')}Z`);
    return d.toISOString().slice(11, 16); // „09:00”
};
const dateOf = (scheduledFor) => {
    const d = scheduledFor instanceof Date ? scheduledFor : new Date(`${String(scheduledFor).replace(' ', 'T')}Z`);
    return d.toISOString().slice(0, 10);
};

/**
 * Ferestrele ocupate între două date (inclusiv), ca { 'YYYY-MM-DD': ['09:00', ...] }.
 * `exceptUserId`: comenzile neplătite ale acestui client nu îi blochează lui ora (le înlocuiește la rezervare).
 */
export async function takenSlots(fromDate, toDate, { exceptUserId = null } = {}) {
    const params = [`${fromDate} 00:00:00`, `${toDate} 23:59:59`];
    let own = '';
    if (exceptUserId) {
        own = " AND NOT (o.user_id = ? AND o.status = 'pending_payment')";
        params.push(exceptUserId);
    }
    const [rows] = await pool.query(
        `SELECT o.scheduled_for FROM orders o
         WHERE o.scheduled_for BETWEEN ? AND ? AND ${BLOCKING_SQL}${own}`,
        params
    );
    const taken = {};
    for (const r of rows) {
        if (!r.scheduled_for) continue;
        const day = dateOf(r.scheduled_for);
        (taken[day] ||= []).push(slotOf(r.scheduled_for));
    }
    // Orele și zilele blocate de dispecer nu se pot rezerva, la fel ca cele ocupate
    const blocked = await blockedSlots(fromDate, toDate);
    for (const [day, slots] of Object.entries(blocked)) {
        const list = '*' in slots ? ALL_SLOTS : Object.keys(slots);
        (taken[day] ||= []).push(...list);
    }
    for (const day of Object.keys(taken)) taken[day] = [...new Set(taken[day])].sort();
    return taken;
}

/** Anulează plata Stripe a unei comenzi abandonate, ca să nu mai poată fi plătită după ce ora a fost dată altcuiva. */
async function cancelIntent(intentId) {
    if (!stripe || !intentId) return;
    await stripe.paymentIntents.cancel(intentId).catch((err) => {
        // Deja anulat / plătit / expirat: nu e nimic de făcut.
        console.warn(`[reloq] Nu am putut anula PaymentIntent ${intentId}: ${err.message}`);
    });
}

/**
 * Rezervă fereastra `scheduledFor` („YYYY-MM-DD HH:MM:00”) și rulează `insert(conn)` cât timp e blocată,
 * ca două rezervări simultane pentru aceeași oră să nu treacă amândouă.
 * @returns {Promise<boolean>} false dacă ora e deja luată
 */
export async function withSlot(scheduledFor, userId, insert) {
    const conn = await pool.getConnection();
    const lockName = `reloq-slot-${scheduledFor}`;
    try {
        const [[{ got }]] = await conn.query('SELECT GET_LOCK(?, 10) AS got', [lockName]);
        if (got !== 1) throw new Error('Could not lock the arrival window. Please try again.');
        try {
            const [busy] = await conn.query(
                `SELECT o.id FROM orders o
                 WHERE o.scheduled_for = ? AND ${BLOCKING_SQL}
                   AND NOT (o.user_id = ? AND o.status = 'pending_payment')
                 LIMIT 1`,
                [scheduledFor, userId]
            );
            if (busy.length) return false;

            // Ce mai e la plată pe ora asta nu mai blochează (abandonat sau al aceluiași client):
            // se anulează, ca plata veche să nu mai poată trece după ce ora e a noii comenzi.
            const [stale] = await conn.query(
                `SELECT id, stripe_payment_intent_id FROM orders
                 WHERE scheduled_for = ? AND status = 'pending_payment'`,
                [scheduledFor]
            );
            if (stale.length) {
                await conn.query(
                    `UPDATE orders SET status = 'cancelled' WHERE id IN (?) AND status = 'pending_payment'`,
                    [stale.map((s) => s.id)]
                );
            }

            await insert(conn);
            await Promise.all(stale.map((s) => cancelIntent(s.stripe_payment_intent_id)));
            return true;
        } finally {
            await conn.query('SELECT RELEASE_LOCK(?)', [lockName]);
        }
    } finally {
        conn.release();
    }
}

/** Altă comandă (activă) ocupă deja fereastra? Folosit când dispecerul reactivează o comandă anulată. */
export async function slotTakenByOther(orderId, scheduledFor) {
    if (!scheduledFor) return false;
    const [rows] = await pool.query(
        `SELECT o.code FROM orders o WHERE o.scheduled_for = ? AND o.id <> ? AND ${BLOCKING_SQL} LIMIT 1`,
        [scheduledFor, orderId]
    );
    return rows[0]?.code || false;
}
