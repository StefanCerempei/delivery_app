import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { getRoute, allPrices, priceFor, MAX_DISTANCE_MILES, VEHICLES } from '../pricing.js';
import { estimateSchema, createOrderSchema, parseBody } from '../validation.js';
import { newOrderCode, toOrderDto, ORDER_WITH_CUSTOMER_SQL } from '../orders.js';
import { stripe } from '../stripe.js';
import { config } from '../config.js';

const router = Router();

const estimateLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const createLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

const toDollars = (p) => ({
    vehicleId: p.vehicleId,
    baseFare: p.baseFareCents / 100,
    distanceCost: p.distanceCostCents / 100,
    timeCost: p.timeCostCents / 100,
    total: p.totalCents / 100
});

/** POST /api/estimate — traseul și prețurile pentru toate vehiculele. */
router.post('/estimate', estimateLimiter, async (req, res) => {
    const data = parseBody(estimateSchema, req, res);
    if (!data) return;

    const route = await getRoute(data.pickup, data.dropoff);
    if (route.distanceMiles > MAX_DISTANCE_MILES) {
        return res.status(422).json({ error: `Maximum trip distance is ${MAX_DISTANCE_MILES} miles.` });
    }

    const prices = allPrices(route);
    res.json({
        routeInfo: { distanceMiles: route.distanceMiles, durationMins: route.durationMins },
        estimates: Object.fromEntries(Object.entries(prices).map(([id, p]) => [id, toDollars(p)])),
        currency: config.currency
    });
});

function scheduleFrom(input) {
    if (input.type === 'asap') {
        return { type: 'asap', scheduledFor: null, label: 'Now (in ~30 min)' };
    }
    const when = new Date(`${input.date}T${input.slot}:00Z`);
    const now = Date.now();
    if (Number.isNaN(when.getTime()) || when.getTime() < now - 24 * 3600e3 || when.getTime() > now + 31 * 24 * 3600e3) {
        return null;
    }
    return {
        type: 'scheduled',
        scheduledFor: `${input.date} ${input.slot}:00`,
        label: input.label || `${input.date} • ${input.slot}`
    };
}

/** POST /api/orders — creează comanda; prețul e recalculat aici. */
router.post('/orders', requireAuth, createLimiter, async (req, res) => {
    const data = parseBody(createOrderSchema, req, res);
    if (!data) return;

    const schedule = scheduleFrom(data.schedule);
    if (!schedule) return res.status(400).json({ error: 'The selected date is not valid.' });

    const route = await getRoute(data.pickup, data.dropoff);
    if (route.distanceMiles > MAX_DISTANCE_MILES) {
        return res.status(422).json({ error: `Maximum trip distance is ${MAX_DISTANCE_MILES} miles.` });
    }
    const price = priceFor(data.vehicle, route);

    const id = crypto.randomUUID();
    let code = newOrderCode();

    for (let attempt = 0; ; attempt++) {
        try {
            await pool.query(
                `INSERT INTO orders (
                    id, code, user_id, status,
                    pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
                    distance_miles, duration_mins, vehicle, schedule_type, scheduled_for, schedule_label,
                    items_description, photos_count,
                    base_fare_cents, distance_cost_cents, time_cost_cents, total_cents, currency
                ) VALUES (?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, code, req.user.id,
                    data.pickup.address, data.pickup.lat, data.pickup.lng,
                    data.dropoff.address, data.dropoff.lat, data.dropoff.lng,
                    route.distanceMiles, route.durationMins, data.vehicle,
                    schedule.type, schedule.scheduledFor, schedule.label,
                    data.itemsDescription, data.photosCount,
                    price.baseFareCents, price.distanceCostCents, price.timeCostCents, price.totalCents,
                    config.currency
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

    let clientSecret = null;
    if (stripe) {
        const intent = await stripe.paymentIntents.create({
            amount: price.totalCents,
            currency: config.currency,
            automatic_payment_methods: { enabled: true },
            receipt_email: req.user.email,
            description: `Reloq ${VEHICLES[data.vehicle].name} — ${code}`,
            metadata: { order_code: code, order_id: id, user_id: String(req.user.id) }
        });
        await pool.query('UPDATE orders SET stripe_payment_intent_id = ? WHERE id = ?', [intent.id, id]);
        clientSecret = intent.client_secret;
    }

    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.id = ?`, [id]);
    res.status(201).json({ order: toOrderDto(rows[0]), clientSecret, paymentsEnabled: Boolean(stripe) });
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

    const intent = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id, {
        expand: ['latest_charge']
    });

    const paid = intent.status === 'succeeded' && intent.amount_received === row.total_cents;
    if (paid && row.status === 'pending_payment') {
        const last4 = intent.latest_charge?.payment_method_details?.card?.last4 || null;
        await pool.query("UPDATE orders SET status = 'paid', card_last4 = ? WHERE id = ?", [last4, row.id]);
    }

    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.id = ?`, [row.id]);
    res.json({ order: toOrderDto(rows[0]), paymentStatus: intent.status });
});

/** GET /api/orders/mine — istoricul clientului. */
router.get('/orders/mine', requireAuth, async (req, res) => {
    const [rows] = await pool.query(
        `${ORDER_WITH_CUSTOMER_SQL} WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 50`,
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
