import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { requireAuth, requireVerifiedEmail } from '../auth.js';
import { getTrip, allPrices, priceFor, priceLines, MAX_DISTANCE_MILES, VEHICLES } from '../pricing.js';
import { estimateSchema, createOrderSchema, parseBody } from '../validation.js';
import { newOrderCode, toOrderDto, ORDER_WITH_CUSTOMER_SQL } from '../orders.js';
import { stripe } from '../stripe.js';
import { config } from '../config.js';
import { businessTodayUTC, parseDateOnly } from '../time.js';
import { notifyNewOrder } from '../emails.js';
import { syncOrderPayment, markOrderPaid } from '../payments.js';
import { paypalEnabled, createPaypalOrder, capturePaypalOrder } from '../paypal.js';
import { waitForMail } from '../mailer.js';
import { takenSlots, withSlot } from '../slots.js';
import { searchAddresses } from '../geocode.js';

const MAX_DAYS_AHEAD = 30;
const DAY_MS = 24 * 3600e3;

const router = Router();

const estimateLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const createLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

const toDollars = (p) => ({ vehicleId: p.vehicleId, ...priceLines(p) });

/** POST /api/estimate — traseul și prețurile pentru toate vehiculele. */
router.post('/estimate', estimateLimiter, async (req, res) => {
    const data = parseBody(estimateSchema, req, res);
    if (!data) return;

    const route = await getTrip(data.pickup, data.dropoff);
    if (route.distanceMiles > MAX_DISTANCE_MILES) {
        return res.status(422).json({ error: `Maximum trip distance is ${MAX_DISTANCE_MILES} miles.` });
    }

    const prices = allPrices(route);
    res.json({
        routeInfo: {
            distanceMiles: route.distanceMiles,
            durationMins: route.durationMins,
            outboundMins: route.outboundMins,
            returnMins: route.returnMins
        },
        estimates: Object.fromEntries(Object.entries(prices).map(([id, p]) => [id, toDollars(p)])),
        currency: config.currency
    });
});

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hourLabel = (h) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

/** „Sat, Nov 14 • 10:00 AM – 11:00 AM” */
function scheduleLabel(day, slot) {
    const h = Number(slot.slice(0, 2));
    return `${WEEKDAYS[day.getUTCDay()]}, ${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()} • ${hourLabel(h)} – ${hourLabel(h + 2)}`;
}

/** Programarea e valabilă doar de mâine (ora din Massachusetts) până la MAX_DAYS_AHEAD zile. */
function scheduleFrom(input) {
    const day = parseDateOnly(input.date);
    if (!day) return null;
    const diffDays = Math.round((day.getTime() - businessTodayUTC().getTime()) / DAY_MS);
    if (diffDays < 1 || diffDays > MAX_DAYS_AHEAD) return null;
    return {
        type: 'scheduled',
        scheduledFor: `${input.date} ${input.slot}:00`,
        // Eticheta e generată aici, nu luată din browser (ajunge în emailuri și în dispecerat)
        label: scheduleLabel(day, input.slot)
    };
}

// RELOQ acceptă doar Card, Apple Pay, Google Pay și Amazon Pay (+ PayPal direct, separat de Stripe).
// Apple Pay și Google Pay sunt plăți de tip „card” la Stripe, deci lista strictă e card + amazon_pay:
// Link, Bank, Klarna, Cash App etc. nu pot apărea, indiferent ce e pornit în Dashboard.
const PAYMENT_METHOD_TYPES = ['card', 'amazon_pay'];

/** Creează PaymentIntent-ul; dacă Amazon Pay nu e activat în contul Stripe, merge doar cu card. */
async function createPaymentIntent(params) {
    try {
        return await stripe.paymentIntents.create({ ...params, payment_method_types: PAYMENT_METHOD_TYPES });
    } catch (err) {
        if (err.type !== 'StripeInvalidRequestError' || !/amazon_pay/.test(err.message || '')) throw err;
        console.warn(`[reloq] Amazon Pay indisponibil în contul Stripe (${err.message}); plata merge doar cu card / Apple Pay / Google Pay.`);
        return stripe.paymentIntents.create({ ...params, payment_method_types: ['card'] });
    }
}

const geocodeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });

/** GET /api/geocode?q=… — sugestii de adrese (registrul oficial al SUA + OpenStreetMap). */
router.get('/geocode', geocodeLimiter, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    if (q.length < 3) return res.json({ results: [] });
    try {
        res.json({ results: await searchAddresses(q) });
    } catch (err) {
        console.warn(`[reloq] Căutarea de adrese a eșuat: ${err.message}`);
        res.status(503).json({ error: 'Address search is unavailable right now. Please try again.' });
    }
});

/**
 * GET /api/availability?from=YYYY-MM-DD&to=YYYY-MM-DD — ferestrele deja rezervate,
 * ca să nu mai poată fi alese de alți clienți. Nu conține nimic despre cine a rezervat.
 */
router.get('/availability', estimateLimiter, async (req, res) => {
    const from = parseDateOnly(req.query.from);
    const to = parseDateOnly(req.query.to);
    if (!from || !to || to < from || (to - from) / DAY_MS > MAX_DAYS_AHEAD + 1) {
        return res.status(400).json({ error: 'Invalid date range.' });
    }
    const iso = (d) => d.toISOString().slice(0, 10);
    const taken = await takenSlots(iso(from), iso(to), { exceptUserId: req.user?.id || null });
    res.set('Cache-Control', 'no-store');
    res.json({ taken });
});

/** POST /api/orders — creează comanda; prețul e recalculat aici. */
router.post('/orders', requireVerifiedEmail, createLimiter, async (req, res) => {
    const data = parseBody(createOrderSchema, req, res);
    if (!data) return;

    const schedule = scheduleFrom(data.schedule);
    if (!schedule) {
        return res.status(400).json({ error: 'Bookings are available from tomorrow onward. Please pick another date.' });
    }

    const route = await getTrip(data.pickup, data.dropoff);
    if (route.distanceMiles > MAX_DISTANCE_MILES) {
        return res.status(422).json({ error: `Maximum trip distance is ${MAX_DISTANCE_MILES} miles.` });
    }
    const price = priceFor(data.vehicle, route);

    const id = crypto.randomUUID();
    let code = newOrderCode();

    // O singură comandă pe fereastră: verificarea și salvarea se fac cu ora blocată.
    const booked = await withSlot(schedule.scheduledFor, req.user.id, async (conn) => {
        for (let attempt = 0; ; attempt++) {
            try {
                await conn.query(
                    `INSERT INTO orders (
                        id, code, user_id, status,
                        pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
                        distance_miles, duration_mins, vehicle, schedule_type, scheduled_for, schedule_label,
                        items_description, photos_count,
                        base_fare_cents, distance_cost_cents, time_cost_cents, total_cents, currency,
                        pricing_version, outbound_mins, return_mins, labor_cents_per_min,
                        pickup_details, dropoff_details
                    ) VALUES (?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?)`,
                    [
                        id, code, req.user.id,
                        data.pickup.address, data.pickup.lat, data.pickup.lng,
                        data.dropoff.address, data.dropoff.lat, data.dropoff.lng,
                        route.distanceMiles, route.durationMins, data.vehicle,
                        schedule.type, schedule.scheduledFor, schedule.label,
                        data.itemsDescription, data.photosCount,
                        // Model de preț v2: base_fare = Service fee, distance_cost = Transportation,
                        // time_cost = Reservation fee (vezi pricing.js și toOrderDto).
                        price.serviceFeeCents, price.transportationCents, price.reservationFeeCents, price.totalCents,
                        config.currency,
                        price.outboundMins, price.returnMins, price.laborCentsPerMin,
                        data.pickupDetails ? JSON.stringify(data.pickupDetails) : null,
                        data.dropoffDetails ? JSON.stringify(data.dropoffDetails) : null
                    ]
                );
                break;
            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY' && attempt < 3) {
                    code = newOrderCode();
                    continue;
                }
                throw err;
            }
        }
    });
    if (!booked) {
        return res.status(409).json({
            error: 'Sorry, this arrival window was just booked by someone else. Please pick another time.',
            code: 'SLOT_TAKEN'
        });
    }

    let clientSecret = null;
    if (stripe) {
        const intent = await createPaymentIntent({
            amount: price.totalCents,
            currency: config.currency,
            receipt_email: req.user.email,
            description: `RELOQ ${VEHICLES[data.vehicle].name} — ${code}`,
            metadata: { order_code: code, order_id: id, user_id: String(req.user.id) }
        });
        await pool.query('UPDATE orders SET stripe_payment_intent_id = ? WHERE id = ?', [intent.id, id]);
        clientSecret = intent.client_secret;
    }

    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.id = ?`, [id]);
    const created = toOrderDto(rows[0], { includeCustomer: true });

    // Cu plata online, emailurile „submitted” + alerta dispecerului pleacă abia după plată
    // (syncOrderPayment); fără Stripe, imediat.
    // Pe Hostinger emailul trebuie trimis înainte de răspuns (altfel dă ETIMEDOUT)
    if (!stripe) await waitForMail(notifyNewOrder(created));

    res.status(201).json({ order: created, clientSecret, paymentsEnabled: Boolean(stripe) });
});

/** Încarcă o comandă doar dacă aparține utilizatorului (sau e admin). */
async function loadOwnOrder(req, res) {
    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.code = ?`, [req.params.code]);
    const row = rows[0];
    if (!row || (row.user_id !== req.user.id && req.user.role !== 'admin')) {
        res.status(404).json({ error: 'Order not found.' });
        return null;
    }
    return row;
}

/** POST /api/orders/:code/confirm-payment — verifică plata direct la Stripe. */
router.post('/orders/:code/confirm-payment', requireAuth, async (req, res) => {
    const row = await loadOwnOrder(req, res);
    if (!row) return;
    if (!stripe || !row.stripe_payment_intent_id) {
        return res.status(400).json({ error: 'Online payment is not enabled for this order.' });
    }

    // Verificarea și emailurile sunt comune cu webhook-ul Stripe (src/payments.js).
    const { order, paymentStatus } = await syncOrderPayment(row.stripe_payment_intent_id);
    res.json({ order, paymentStatus });
});

const paypalLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

/** POST /api/orders/:code/paypal/create — comanda PayPal pentru butonul din pasul de plată. */
router.post('/orders/:code/paypal/create', requireAuth, paypalLimiter, async (req, res) => {
    const row = await loadOwnOrder(req, res);
    if (!row) return;
    if (!paypalEnabled) return res.status(400).json({ error: 'PayPal is not available right now.' });
    if (row.status !== 'pending_payment') return res.status(409).json({ error: 'This order is already paid.' });

    const paypalOrderId = await createPaypalOrder(row);
    await pool.query('UPDATE orders SET paypal_order_id = ? WHERE id = ?', [paypalOrderId, row.id]);
    res.json({ paypalOrderId });
});

/** POST /api/orders/:code/paypal/capture — încasează după ce clientul a aprobat în PayPal. */
router.post('/orders/:code/paypal/capture', requireAuth, paypalLimiter, async (req, res) => {
    const row = await loadOwnOrder(req, res);
    if (!row) return;
    const paypalOrderId = typeof req.body?.paypalOrderId === 'string' ? req.body.paypalOrderId : '';
    // Doar comanda PayPal creată de noi pentru această comandă RELOQ.
    if (!paypalEnabled || !paypalOrderId || paypalOrderId !== row.paypal_order_id) {
        return res.status(400).json({ error: 'This PayPal payment does not match your order.' });
    }
    if (row.status !== 'pending_payment') {
        const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.id = ?`, [row.id]);
        return res.json({ order: toOrderDto(rows[0], { includeCustomer: true }) });
    }

    const result = await capturePaypalOrder(paypalOrderId, row);
    if (!result.paid) {
        const declined = result.reason === 'INSTRUMENT_DECLINED';
        return res.status(402).json({
            error: declined
                ? 'PayPal declined this payment method. Please choose another one in PayPal or pay by card.'
                : 'Your PayPal payment could not be completed. Please try again or pay by card.',
            code: result.reason
        });
    }

    const { order } = await markOrderPaid(row.id, { method: 'paypal', paypalCaptureId: result.captureId });

    // Plata cu cardul pregătită pentru aceeași comandă nu mai e necesară.
    if (stripe && row.stripe_payment_intent_id) {
        await stripe.paymentIntents.cancel(row.stripe_payment_intent_id).catch((err) => {
            console.warn(`[reloq] Nu am putut anula PaymentIntent ${row.stripe_payment_intent_id}: ${err.message}`);
        });
    }
    res.json({ order });
});

/** GET /api/orders/mine — istoricul clientului. */
router.get('/orders/mine', requireAuth, async (req, res) => {
    const [rows] = await pool.query(
        // Plățile online neterminate nu apar în istoric (nu sunt comenzi trimise).
        `${ORDER_WITH_CUSTOMER_SQL} WHERE o.user_id = ?
           AND NOT (o.status = 'pending_payment' AND o.stripe_payment_intent_id IS NOT NULL)
         ORDER BY o.created_at DESC LIMIT 50`,
        [req.user.id]
    );
    res.json({ orders: rows.map((r) => toOrderDto(r)) });
});

router.get('/orders/:code', requireAuth, async (req, res) => {
    const row = await loadOwnOrder(req, res);
    if (!row) return;
    res.json({ order: toOrderDto(row) });
});

export default router;
