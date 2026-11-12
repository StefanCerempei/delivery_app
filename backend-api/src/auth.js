import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { pool } from './db.js';

export const SESSION_COOKIE = 'reloq_session';

/**
 * `sessionVersion` crește la fiecare schimbare/resetare de parolă;
 * sesiunile emise cu o versiune mai veche nu mai sunt acceptate.
 */
export function setSessionCookie(res, user, sessionVersion = 0) {
    const token = jwt.sign({ sub: String(user.id), role: user.role, sv: sessionVersion }, config.jwtSecret, {
        expiresIn: `${config.sessionDays}d`
    });
    res.cookie(SESSION_COOKIE, token, {
        httpOnly: true, // JavaScript-ul din pagină nu poate citi cookie-ul (protecție XSS)
        secure: config.isProduction, // doar prin HTTPS în producție
        sameSite: config.corsOrigin ? 'none' : 'lax',
        maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
        path: '/'
    });
}

export function clearSessionCookie(res) {
    res.clearCookie(SESSION_COOKIE, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: config.corsOrigin ? 'none' : 'lax',
        path: '/'
    });
}

export function publicUser(row) {
    return {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        phone: row.phone,
        role: row.role,
        emailVerified: Boolean(row.email_verified_at)
    };
}

/** Atașează req.user dacă există o sesiune validă. Nu blochează cererea. */
export async function loadUser(req, _res, next) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    try {
        const payload = jwt.verify(token, config.jwtSecret);
        // Citim din DB la fiecare cerere: un cont șters sau retrogradat pierde accesul imediat.
        const [rows] = await pool.query(
            'SELECT id, email, full_name, phone, role, email_verified_at, session_version FROM users WHERE id = ?',
            [Number(payload.sub)]
        );
        const row = rows[0];
        // După o schimbare/resetare de parolă, sesiunile vechi (alte dispozitive) nu mai sunt valabile.
        if (row && (payload.sv ?? 0) === row.session_version) {
            req.user = publicUser(row);
            req.sessionVersion = row.session_version;
        }
    } catch {
        // token invalid sau expirat: tratat ca neautentificat
    }
    next();
}

export function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
    next();
}

export function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Dispatcher access only.' });
    next();
}

/** Comenzile se pot plasa doar cu emailul confirmat prin cod. */
export function requireVerifiedEmail(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
    if (!req.user.emailVerified) {
        return res.status(403).json({ error: 'Please verify your email before booking.', code: 'EMAIL_NOT_VERIFIED' });
    }
    next();
}
