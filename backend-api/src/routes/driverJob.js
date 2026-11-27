// Pagina de job a șoferului: /job/<token>, fără cont. Linkul vine în emailul cu jobul.
// Șoferul apasă On my way → Arrived → Completed; manopera = Arrived → Completed.
import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { config } from '../config.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL, describeLocation } from '../orders.js';
import { notifyStatusChange } from '../emails.js';
import { waitForMail } from '../mailer.js';
import { sendDriverReminders } from '../jobs.js';
import { sendPhoto } from '../photos.js';
import { onJobCompleted, markLaborCash, UNPAID_LABOR } from '../labor.js';
import { parseSignature, saveSignature, signaturesFor } from '../signatures.js';
import { TERMS_VERSION } from './orders.js';

const router = Router();
const jobLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

async function loadJob(token) {
    if (!TOKEN_RE.test(token)) return null;
    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.driver_token = ?`, [token]);
    if (!rows[0]) return null;
    const job = toOrderDto(rows[0], { includeCustomer: true, includeDriver: true });
    job.uuid = rows[0].id;
    job.signatures = await signaturesFor(rows[0].id);
    return job;
}

// Clientul semnează pe telefonul șoferului: la sosire (acceptă termenii, pornește timpul) și la final
const SIGNED_ACTIONS = { arrived: 'start', completed: 'end' };

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
    pickup: { address: o.pickup.address, details: o.pickup.details, summary: describeLocation(o.pickup.details) },
    dropoff: { address: o.dropoff.address, details: o.dropoff.details, summary: describeLocation(o.dropoff.details) },
    routeInfo: o.routeInfo,
    itemsDescription: o.itemsDescription,
    dispatchNotes: o.dispatchNotes || '',
    customer: { fullName: o.customer?.fullName || null, phone: o.customer?.phone || null },
    driver: { fullName: o.driver?.fullName || null },
    laborRate: o.price?.labor?.label || null,
    timeline: o.timeline,
    laborActual: o.laborActual,
    laborBilling: { status: o.laborBilling?.status || 'none', amount: o.laborBilling?.amount ?? null },
    directionsUrl: directions(o),
    photoIds: o.photoIds || [],
    signatures: o.signatures || { start: null, end: null }
});

const gone = (res) => res.status(404).json({ error: 'This job link is no longer valid. Ask dispatch for the latest job email.' });

router.get('/job/:token', jobLimiter, async (req, res) => {
    const job = await loadJob(req.params.token);
    if (!job || job.status === 'pending_payment') return gone(res);
    res.set('Cache-Control', 'no-store');
    res.json({ job: toJobDto(job) });
});

/** Pozele obiectelor, pentru șoferul cu linkul jobului. */
router.get('/job/:token/photos/:photoId', jobLimiter, async (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) return res.status(404).end();
    const [rows] = await pool.query("SELECT id FROM orders WHERE driver_token = ? AND status <> 'pending_payment'", [req.params.token]);
    if (!rows[0]) return res.status(404).end();
    await sendPhoto(res, rows[0].id, req.params.photoId);
});

const ACTIONS = {
    // Plecat spre client: comanda trece „pe drum”, clientul primește emailul „crew on the way”.
    on_my_way: { allowed: ['paid', 'confirmed'], sql: "status = 'en_route', en_route_at = COALESCE(en_route_at, UTC_TIMESTAMP())" },
    // Ajuns la pickup: de aici pornește manopera.
    arrived: {
        allowed: ['paid', 'confirmed', 'en_route'],
        sql: "status = 'en_route', en_route_at = COALESCE(en_route_at, UTC_TIMESTAMP()), arrived_at = COALESCE(arrived_at, UTC_TIMESTAMP())"
    },
    // Pauză (ex. masă): timpul de pauză nu se taxează.
    pause: { allowed: ['en_route'], needsArrived: true, sql: 'labor_paused_at = COALESCE(labor_paused_at, UTC_TIMESTAMP())' },
    resume: {
        allowed: ['en_route'],
        needsArrived: true,
        sql: `labor_paused_secs = labor_paused_secs + IF(labor_paused_at IS NULL, 0, TIMESTAMPDIFF(SECOND, labor_paused_at, UTC_TIMESTAMP())),
              labor_paused_at = NULL`
    },
    // Terminat la destinație: manopera se oprește (o pauză în curs se închide aici).
    completed: {
        allowed: ['en_route'],
        needsArrived: true,
        sql: `labor_paused_secs = labor_paused_secs + IF(labor_paused_at IS NULL, 0, TIMESTAMPDIFF(SECOND, labor_paused_at, UTC_TIMESTAMP())),
              labor_paused_at = NULL, status = 'completed', completed_at = COALESCE(completed_at, UTC_TIMESTAMP())`
    }
};

/** Șoferul bifează că clientul a plătit manopera cash. */
router.post('/job/:token/cash', jobLimiter, async (req, res) => {
    const job = await loadJob(req.params.token);
    if (!job || job.status === 'pending_payment') return gone(res);
    if (job.status !== 'completed' || !UNPAID_LABOR.includes(job.laborBilling.status)) {
        return res.status(409).json({ error: 'There is no unpaid labor on this job.' });
    }
    const result = await markLaborCash(job.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ job: toJobDto(await loadJob(req.params.token)) });
});

router.post('/job/:token/:action', jobLimiter, async (req, res) => {
    const action = ACTIONS[req.params.action];
    if (!action) return res.status(400).json({ error: 'Unknown action.' });
    const before = await loadJob(req.params.token);
    if (!before || before.status === 'pending_payment') return gone(res);
    if (before.status === 'cancelled') return res.status(409).json({ error: 'This job was cancelled.' });

    const repeat =
        (req.params.action === 'on_my_way' && before.timeline.enRouteAt) ||
        (req.params.action === 'arrived' && before.timeline.arrivedAt) ||
        (req.params.action === 'pause' && before.timeline.pausedAt) ||
        (req.params.action === 'resume' && !before.timeline.pausedAt) ||
        (req.params.action === 'completed' && before.status === 'completed');
    if (!repeat) {
        if (!action.allowed.includes(before.status)) {
            return res.status(409).json({ error: 'This step is not available for the job right now.' });
        }
        if (action.needsArrived && !before.timeline.arrivedAt) {
            return res.status(409).json({ error: 'Tap “Arrived” when you reach the pickup first.' });
        }
        const kind = SIGNED_ACTIONS[req.params.action];
        if (kind && !before.signatures[kind]) {
            const image = parseSignature(req.body?.signature);
            const signerName = String(req.body?.signerName || '').trim();
            if (signerName.length < 2) return res.status(400).json({ error: 'Please enter the customer’s name.', code: 'SIGNATURE_REQUIRED' });
            if (!image) return res.status(400).json({ error: 'The customer needs to sign first.', code: 'SIGNATURE_REQUIRED' });
            if (kind === 'start' && req.body?.termsAccepted !== true) {
                return res.status(400).json({ error: 'The customer needs to accept the terms.', code: 'SIGNATURE_REQUIRED' });
            }
            await saveSignature({
                orderId: before.uuid,
                kind,
                signerName,
                termsAccepted: kind === 'start',
                termsVersion: TERMS_VERSION,
                image,
                driverName: before.driver?.fullName,
                ip: req.ip,
                userAgent: req.get('user-agent')
            });
        }
        await pool.query(`UPDATE orders SET ${action.sql} WHERE code = ?`, [before.id]);
    }

    // Jobul s-a terminat: manopera merge la verificare sau direct la client (după setare)
    if (req.params.action === 'completed' && before.status !== 'completed') await onJobCompleted(before.id);

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
