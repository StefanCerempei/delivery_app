import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { setSessionCookie, clearSessionCookie, publicUser } from '../auth.js';
import { registerSchema, loginSchema, parseBody } from '../validation.js';

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
        "INSERT INTO users (email, password_hash, full_name, phone, role) VALUES (?, ?, ?, ?, 'customer')",
        [data.email, hash, data.fullName, data.phone]
    );

    const user = { id: result.insertId, email: data.email, full_name: data.fullName, phone: data.phone, role: 'customer' };
    setSessionCookie(res, user);
    res.status(201).json({ user: publicUser(user) });
});

router.post('/login', authLimiter, async (req, res) => {
    const data = parseBody(loginSchema, req, res);
    if (!data) return;

    const [rows] = await pool.query(
        'SELECT id, email, password_hash, full_name, phone, role FROM users WHERE email = ?',
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

router.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
});

router.get('/me', (req, res) => {
    res.json({ user: req.user || null });
});

export default router;
