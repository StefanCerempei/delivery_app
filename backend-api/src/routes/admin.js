import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';
import { statusSchema, driverSchema, assignDriverSchema, adminOrderUpdateSchema, discountCodeSchema, adminCreateOrderSchema, parseBody } from '../validation.js';
import crypto from 'node:crypto';
import { insertOrderRow, newOrderCode } from '../orders.js';
import { priceFor as priceForVehicle, MAX_DISTANCE_MILES } from '../pricing.js';
import { withSlot } from '../slots.js';
import { checkDiscount, discountCents } from '../discounts.js';
import { createPaymentLink } from '../paymentLinks.js';
import { stripe } from '../stripe.js';
import { notifyPaymentLink } from '../emails.js';
import { config } from '../config.js';
import { inServiceArea, OUTSIDE_AREA_MESSAGE } from '../serviceArea.js';
import { listDiscounts } from '../discounts.js';
import { logChanges, orderHistory } from '../audit.js';
import { getTrip, priceFor, priceLines } from '../pricing.js';
import { scheduleLabel } from './orders.js';
import { businessTodayUTC } from '../time.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL, laborActual } from '../orders.js';
import { notifyStatusChange, notifyOrderConfirmed, notifyDriverAssigned, notifyDriverRemoved, notifyOrderUpdated } from '../emails.js';
import { waitForMail } from '../mailer.js';
import { slotTakenByOther, blockedSlots } from '../slots.js';
import { ensureDriverToken, jobUrl, stampStatus, sendDriverReminders, tomorrowDate } from '../jobs.js';
import { parseDateOnly } from '../time.js';
import { emailLoginLink } from './driverPortal.js';
import { revokeDriverSessions } from '../driverAuth.js';
import { getSettings, setSetting } from '../settings.js';
import bcrypt from 'bcryptjs';
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

/**
 * PATCH /admin/orders/:code — dispecerul modifică comanda: adrese (+ etaj / lift / acces), data și ora,
 * vehiculul, obiectele. Traseul se recalculează; prețul se recalculează doar dacă nu s-a plătit online
 * (altfel se întoarce doar estimarea nouă, iar diferența se reglează manual).
 */
router.patch('/orders/:code', async (req, res) => {
    const data = parseBody(adminOrderUpdateSchema, req, res);
    if (!data) return;
    const [rows] = await pool.query('SELECT * FROM orders WHERE code = ?', [req.params.code]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Order not found.' });
    if (['completed', 'cancelled'].includes(row.status)) {
        return res.status(409).json({ error: 'Completed or cancelled orders can’t be edited.' });
    }

    const sets = [];
    const params = [];
    const changes = [];
    const logged = [];
    const set = (column, value) => {
        sets.push(`${column} = ?`);
        params.push(value);
        logged.push({ field: column, oldValue: row[column], newValue: value });
    };
    const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

    let pickup = { address: row.pickup_address, lat: Number(row.pickup_lat), lng: Number(row.pickup_lng) };
    let dropoff = { address: row.dropoff_address, lat: Number(row.dropoff_lat), lng: Number(row.dropoff_lng) };
    let routeChanged = false;
    for (const [key, label] of [['pickup', 'pickup address'], ['dropoff', 'drop-off address']]) {
        const loc = data[key];
        const cur = key === 'pickup' ? pickup : dropoff;
        if (loc && (loc.address !== cur.address || !near(loc.lat, cur.lat) || !near(loc.lng, cur.lng))) {
            set(`${key}_address`, loc.address);
            set(`${key}_lat`, loc.lat);
            set(`${key}_lng`, loc.lng);
            if (key === 'pickup') pickup = loc;
            else dropoff = loc;
            routeChanged = true;
            changes.push(label);
        }
    }
    for (const [key, column, label] of [['pickupDetails', 'pickup_details', 'pickup details'], ['dropoffDetails', 'dropoff_details', 'drop-off details']]) {
        if (data[key] === undefined) continue;
        const json = data[key] ? JSON.stringify(data[key]) : null;
        if (json !== (row[column] || null)) {
            set(column, json);
            changes.push(label);
        }
    }

    if (data.schedule) {
        const day = parseDateOnly(data.schedule.date);
        if (!day) return res.status(400).json({ error: 'Pick a valid date.' });
        if (day < businessTodayUTC()) return res.status(400).json({ error: 'The new date is in the past.' });
        const scheduledFor = `${data.schedule.date} ${data.schedule.slot}:00`;
        const current = row.scheduled_for ? new Date(row.scheduled_for).toISOString().slice(0, 16).replace('T', ' ') : null;
        if (current !== scheduledFor.slice(0, 16)) {
            const other = await slotTakenByOther(row.id, scheduledFor);
            if (other) return res.status(409).json({ error: `That arrival window is already booked by order ${other}.` });
            set('schedule_type', 'scheduled');
            set('scheduled_for', scheduledFor);
            set('schedule_label', scheduleLabel(day, data.schedule.slot));
            changes.push('arrival window');
        }
    }

    const vehicle = data.vehicle || row.vehicle;
    if (data.vehicle && data.vehicle !== row.vehicle) {
        set('vehicle', data.vehicle);
        routeChanged = true;
        changes.push('vehicle');
    }
    if (data.itemsDescription !== undefined && data.itemsDescription !== row.items_description) {
        set('items_description', data.itemsDescription);
        changes.push('items');
    }

    // Traseu / vehicul schimbat: distanța, timpii și tariful de manoperă se recalculează
    let priceChange = null;
    if (routeChanged) {
        const trip = await getTrip(pickup, dropoff);
        const price = priceFor(vehicle, trip);
        set('distance_miles', trip.distanceMiles);
        set('duration_mins', trip.durationMins);
        set('outbound_mins', trip.outboundMins);
        set('return_mins', trip.returnMins);
        if (!row.labor_status || row.labor_status === 'none') set('labor_cents_per_min', price.laborCentsPerMin);
        // Plătit online (sau plata online pornită): suma plătită rămâne; altfel prețul se actualizează
        const applied = !row.paid_at && !row.stripe_payment_intent_id && !row.paypal_capture_id;
        if (applied) {
            set('base_fare_cents', price.serviceFeeCents);
            set('distance_cost_cents', price.transportationCents);
            set('time_cost_cents', price.reservationFeeCents);
            // Discountul comenzii (dacă are) se păstrează: același procent din noul preț
            const off = row.discount_percent ? Math.round((price.totalCents * Number(row.discount_percent)) / 100) : 0;
            set('total_cents', price.totalCents - off);
            if (row.discount_percent) set('discount_cents', off);
            set('pricing_version', 2);
        }
        const offEst = row.discount_percent ? Math.round((price.totalCents * Number(row.discount_percent)) / 100) : 0;
        priceChange = { current: row.total_cents / 100, estimated: (price.totalCents - offEst) / 100, applied };
    }

    if (!sets.length) return res.json({ order: await loadOrder(req.params.code), changes: [], priceChange });
    await pool.query(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`, [...params, row.id]);
    await logChanges(row.id, logged, { actor: req.user, reason: data.reason });

    let order = await loadOrder(req.params.code);
    if (data.notify && changes.length && !['pending_payment'].includes(order.status)) {
        const mails = [notifyOrderUpdated(order, changes)];
        if (order.driver?.notifiedAt) {
            order.jobUrl = jobUrl(await ensureDriverToken(order.id));
            mails.push(notifyDriverAssigned(order, { updated: true }));
        }
        await waitForMail(Promise.all(mails));
    }
    res.json({ order, changes, priceChange });
});

/** Numele șoferului (pentru jurnal). */
async function driverName(id) {
    if (!id) return null;
    const [[d]] = await pool.query('SELECT full_name FROM drivers WHERE id = ?', [id]);
    return d?.full_name || `#${id}`;
}

async function orderIdByCode(code) {
    const [[r]] = await pool.query('SELECT id FROM orders WHERE code = ?', [code]);
    return r?.id || null;
}

/** GET /admin/orders/:code/history — jurnalul modificărilor. */
router.get('/orders/:code/history', async (req, res) => {
    const id = await orderIdByCode(req.params.code);
    if (!id) return res.status(404).json({ error: 'Order not found.' });
    res.json({ history: await orderHistory(id) });
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
    await logChanges(
        raw[0].id,
        [
            { field: 'status', oldValue: before.status, newValue: data.status },
            ...(data.driverId !== undefined ? [{ field: 'driver', oldValue: before.driver?.fullName, newValue: await driverName(data.driverId) }] : [])
        ],
        { actor: req.user }
    );

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
    await logChanges(await orderIdByCode(req.params.code), [{ field: 'driver', oldValue: before.driver?.fullName, newValue: order.driver?.fullName }], {
        actor: req.user
    });
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
        const reason = String(req.body.reason || '').trim();
        if (reason.length < 3) return res.status(400).json({ error: 'Please write the reason for the correction.' });
        result = await setLaborMinutes(req.params.code, m, { actor: req.user, reason });
    } else if (action === 'request') result = await requestLaborPayment(req.params.code);
    else if (action === 'cash') result = await markLaborCash(req.params.code);
    else if (action === 'waive') result = await waiveLabor(req.params.code);
    else if (action === 'reopen') result = await reopenLabor(req.params.code);
    else return res.status(400).json({ error: 'Unknown action.' });
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (action !== 'minutes') {
        await logChanges(await orderIdByCode(req.params.code), [{ field: 'labor', oldValue: null, newValue: action }], { actor: req.user });
    }
    res.json({ order: await loadOrder(req.params.code) });
});

/* --------------------------- Ore / zile blocate (nu se pot rezerva) --------------------------- */

const SLOT_IDS = ['07:00', '09:00', '11:00', '13:00', '15:00'];

/** GET /admin/blocks?from&to → { blocks: { 'YYYY-MM-DD': { '09:00': 'motiv', '*': 'motiv' } } } */
router.get('/blocks', async (req, res) => {
    const from = parseDateOnly(req.query.from);
    const to = parseDateOnly(req.query.to);
    if (!from || !to || to < from) return res.status(400).json({ error: 'Invalid date range.' });
    const iso = (d) => d.toISOString().slice(0, 10);
    res.json({ blocks: await blockedSlots(iso(from), iso(to)) });
});

/** POST /admin/blocks { date, slot ('07:00'…'15:00' sau '*' = toată ziua), reason? } */
router.post('/blocks', async (req, res) => {
    const day = parseDateOnly(req.body?.date);
    const slot = req.body?.slot;
    if (!day || !(slot === '*' || SLOT_IDS.includes(slot))) return res.status(400).json({ error: 'Pick a valid day and arrival window.' });
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 120) || null : null;
    const date = day.toISOString().slice(0, 10);
    await pool.query('INSERT INTO blocked_slots (day, slot, reason) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason)', [
        date,
        slot,
        reason
    ]);
    // Toată ziua blocată: blocările pe ore din acea zi devin inutile
    if (slot === '*') await pool.query("DELETE FROM blocked_slots WHERE day = ? AND slot <> '*'", [date]);
    // Comenzile deja rezervate pe acea oră / zi rămân (dispecerul le poate anula sau muta)
    const [orders] = await pool.query(
        `SELECT code FROM orders o WHERE DATE(o.scheduled_for) = ? ${slot === '*' ? '' : "AND TIME_FORMAT(o.scheduled_for, '%H:%i') = ?"}
           AND o.status IN ('paid', 'confirmed', 'en_route')`,
        slot === '*' ? [date] : [date, slot]
    );
    res.json({ ok: true, existingOrders: orders.map((o) => o.code) });
});

/** DELETE /admin/blocks { date, slot } — deblochează (slot '*' = ziua întreagă). */
router.delete('/blocks', async (req, res) => {
    const day = parseDateOnly(req.body?.date);
    const slot = req.body?.slot;
    if (!day || !(slot === '*' || SLOT_IDS.includes(slot))) return res.status(400).json({ error: 'Pick a valid day and arrival window.' });
    await pool.query('DELETE FROM blocked_slots WHERE day = ? AND slot = ?', [day.toISOString().slice(0, 10), slot]);
    res.json({ ok: true });
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
    hasPassword: Boolean(r.password_hash),
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
        const hash = data.password ? await bcrypt.hash(data.password, 12) : null;
        const [result] = await pool.query(
            'INSERT INTO drivers (full_name, email, password_hash, phone, notes, active) VALUES (?, ?, ?, ?, ?, ?)',
            [data.fullName, data.email, hash, data.phone, data.notes, data.active === false ? 0 : 1]
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
    // Parolă nouă → deconectat de pe toate telefoanele (intră din nou cu parola nouă)
    if (data.password) {
        sets.push('password_hash = ?', 'session_version = session_version + 1');
        params.push(await bcrypt.hash(data.password, 12));
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

/* ================= Comandă nouă din dispecerat (client la telefon) ================= */

/** Clientul comenzii: unul existent sau unul nou (cont fără parolă; o setează cu „Forgot password”). */
async function resolveCustomer(data) {
    if (data.customerId) {
        const [[u]] = await pool.query("SELECT id FROM users WHERE id = ? AND role = 'customer' AND deleted_at IS NULL", [data.customerId]);
        return u ? { id: u.id } : { error: 'Customer not found.' };
    }
    const c = data.newCustomer;
    const [[existing]] = await pool.query('SELECT id, role, deleted_at FROM users WHERE email = ?', [c.email]);
    if (existing) {
        if (existing.role !== 'customer' || existing.deleted_at) return { error: 'This email belongs to an account that can’t be used for orders.' };
        // completăm telefonul / numele dacă lipseau
        await pool.query('UPDATE users SET phone = COALESCE(phone, ?) WHERE id = ?', [c.phone || null, existing.id]);
        return { id: existing.id, existing: true };
    }
    const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const [r] = await pool.query("INSERT INTO users (email, password_hash, full_name, phone, role) VALUES (?, ?, ?, ?, 'customer')", [
        c.email,
        unusable,
        c.fullName,
        c.phone || null
    ]);
    return { id: r.insertId, created: true };
}

/** GET /admin/customers?q= — căutare clienți (nume, email, telefon) pentru o comandă nouă. */
router.get('/customers', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const [rows] = await pool.query(
        `SELECT id, full_name, email, phone FROM users
         WHERE role = 'customer' AND deleted_at IS NULL ${q ? 'AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)' : ''}
         ORDER BY created_at DESC LIMIT 20`,
        q ? [like, like, like] : []
    );
    res.json({ customers: rows.map((r) => ({ id: r.id, fullName: r.full_name, email: r.email, phone: r.phone })) });
});

/** POST /admin/orders — dispecerul creează o comandă; prețul se calculează pe server, la fel ca pe site. */
router.post('/orders', async (req, res) => {
    const data = parseBody(adminCreateOrderSchema, req, res);
    if (!data) return;
    if (data.payment === 'link' && !stripe) return res.status(400).json({ error: 'Online payments are not enabled, so a payment link can’t be sent.' });

    const day = parseDateOnly(data.schedule.date);
    if (!day || day < businessTodayUTC()) return res.status(400).json({ error: 'Pick today or a future date.' });
    for (const loc of [data.pickup, data.dropoff]) {
        if (!inServiceArea(loc.lat, loc.lng)) return res.status(422).json({ error: OUTSIDE_AREA_MESSAGE });
    }

    const customer = await resolveCustomer(data);
    if (customer.error) return res.status(400).json({ error: customer.error });

    const route = await getTrip(data.pickup, data.dropoff);
    if (route.distanceMiles > MAX_DISTANCE_MILES) return res.status(422).json({ error: `Maximum trip distance is ${MAX_DISTANCE_MILES} miles.` });
    const price = priceForVehicle(data.vehicle, route);
    let discount = null;
    if (data.discountCode) {
        discount = await checkDiscount(data.discountCode, customer.id);
        if (discount.error) return res.status(400).json({ error: discount.error });
        discount.cents = discountCents(price.totalCents, discount.percent);
    }
    const totalCents = price.totalCents - (discount?.cents || 0);

    const id = crypto.randomUUID();
    let code = newOrderCode();
    const schedule = {
        type: 'scheduled',
        scheduledFor: `${data.schedule.date} ${data.schedule.slot}:00`,
        label: scheduleLabel(day, data.schedule.slot)
    };
    const status = data.payment === 'link' ? 'pending_payment' : 'confirmed';
    // Dispecerul poate rezerva și o oră blocată de el; doar o altă comandă pe aceeași oră o oprește
    const booked = await withSlot(schedule.scheduledFor, customer.id, async (conn) => {
        code = await insertOrderRow(conn, {
            id, code, userId: customer.id, status,
            pickup: data.pickup, dropoff: data.dropoff,
            pickupDetails: data.pickupDetails, dropoffDetails: data.dropoffDetails,
            route, vehicle: data.vehicle, schedule,
            itemsDescription: data.itemsDescription,
            price, totalCents, currency: config.currency, discount,
            termsVersion: null,
            createdBy: req.user.fullName || req.user.email
        });
    });
    if (!booked) return res.status(409).json({ error: 'That arrival window is already booked. Pick another time.' });

    if (data.payment === 'paid') {
        await pool.query("UPDATE orders SET paid_at = UTC_TIMESTAMP(), payment_method = 'offline' WHERE id = ?", [id]);
    }
    if (data.dispatchNotes) await pool.query('UPDATE orders SET dispatch_notes = ? WHERE id = ?', [data.dispatchNotes, id]);
    await logChanges(id, [{ field: 'created', oldValue: null, newValue: `by dispatch · payment: ${data.payment}` }], { actor: req.user });

    let order = await loadOrder(code);
    let paymentLink = null;
    try {
        if (data.payment === 'link') {
            paymentLink = await createPaymentLink(id, { base: `${req.protocol}://${req.get('host')}` });
            if (paymentLink.error) throw new Error(paymentLink.error);
            order = await loadOrder(code);
            if (data.notify) await waitForMail(notifyPaymentLink(order, paymentLink.url, paymentLink.expiresAt));
        } else if (data.notify) {
            await waitForMail(notifyOrderConfirmed(order));
        }
    } catch (err) {
        console.warn(`[reloq] Comanda ${code}: linkul de plată / emailul a eșuat: ${err.message}`);
        return res.status(201).json({ order, paymentLink: null, warning: `The order was created, but the payment link failed: ${err.message}` });
    }
    res.status(201).json({ order, paymentLink, customerCreated: Boolean(customer.created) });
});

/** POST /admin/orders/:code/payment-link — trimite din nou linkul de plată (îl recreează dacă a expirat). */
router.post('/orders/:code/payment-link', async (req, res) => {
    const id = await orderIdByCode(req.params.code);
    if (!id) return res.status(404).json({ error: 'Order not found.' });
    const link = await createPaymentLink(id, { base: `${req.protocol}://${req.get('host')}` });
    if (link.error) return res.status(link.status).json({ error: link.error });
    const order = await loadOrder(req.params.code);
    if (req.body?.email !== false) await waitForMail(notifyPaymentLink(order, link.url, link.expiresAt));
    res.json({ order, paymentLink: link });
});

/* ================= Coduri de discount ================= */
router.get('/discounts', async (_req, res) => {
    res.json({ discounts: await listDiscounts() });
});

router.post('/discounts', async (req, res) => {
    const data = parseBody(discountCodeSchema, req, res);
    if (!data) return;
    try {
        await pool.query('INSERT INTO discount_codes (code, percent, note) VALUES (?, ?, ?)', [data.code, data.percent, data.note || null]);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This code already exists.' });
        throw err;
    }
    res.status(201).json({ discounts: await listDiscounts() });
});

/** Pornește / oprește un cod (codurile folosite nu se șterg, ca să rămână istoricul). */
router.patch('/discounts/:id', async (req, res) => {
    const active = req.body?.active;
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'Send active: true or false.' });
    const [r] = await pool.query('UPDATE discount_codes SET active = ? WHERE id = ?', [active ? 1 : 0, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Discount code not found.' });
    res.json({ discounts: await listDiscounts() });
});

export default router;
