// Coduri de discount: create de dispecer, procent din prețul plătit la rezervare (manopera rămâne întreagă).
// Fiecare client poate folosi un cod o singură dată (comenzile anulate sau neplătite nu se numără).
import { pool } from './db.js';

export const normalizeCode = (code) => String(code || '').trim().toUpperCase().replace(/\s+/g, '');

/** Reducerea în cenți pentru un total și un procent. */
export const discountCents = (totalCents, percent) => Math.round((Number(totalCents) * Number(percent || 0)) / 100);

/** Verifică un cod pentru un client: { code, percent } sau { error }. */
export async function checkDiscount(rawCode, userId) {
    const code = normalizeCode(rawCode);
    if (!code) return { error: 'Please enter a discount code.' };
    const [[row]] = await pool.query('SELECT code, percent, active FROM discount_codes WHERE code = ?', [code]);
    if (!row || !row.active) return { error: 'This discount code is not valid.' };
    const [[used]] = await pool.query(
        "SELECT 1 AS used FROM orders WHERE user_id = ? AND discount_code = ? AND status NOT IN ('cancelled', 'pending_payment') LIMIT 1",
        [userId, code]
    );
    if (used) return { error: 'You have already used this discount code.' };
    return { code: row.code, percent: Number(row.percent) };
}

/** Lista pentru dispecerat, cu numărul de folosiri (comenzi plătite / confirmate). */
export async function listDiscounts() {
    const [rows] = await pool.query(
        `SELECT d.id, d.code, d.percent, d.active, d.note, d.created_at,
                (SELECT COUNT(*) FROM orders o WHERE o.discount_code = d.code AND o.status NOT IN ('cancelled', 'pending_payment')) AS uses,
                (SELECT COALESCE(SUM(o.discount_cents), 0) FROM orders o WHERE o.discount_code = d.code AND o.status NOT IN ('cancelled', 'pending_payment')) AS discount_cents
         FROM discount_codes d ORDER BY d.created_at DESC`
    );
    return rows.map((r) => ({
        id: r.id,
        code: r.code,
        percent: Number(r.percent),
        active: Boolean(r.active),
        note: r.note || '',
        createdAt: new Date(r.created_at).toISOString(),
        uses: Number(r.uses),
        discountTotal: Number(r.discount_cents) / 100
    }));
}
