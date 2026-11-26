// Jurnalul modificărilor unei comenzi (specificația RELOQ, secțiunea 10).
// Fiecare schimbare făcută de dispecer: câmpul, valoarea veche, valoarea nouă, cine, motivul și ora.
import { pool } from './db.js';

const asText = (v) => {
    if (v === undefined || v === null || v === '') return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v).slice(0, 2000);
};

/**
 * entries: [{ field, oldValue, newValue }] — se salvează doar cele care chiar s-au schimbat.
 * actor: req.user (dispecerul); reason: text opțional.
 */
export async function logChanges(orderId, entries, { actor = null, reason = null } = {}) {
    const rows = entries
        .map((e) => [e.field, asText(e.oldValue), asText(e.newValue)])
        .filter(([, o, n]) => o !== n);
    if (!rows.length) return;
    try {
        await pool.query(
            'INSERT INTO order_changes (order_id, field, old_value, new_value, reason, actor_id, actor_name) VALUES ?',
            [rows.map(([field, o, n]) => [orderId, field, o, n, reason ? String(reason).slice(0, 300) : null, actor?.id || null, actor?.fullName || actor?.email || null])]
        );
    } catch (err) {
        // jurnalul nu trebuie să blocheze lucrul dispecerului
        console.warn(`[reloq] Jurnalul comenzii ${orderId} nu a putut fi salvat: ${err.message}`);
    }
}

/** Istoricul unei comenzi, cel mai nou primul. */
export async function orderHistory(orderId) {
    const [rows] = await pool.query(
        'SELECT field, old_value, new_value, reason, actor_name, created_at FROM order_changes WHERE order_id = ? ORDER BY id DESC LIMIT 200',
        [orderId]
    );
    return rows.map((r) => ({
        field: r.field,
        oldValue: r.old_value,
        newValue: r.new_value,
        reason: r.reason,
        actor: r.actor_name,
        at: new Date(r.created_at).toISOString()
    }));
}
