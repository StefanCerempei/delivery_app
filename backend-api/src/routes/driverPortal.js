// Panoul șoferului: /api/driver/* (autentificare prin link pe email + lista joburilor lui).
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { mailSettings } from '../mailer.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL, describeLocation } from '../orders.js';
import { ensureDriverToken } from '../jobs.js';
import { sendDriverLoginLink } from '../emails.js';
import {
    loadDriver,
    requireDriver,
    createLoginToken,
    consumeLoginToken,
    setDriverCookie,
    clearDriverCookie,
    publicDriver,
    LOGIN_LINK_MINUTES
} from '../driverAuth.js';

const router = Router();
router.use(loadDriver);

const linkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false });
const portalLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });

export const loginUrl = (token) => `${mailSettings.appUrl || ''}/driver/login?token=${token}`;

/** Trimite linkul de autentificare unui șofer (folosit și de dispecerat pentru invitație). */
export async function emailLoginLink(driver, { invite = false } = {}) {
    const token = await createLoginToken(driver.id);
    await sendDriverLoginLink({
        to: driver.email,
        fullName: driver.full_name,
        url: loginUrl(token),
        minutes: LOGIN_LINK_MINUTES,
        invite
    });
}

/** POST /api/driver/login-link { email } — răspunsul e același și dacă emailul nu e al unui șofer. */
router.post('/login-link', linkLimiter, async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 255) : '';
    if (!email.includes('@')) return res.status(400).json({ error: 'Please enter your email address.' });
    const [rows] = await pool.query('SELECT * FROM drivers WHERE email = ? AND active = 1', [email]);
    if (rows[0]) {
        try {
            await emailLoginLink(rows[0]);
        } catch (err) {
            console.error(`[reloq] Linkul de autentificare pentru șofer nu a plecat: ${err.message}`);
            return res.status(503).json({ error: 'We could not send the email right now. Please try again or call dispatch.' });
        }
    }
    res.json({ ok: true });
});

/** POST /api/driver/session { token } — deschide sesiunea din linkul primit pe email. */
router.post('/session', linkLimiter, async (req, res) => {
    const driver = await consumeLoginToken(req.body?.token);
    if (!driver) {
        return res.status(400).json({ error: 'This login link has expired or was already used. Enter your email to get a new one.' });
    }
    setDriverCookie(res, driver);
    res.json({ driver: publicDriver(driver) });
});

router.post('/logout', (req, res) => {
    clearDriverCookie(res);
    res.json({ ok: true });
});

router.get('/me', (req, res) => {
    res.json({ driver: req.driver ? publicDriver(req.driver) : null });
});

/** Rezumatul unui job pentru listă (fără prețuri; cu linkul paginii de job). */
const toCard = (o, token) => ({
    id: o.id,
    status: o.status,
    scheduleText: o.scheduleText,
    scheduledFor: o.schedule?.scheduledFor,
    vehicle: o.vehicle?.name,
    customer: o.customer?.fullName || null,
    pickup: { address: o.pickup.address, summary: describeLocation(o.pickup.details) },
    dropoff: { address: o.dropoff.address, summary: describeLocation(o.dropoff.details) },
    photos: o.photoIds?.length || 0,
    timerRunning: Boolean(o.timeline?.arrivedAt && !o.timeline?.completedAt),
    labor: o.laborActual,
    laborStatus: o.laborBilling?.status || 'none',
    jobPath: `/job/${token}`
});

/** GET /api/driver/jobs — joburile active (azi și viitoare) și cele terminate în ultimele 14 zile. */
router.get('/jobs', requireDriver, portalLimiter, async (req, res) => {
    const [rows] = await pool.query(
        `${ORDER_WITH_CUSTOMER_SQL}
         WHERE o.driver_id = ?
           AND (o.status IN ('paid', 'confirmed', 'en_route')
                OR (o.status = 'completed' AND o.scheduled_for >= UTC_TIMESTAMP() - INTERVAL 14 DAY))
         ORDER BY o.scheduled_for ASC`,
        [req.driver.id]
    );
    const active = [];
    const done = [];
    for (const row of rows) {
        const order = toOrderDto(row, { includeCustomer: true, includeDriver: true });
        const card = toCard(order, row.driver_token || (await ensureDriverToken(order.id)));
        (order.status === 'completed' ? done : active).push(card);
    }
    res.set('Cache-Control', 'no-store');
    res.json({ driver: publicDriver(req.driver), active, done: done.reverse() });
});

export default router;
