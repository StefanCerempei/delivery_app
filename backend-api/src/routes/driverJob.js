// Pagina de job a șoferului: /job/<token>, fără cont. Linkul vine în emailul cu jobul.
// Șoferul apasă On my way → Arrived → Completed; manopera = Arrived → Completed.
import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { config } from '../config.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL } from '../orders.js';
import { notifyStatusChange } from '../emails.js';
import { waitForMail } from '../mailer.js';
import { sendDriverReminders } from '../jobs.js';

const router = Router();
const jobLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

async function loadJob(token) {
    if (!TOKEN_RE.test(token)) return null;
    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.driver_token = ?`, [token]);
    return rows[0] ? toOrderDto(rows[0], { includeCustomer: true, includeDriver: true }) : null;
}

const directions = (o) =>
    `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o.pickup.address)}&destination=${encodeURIComponent(
        o.dropoff.address
    )}&travelmode=driving`;

/** Doar ce îi trebuie șoferului: fără prețuri, plăți sau emailul clientului. */
const toJobDto = (o) => ({
    id: o.id,
    status: o.status,
    scheduleText: o.scheduleText,
    vehicle: o.vehicle,
    pickup: { address: o.pickup.address },
    dropoff: { address: o.dropoff.address },
    routeInfo: o.routeInfo,
    itemsDescription: o.itemsDescription,
    dispatchNotes: o.dispatchNotes || '',
    customer: { fullName: o.customer?.fullName || null, phone: o.customer?.phone || null },
    driver: { fullName: o.driver?.fullName || null },
    laborRate: o.price?.labor?.label || null,
    timeline: o.timeline,
    laborActual: o.laborActual,
    directionsUrl: directions(o)
});

const gone = (res) => res.status(404).json({ error: 'This job link is no longer valid. Ask dispatch for the latest job email.' });

router.get('/job/:token', jobLimiter, async (req, res) => {
    const job = await loadJob(req.params.token);
    if (!job || job.status === 'pending_payment') return gone(res);
    res.set('Cache-Control', 'no-store');
    res.json({ job: toJobDto(job) });
});

const ACTIONS = {
    // Plecat spre client: comanda trece „pe drum”, clientul primește emailul „crew on the way”.
    on_my_way: { allowed: ['paid', 'confirmed'], sql: "status = 'en_route', en_route_at = COALESCE(en_route_at, UTC_TIMESTAMP())" },
    // Ajuns la pickup: de aici pornește manopera.
    arrived: {
        allowed: ['paid', 'confirmed', 'en_route'],
        sql: "status = 'en_route', en_route_at = COALESCE(en_route_at, UTC_TIMESTAMP()), arrived_at = COALESCE(arrived_at, UTC_TIMESTAMP())"
    },
    // Terminat la destinație: manopera se oprește.
    completed: { allowed: ['en_route'], needsArrived: true, sql: "status = 'completed', completed_at = COALESCE(completed_at, UTC_TIMESTAMP())" }
};

router.post('/job/:token/:action', jobLimiter, async (req, res) => {
    const action = ACTIONS[req.params.action];
    if (!action) return res.status(400).json({ error: 'Unknown action.' });
    const before = await loadJob(req.params.token);
    if (!before || before.status === 'pending_payment') return gone(res);
    if (before.status === 'cancelled') return res.status(409).json({ error: 'This job was cancelled.' });

    const repeat =
        (req.params.action === 'on_my_way' && before.timeline.enRouteAt) ||
        (req.params.action === 'arrived' && before.timeline.arrivedAt) ||
        (req.params.action === 'completed' && before.status === 'completed');
    if (!repeat) {
        if (!action.allowed.includes(before.status)) {
            return res.status(409).json({ error: 'This step is not available for the job right now.' });
        }
        if (action.needsArrived && !before.timeline.arrivedAt) {
            return res.status(409).json({ error: 'Tap “Arrived” when you reach the pickup first.' });
        }
        await pool.query(`UPDATE orders SET ${action.sql} WHERE code = ?`, [before.id]);
    }

    const job = await loadJob(req.params.token);
    // Clientul află că echipa e pe drum (o singură dată, la prima trecere în „en_route”).
    if (before.status !== 'en_route' && job.status === 'en_route') await waitForMail(notifyStatusChange(job));
    res.json({ job: toJobDto(job) });
});

/**
 * Cron Job (hPanel → Advanced → Cron Jobs), de ex. zilnic la 18:00:
 *   curl -s "https://app.reloqmove.com/api/cron/driver-reminders?key=CRON_SECRET"
 * Trimite fiecărui șofer joburile lui de mâine; rulat de mai multe ori nu trimite dubluri.
 */
router.all('/cron/driver-reminders', async (req, res) => {
    const key = String(req.query.key || req.get('x-cron-key') || '');
    const secret = config.cronSecret || '';
    const ok =
        secret.length >= 16 &&
        key.length === secret.length &&
        crypto.timingSafeEqual(Buffer.from(key), Buffer.from(secret));
    if (!ok) return res.status(403).json({ error: 'Forbidden.' });
    res.json(await sendDriverReminders());
});

export default router;
