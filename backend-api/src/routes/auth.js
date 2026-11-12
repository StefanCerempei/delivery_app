import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { setSessionCookie, clearSessionCookie, publicUser, requireAuth } from '../auth.js';
import { registerSchema, loginSchema, verifyCodeSchema, parseBody } from '../validation.js';
import { sendVerificationCode, confirmVerificationCode, VerificationError, RESEND_COOLDOWN_SECONDS } from '../verification.js';

const router = Router();

// Limităm încercările ca să nu se poată ghici parole prin forță brută.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again in a few minutes.' }
});

// Hash fals folosit când emailul nu există, ca timpul de răspuns să nu dezvăluie conturile existente.
const DUMMY_HASH = bcrypt.hashSync('reloq-timing-protection', 12);

router.post('/register', authLimiter, async (req, res) => {
    const data = parseBody(registerSchema, req, res);
    if (!data) return;

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [data.email]);
    if (existing.length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
    }

    const hash = await bcrypt.hash(data.password, 12);
    const [result] = await pool.query(
        // Data nașterii e folosită doar pentru verificarea 18+; nu o salvăm, păstrăm doar momentul confirmării.
        "INSERT INTO users (email, password_hash, full_name, phone, role, age_confirmed_at) VALUES (?, ?, ?, ?, 'customer', UTC_TIMESTAMP())",
        [data.email, hash, data.fullName, data.phone]
    );

    const user = publicUser({ id: result.insertId, email: data.email, full_name: data.fullName, phone: data.phone, role: 'customer' });
    setSessionCookie(res, user);

    // Trimitem imediat codul de verificare. Dacă emailul nu pleacă, clientul îl poate cere din nou.
    let codeSent = false;
    try {
        await sendVerificationCode(user);
        codeSent = true;
    } catch (err) {
        if (!(err instanceof VerificationError)) console.error('[reloq] Cod de verificare:', err);
    }

    res.status(201).json({ user, codeSent, resendAfter: RESEND_COOLDOWN_SECONDS });
});

router.post('/login', authLimiter, async (req, res) => {
    const data = parseBody(loginSchema, req, res);
    if (!data) return;

    const [rows] = await pool.query(
        'SELECT id, email, password_hash, full_name, phone, role, email_verified_at FROM users WHERE email = ?',
        [data.email]
    );
    const user = rows[0];
    const ok = await bcrypt.compare(data.password, user?.password_hash || DUMMY_HASH);

    if (!user || !ok) {
        return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    setSessionCookie(res, user);
    res.json({ user: publicUser(user) });
});

const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again in a few minutes.' }
});

function sendVerificationError(res, err) {
    if (err instanceof VerificationError) {
        return res.status(err.status).json({ error: err.message, ...err.extra });
    }
    throw err;
}

/** POST /api/auth/verify-email/send — trimite (din nou) codul de 6 cifre. */
router.post('/verify-email/send', verifyLimiter, requireAuth, async (req, res) => {
    if (req.user.emailVerified) return res.json({ ok: true, alreadyVerified: true });
    try {
        await sendVerificationCode(req.user);
        res.json({ ok: true, resendAfter: RESEND_COOLDOWN_SECONDS });
    } catch (err) {
        sendVerificationError(res, err);
    }
});

/** POST /api/auth/verify-email/confirm — { code: "123456" } */
router.post('/verify-email/confirm', verifyLimiter, requireAuth, async (req, res) => {
    if (req.user.emailVerified) return res.json({ user: req.user });
    const data = parseBody(verifyCodeSchema, req, res);
    if (!data) return;
    try {
        await confirmVerificationCode(req.user, data.code);
        res.json({ user: { ...req.user, emailVerified: true } });
    } catch (err) {
        sendVerificationError(res, err);
    }
});

router.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
});

router.get('/me', (req, res) => {
    res.json({ user: req.user || null });
});

export default router;
