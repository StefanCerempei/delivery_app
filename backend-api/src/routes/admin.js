import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';
import { statusSchema, driverSchema, assignDriverSchema, parseBody } from '../validation.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL } from '../orders.js';
import { notifyStatusChange, notifyOrderConfirmed, notifyDriverAssigned, notifyDriverRemoved } from '../emails.js';
import { waitForMail } from '../mailer.js';

const router = Router();

const UNPAID_ONLINE_HIDDEN = "NOT (o.status = 'pending_payment' AND o.stripe_payment_intent_id IS NOT NULL)";
// Comenzi la care șoferul trebuie să se prezinte (primește emailul cu jobul doar pentru acestea).
const DRIVER_NOTIFY_STATUSES = ['confirmed', 'en_route'];
// Comenzi încă „pe drum” (contează ca joburi viitoare ale șoferului).
const UPCOMING_STATUSES = ['paid', 'confirmed', 'en_route'];

// Toate rutele de aici cer cont de dispecer, verificat pe server.
router.use(requireAdmin);

const loadOrder = async (code) => {
    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.code = ?`, [code]);
    return rows[0] ? toOrderDto(rows[0], { includeCustomer: true, includeDriver: true }) : null;
};

/* ---------------------------------- Comenzi ---------------------------------- */

router.get('/orders', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    // Comenzile cu plată online începută dar neterminată (coș abandonat) nu ajung la dispecer:
    // o comandă apare în dispecerat abia după ce transportul e plătit.
    const conditions = [UNPAID_ONLINE_HIDDEN];
    const params = [];
    if (status) {
        conditions.push('o.status = ?');
        params.push(status);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [rows] = await pool.query(
        `${ORDER_WITH_CUSTOMER_SQL} ${where} ORDER BY o.created_at DESC LIMIT 200`,
        params
    );
    res.json({ orders: rows.map((r) => toOrderDto(r, { includeCustomer: true, includeDriver: true })) });
});

router.get('/orders/:code', async (req, res) => {
    const order = await loadOrder(req.params.code);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order });
});

/** Verifică șoferul ales; întoarce mesajul de eroare sau null. */
async function driverProblem(driverId) {
    if (driverId == null) return null;
    const [rows] = await pool.query('SELECT active FROM drivers WHERE id = ?', [driverId]);
    if (!rows[0]) return 'This driver no longer exists.';
    if (!rows[0].active) return 'This driver is archived. Reactivate them on the Drivers page first.';
    return null;
}

/**
 * Emailurile către șoferi după o schimbare de șofer și/sau status:
 *   - șoferul vechi (înlocuit) → „job removed”; dacă comanda s-a anulat → „job cancelled”;
 *   - șoferul nou → „new job”, doar când comanda e confirmată / pe drum și nu l-a primit deja.
 */
async function sendDriverEmails(before, after, { resend = false } = {}) {
    const oldDriver = before.driver;
    const newDriver = after.driver;
    const changed = (oldDriver?.id || null) !== (newDriver?.id || null);
    const mails = [];

    if (oldDriver?.notifiedAt && changed && before.status !== 'cancelled') {
        mails.push(notifyDriverRemoved(after, oldDriver, { cancelled: after.status === 'cancelled' }));
    } else if (newDriver && after.status === 'cancelled' && before.status !== 'cancelled' && newDriver.notifiedAt) {
        mails.push(notifyDriverRemoved(after, newDriver, { cancelled: true }));
    }

    const shouldNotify =
        newDriver && DRIVER_NOTIFY_STATUSES.includes(after.status) && (changed || resend || !newDriver.notifiedAt);
    if (shouldNotify) {
        mails.push(
            notifyDriverAssigned(after).then(async (sent) => {
                if (sent) await pool.query('UPDATE orders SET driver_notified_at = NOW() WHERE code = ?', [after.id]);
                return sent;
            })
        );
    }
    return { mails, driverNotified: Boolean(shouldNotify) };
}

router.patch('/orders/:code/status', async (req, res) => {
    const data = parseBody(statusSchema, req, res);
    if (!data) return;

    const [raw] = await pool.query('SELECT status, stripe_payment_intent_id FROM orders WHERE code = ?', [req.params.code]);
    if (!raw[0]) return res.status(404).json({ error: 'Order not found.' });

    // O comandă cu plată online se confirmă doar după ce transportul a fost plătit.
    if (data.status === 'confirmed' && raw[0].status === 'pending_payment' && raw[0].stripe_payment_intent_id) {
        return res.status(409).json({ error: 'This order has not been paid yet. It can be confirmed after the online payment goes through.' });
    }

    const problem = await driverProblem(data.driverId);
    if (problem) return res.status(409).json({ error: problem });

    const before = await loadOrder(req.params.code);

    if (data.driverId !== undefined && data.driverId !== (before.driver?.id ?? null)) {
        await pool.query('UPDATE orders SET status = ?, driver_id = ?, driver_notified_at = NULL WHERE code = ?', [
            data.status,
            data.driverId,
            req.params.code
        ]);
    } else {
        await pool.query('UPDATE orders SET status = ? WHERE code = ?', [data.status, req.params.code]);
    }

    let order = await loadOrder(req.params.code);
    const mails = [];

    // Emailul către client pleacă doar la o schimbare reală de status (nu la dublu-click)
    if (before.status !== data.status) {
        // Când dispecerul acceptă comanda („confirmed”), clientul primește emailul de confirmare.
        mails.push(data.status === 'confirmed' ? notifyOrderConfirmed(order) : notifyStatusChange(order));
    }
    const driverMails = await sendDriverEmails(before, order);
    mails.push(...driverMails.mails);

    // Pe Hostinger emailurile trebuie trimise înainte de răspuns
    await waitForMail(Promise.all(mails));
    if (driverMails.driverNotified) order = await loadOrder(req.params.code);

    res.json({ order });
});

/** Alocă / schimbă / scoate șoferul unei comenzi (fără să schimbe statusul). */
router.patch('/orders/:code/driver', async (req, res) => {
    const data = parseBody(assignDriverSchema, req, res);
    if (!data) return;

    const before = await loadOrder(req.params.code);
    if (!before) return res.status(404).json({ error: 'Order not found.' });

    const problem = await driverProblem(data.driverId);
    if (problem) return res.status(409).json({ error: problem });

    if (data.driverId !== (before.driver?.id ?? null)) {
        await pool.query('UPDATE orders SET driver_id = ?, driver_notified_at = NULL WHERE code = ?', [data.driverId, req.params.code]);
    }

    let order = await loadOrder(req.params.code);
    const { mails, driverNotified } = await sendDriverEmails(before, order, { resend: data.resend });
    await waitForMail(Promise.all(mails));
    if (driverNotified) order = await loadOrder(req.params.code);

    res.json({ order });
});

/* ---------------------------------- Șoferi ---------------------------------- */

const toDriverDto = (r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    notes: r.notes,
    active: Boolean(r.active),
    upcomingJobs: Number(r.upcoming_jobs || 0),
    completedJobs: Number(r.completed_jobs || 0),
    nextJob: r.next_job || null,
    createdAt: new Date(r.created_at).toISOString()
});

const DRIVERS_SQL = `
    SELECT d.*,
        (SELECT COUNT(*) FROM orders o WHERE o.driver_id = d.id AND o.status IN (${UPCOMING_STATUSES.map(() => '?').join(',')})) AS upcoming_jobs,
        (SELECT COUNT(*) FROM orders o WHERE o.driver_id = d.id AND o.status = 'completed') AS completed_jobs,
        (SELECT o.schedule_label FROM orders o
            WHERE o.driver_id = d.id AND o.status IN (${UPCOMING_STATUSES.map(() => '?').join(',')})
            ORDER BY o.scheduled_for IS NULL, o.scheduled_for ASC LIMIT 1) AS next_job
    FROM drivers d`;

const loadDriver = async (id) => {
    const [rows] = await pool.query(`${DRIVERS_SQL} WHERE d.id = ?`, [...UPCOMING_STATUSES, ...UPCOMING_STATUSES, id]);
    return rows[0] ? toDriverDto(rows[0]) : null;
};

router.get('/drivers', async (req, res) => {
    const [rows] = await pool.query(`${DRIVERS_SQL} ORDER BY d.active DESC, d.full_name ASC`, [
        ...UPCOMING_STATUSES,
        ...UPCOMING_STATUSES
    ]);
    res.json({ drivers: rows.map(toDriverDto) });
});

const duplicateEmail = (res) => res.status(409).json({ error: 'A driver with this email already exists.' });

router.post('/drivers', async (req, res) => {
    const data = parseBody(driverSchema, req, res);
    if (!data) return;
    try {
        const [result] = await pool.query(
            'INSERT INTO drivers (full_name, email, phone, notes, active) VALUES (?, ?, ?, ?, ?)',
            [data.fullName, data.email, data.phone, data.notes, data.active === false ? 0 : 1]
        );
        res.status(201).json({ driver: await loadDriver(result.insertId) });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return duplicateEmail(res);
        throw err;
    }
});

router.patch('/drivers/:id', async (req, res) => {
    const data = parseBody(driverSchema.partial(), req, res);
    if (!data) return;
    const id = Number(req.params.id);
    const existing = await loadDriver(id);
    if (!existing) return res.status(404).json({ error: 'Driver not found.' });

    if (data.active === false && existing.upcomingJobs > 0) {
        return res.status(409).json({
            error: `This driver has ${existing.upcomingJobs} upcoming job(s). Reassign them before archiving.`
        });
    }

    const columns = { fullName: 'full_name', email: 'email', phone: 'phone', notes: 'notes', active: 'active' };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(columns)) {
        if (data[key] !== undefined) {
            sets.push(`${column} = ?`);
            params.push(key === 'active' ? (data[key] ? 1 : 0) : data[key]);
        }
    }
    if (sets.length) {
        try {
            await pool.query(`UPDATE drivers SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return duplicateEmail(res);
            throw err;
        }
    }
    res.json({ driver: await loadDriver(id) });
});

/** Șterge șoferul; dacă are comenzi în istoric, doar îl arhivează (comenzile vechi îl păstrează). */
router.delete('/drivers/:id', async (req, res) => {
    const id = Number(req.params.id);
    const existing = await loadDriver(id);
    if (!existing) return res.status(404).json({ error: 'Driver not found.' });
    if (existing.upcomingJobs > 0) {
        return res.status(409).json({
            error: `This driver has ${existing.upcomingJobs} upcoming job(s). Reassign them first.`
        });
    }

    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM orders WHERE driver_id = ?', [id]);
    if (Number(total) > 0) {
        await pool.query('UPDATE drivers SET active = 0 WHERE id = ?', [id]);
        return res.json({ archived: true, driver: await loadDriver(id) });
    }
    await pool.query('DELETE FROM drivers WHERE id = ?', [id]);
    res.json({ deleted: true });
});

export default router;
