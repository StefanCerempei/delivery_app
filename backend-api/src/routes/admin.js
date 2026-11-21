import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';
import { statusSchema, driverSchema, assignDriverSchema, parseBody } from '../validation.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL, laborActual } from '../orders.js';
import { notifyStatusChange, notifyOrderConfirmed, notifyDriverAssigned, notifyDriverRemoved } from '../emails.js';
import { waitForMail } from '../mailer.js';
import { slotTakenByOther } from '../slots.js';
import { ensureDriverToken, jobUrl, stampStatus, sendDriverReminders, tomorrowDate } from '../jobs.js';
import { parseDateOnly } from '../time.js';
import { emailLoginLink } from './driverPortal.js';
import { revokeDriverSessions } from '../driverAuth.js';
import { getSettings, setSetting } from '../settings.js';
import { onJobCompleted, requestLaborPayment, markLaborCash, waiveLabor, reopenLabor, setLaborMinutes } from '../labor.js';

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
        after.jobUrl = jobUrl(await ensureDriverToken(after.id));
        mails.push(
            notifyDriverAssigned(after).then(async (sent) => {
                if (sent) await pool.query('UPDATE orders SET driver_notified_at = UTC_TIMESTAMP() WHERE code = ?', [after.id]);
                return sent;
            })
        );
    }
    return { mails, driverNotified: Boolean(shouldNotify) };
}

router.patch('/orders/:code/status', async (req, res) => {
    const data = parseBody(statusSchema, req, res);
    if (!data) return;

    const [raw] = await pool.query('SELECT id, status, scheduled_for, stripe_payment_intent_id FROM orders WHERE code = ?', [
        req.params.code
    ]);
    if (!raw[0]) return res.status(404).json({ error: 'Order not found.' });

    // O comandă cu plată online se confirmă doar după ce transportul a fost plătit.
    if (data.status === 'confirmed' && raw[0].status === 'pending_payment' && raw[0].stripe_payment_intent_id) {
        return res.status(409).json({ error: 'This order has not been paid yet. It can be confirmed after the online payment goes through.' });
    }

    // Reactivarea unei comenzi anulate: doar dacă ora ei nu a fost luată între timp de altă comandă.
    if (raw[0].status === 'cancelled' && data.status !== 'cancelled') {
        const other = await slotTakenByOther(raw[0].id, raw[0].scheduled_for);
        if (other) return res.status(409).json({ error: `This arrival window is now booked by order ${other}.` });
    }

    const problem = await driverProblem(data.driverId);
    if (problem) return res.status(409).json({ error: problem });

    const before = await loadOrder(req.params.code);

    if (data.driverId !== undefined && data.driverId !== (before.driver?.id ?? null)) {
        // Alt șofer → link de job nou (cel vechi nu mai merge)
        await pool.query('UPDATE orders SET status = ?, driver_id = ?, driver_notified_at = NULL, driver_token = NULL WHERE code = ?', [
            data.status,
            data.driverId,
            req.params.code
        ]);
    } else {
        await pool.query('UPDATE orders SET status = ? WHERE code = ?', [data.status, req.params.code]);
    }
    await stampStatus(req.params.code, data.status);
    if (data.status === 'completed' && before.status !== 'completed') await onJobCompleted(req.params.code);

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
        await pool.query('UPDATE orders SET driver_id = ?, driver_notified_at = NULL, driver_token = NULL WHERE code = ?', [
            data.driverId,
            req.params.code
        ]);
    }

    let order = await loadOrder(req.params.code);
    const { mails, driverNotified } = await sendDriverEmails(before, order, { resend: data.resend });
    await waitForMail(Promise.all(mails));
    if (driverNotified) order = await loadOrder(req.params.code);

    res.json({ order });
});

/**
 * POST /admin/orders/:code/labor { action, minutes }
 *   request — aprobă și trimite clientului cererea de plată (sau o retrimite)
 *   cash    — plătit cash   ·  waive — fără taxă  ·  reopen — anulează cash/waive
 *   minutes — corectează minutele (null = timpul măsurat)
 */
router.post('/orders/:code/labor', async (req, res) => {
    const { action } = req.body || {};
    let result;
    if (action === 'minutes') {
        const m = req.body.minutes;
        if (m !== null && !(Number.isInteger(m) && m >= 0 && m <= 24 * 60)) {
            return res.status(400).json({ error: 'Minutes must be a whole number between 0 and 1440.' });
        }
        result = await setLaborMinutes(req.params.code, m);
    } else if (action === 'request') result = await requestLaborPayment(req.params.code);
    else if (action === 'cash') result = await markLaborCash(req.params.code);
    else if (action === 'waive') result = await waiveLabor(req.params.code);
    else if (action === 'reopen') result = await reopenLabor(req.params.code);
    else return res.status(400).json({ error: 'Unknown action.' });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ order: await loadOrder(req.params.code) });
});

/** Notele interne ale dispecerului (apar și în emailurile către șofer). */
router.patch('/orders/:code/notes', async (req, res) => {
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 2000) : null;
    if (notes === null) return res.status(400).json({ error: 'Notes must be text.' });
    const [result] = await pool.query('UPDATE orders SET dispatch_notes = ? WHERE code = ?', [notes || null, req.params.code]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order: await loadOrder(req.params.code) });
});

/**
 * GET /admin/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD — comenzile programate în interval (calendarul).
 * Fără coșurile abandonate; cu cele anulate (calendarul le poate arăta tăiate).
 */
router.get('/schedule', async (req, res) => {
    const from = parseDateOnly(req.query.from);
    const to = parseDateOnly(req.query.to);
    if (!from || !to || to < from || (to - from) / 864e5 > 62) {
        return res.status(400).json({ error: 'Invalid date range.' });
    }
    const iso = (d) => d.toISOString().slice(0, 10);
    const [rows] = await pool.query(
        `${ORDER_WITH_CUSTOMER_SQL}
         WHERE o.scheduled_for BETWEEN ? AND ? AND ${UNPAID_ONLINE_HIDDEN}
         ORDER BY o.scheduled_for ASC`,
        [`${iso(from)} 00:00:00`, `${iso(to)} 23:59:59`]
    );
    res.json({ orders: rows.map((r) => toOrderDto(r, { includeCustomer: true, includeDriver: true })) });
});

/**
 * GET /admin/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD — venitul brut (înainte de taxe, plata șoferilor
 * și alte costuri), după ziua jobului. Intră comenzile plătite online sau confirmate, neanulate;
 * manopera intră când jobul are Arrived + Completed. Comenzile plătite și apoi anulate se arată separat.
 */
router.get('/revenue', async (req, res) => {
    const from = parseDateOnly(req.query.from);
    const to = parseDateOnly(req.query.to);
    if (!from || !to || to < from || (to - from) / 864e5 > 366) {
        return res.status(400).json({ error: 'Invalid date range (max 1 year).' });
    }
    const iso = (d) => d.toISOString().slice(0, 10);
    const [rows] = await pool.query(
        `${ORDER_WITH_CUSTOMER_SQL}
         WHERE o.scheduled_for BETWEEN ? AND ?
           AND (o.paid_at IS NOT NULL OR o.status IN ('paid', 'confirmed', 'en_route', 'completed'))
         ORDER BY o.scheduled_for ASC`,
        [`${iso(from)} 00:00:00`, `${iso(to)} 23:59:59`]
    );

    const c = (v) => Math.round(Number(v) || 0); // cenți
    const days = new Map();
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 864e5)) {
        days.set(iso(d), { date: iso(d), booking: 0, labor: 0, jobs: 0 });
    }
    const totals = {
        booking: 0, reservation: 0, service: 0, transportation: 0, other: 0, labor: 0,
        laborCollected: 0, laborOutstanding: 0, jobs: 0, completedJobs: 0, laborMinutes: 0, laborMissing: 0
    };
    const cancelledPaid = { count: 0, amount: 0 };
    const byVehicle = new Map();
    const byDriver = new Map();
    const orders = [];

    for (const r of rows) {
        if (r.status === 'cancelled') {
            if (r.paid_at) {
                cancelledPaid.count += 1;
                cancelledPaid.amount += c(r.total_cents);
            }
            continue;
        }
        const booking = c(r.total_cents);
        const labor = laborActual(r);
        // Suma finală de manoperă: cea cerută / plătită (după verificarea dispecerului), altfel cea măsurată
        const laborCents = r.labor_status === 'waived' ? 0 : r.labor_cents != null ? c(r.labor_cents) : labor ? labor.minutes * c(r.labor_cents_per_min) : 0;
        if (['paid', 'paid_cash'].includes(r.labor_status)) totals.laborCollected += laborCents;
        else if (laborCents) totals.laborOutstanding += laborCents;
        const day = new Date(r.scheduled_for).toISOString().slice(0, 10);

        totals.booking += booking;
        if (Number(r.pricing_version) >= 2) {
            totals.reservation += c(r.time_cost_cents);
            totals.service += c(r.base_fare_cents);
            totals.transportation += c(r.distance_cost_cents);
        } else {
            totals.other += booking;
        }
        totals.labor += laborCents;
        totals.jobs += 1;
        if (r.status === 'completed') {
            totals.completedJobs += 1;
            if (!labor && r.labor_cents == null) totals.laborMissing += 1;
        }
        if (labor) totals.laborMinutes += labor.minutes;

        const bucket = days.get(day);
        if (bucket) {
            bucket.booking += booking;
            bucket.labor += laborCents;
            bucket.jobs += 1;
        }

        const v = byVehicle.get(r.vehicle) || { id: r.vehicle, name: toOrderDto(r).vehicle.name, jobs: 0, gross: 0 };
        v.jobs += 1;
        v.gross += booking + laborCents;
        byVehicle.set(r.vehicle, v);

        const dKey = r.driver_id || 'none';
        const dr = byDriver.get(dKey) || { id: r.driver_id || null, name: r.driver_name || 'Unassigned', jobs: 0, gross: 0, laborMinutes: 0 };
        dr.jobs += 1;
        dr.gross += booking + laborCents;
        dr.laborMinutes += labor ? labor.minutes : 0;
        byDriver.set(dKey, dr);

        orders.push({
            id: r.code,
            date: day,
            status: r.status,
            customer: r.customer_name,
            vehicle: v.name,
            driver: r.driver_name || '',
            booking: booking / 100,
            labor: laborCents / 100,
            laborMinutes: labor ? labor.minutes : null,
            gross: (booking + laborCents) / 100,
            paymentMethod: r.payment_method || (r.paid_at ? 'stripe' : 'pay later')
        });
    }

    const $ = (cents) => cents / 100;
    const gross = totals.booking + totals.labor;
    res.json({
        from: iso(from),
        to: iso(to),
        totals: {
            gross: $(gross),
            booking: $(totals.booking),
            reservation: $(totals.reservation),
            service: $(totals.service),
            transportation: $(totals.transportation),
            other: $(totals.other),
            labor: $(totals.labor),
            laborCollected: $(totals.laborCollected),
            laborOutstanding: $(totals.laborOutstanding),
            jobs: totals.jobs,
            completedJobs: totals.completedJobs,
            avgPerJob: totals.jobs ? $(Math.round(gross / totals.jobs)) : 0,
            laborMinutes: totals.laborMinutes,
            laborMissing: totals.laborMissing,
            cancelledPaid: { count: cancelledPaid.count, amount: $(cancelledPaid.amount) }
        },
        series: [...days.values()].map((d) => ({ ...d, booking: $(d.booking), labor: $(d.labor) })),
        byVehicle: [...byVehicle.values()].map((v) => ({ ...v, gross: $(v.gross) })).sort((a, b) => b.gross - a.gross),
        byDriver: [...byDriver.values()].map((d) => ({ ...d, gross: $(d.gross) })).sort((a, b) => b.gross - a.gross),
        orders
    });
});

/* ---------------------------------- Șoferi ---------------------------------- */

/** Trimite șoferului linkul de autentificare în panoul lui (invitație sau link nou). */
router.post('/drivers/:id/login-link', async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM drivers WHERE id = ?', [Number(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: 'Driver not found.' });
    if (!rows[0].active) return res.status(409).json({ error: 'This driver is archived. Reactivate them first.' });
    try {
        await emailLoginLink(rows[0], { invite: !rows[0].last_login_at });
    } catch (err) {
        console.error(`[reloq] Invitația pentru șofer nu a plecat: ${err.message}`);
        return res.status(503).json({ error: 'The email could not be sent. Check the email settings and try again.' });
    }
    res.json({ ok: true });
});

/** Deconectează șoferul de pe toate telefoanele (ex. telefon pierdut). */
router.post('/drivers/:id/logout', async (req, res) => {
    await revokeDriverSessions(Number(req.params.id));
    res.json({ ok: true });
});

/** Setările dispeceratului (ex. trimiterea automată a cererilor de plată pentru manoperă). */
router.get('/settings', async (req, res) => res.json({ settings: await getSettings() }));
router.patch('/settings', async (req, res) => {
    if (typeof req.body?.laborAutoRequest === 'boolean') await setSetting('labor_auto_request', req.body.laborAutoRequest);
    res.json({ settings: await getSettings() });
});

/** Trimite acum reamintirile pentru o zi (implicit mâine), chiar dacă au mai fost trimise. */
router.post('/drivers/reminders', async (req, res) => {
    const date = req.body?.date ? parseDateOnly(req.body.date) : null;
    if (req.body?.date && !date) return res.status(400).json({ error: 'Invalid date.' });
    const result = await sendDriverReminders({ date: date ? date.toISOString().slice(0, 10) : tomorrowDate(), force: true });
    res.json(result);
});

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
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
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
    if (data.active === false) sets.push('session_version = session_version + 1'); // arhivat → deconectat
    if (data.email !== undefined && data.email !== existing.email) sets.push('session_version = session_version + 1');
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
        await pool.query('UPDATE drivers SET active = 0, session_version = session_version + 1 WHERE id = ?', [id]);
        return res.json({ archived: true, driver: await loadDriver(id) });
    }
    await pool.query('DELETE FROM drivers WHERE id = ?', [id]);
    res.json({ deleted: true });
});

export default router;
