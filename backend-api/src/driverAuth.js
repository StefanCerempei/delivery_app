// Conturile șoferilor: autentificare fără parolă, prin link trimis pe email.
// Sesiunea e un cookie separat de cel al clienților / dispecerului.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { pool } from './db.js';

export const DRIVER_COOKIE = 'reloq_driver';
const SESSION_DAYS = 60;
export const LOGIN_LINK_MINUTES = 30;

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const cookieOptions = () => ({
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.corsOrigin ? 'none' : 'lax',
    path: '/'
});

/** Creează un link de autentificare (o singură folosire). Întoarce tokenul brut, de pus în link. */
export async function createLoginToken(driverId) {
    const token = crypto.randomBytes(32).toString('base64url');
    // Un link nou le anulează pe cele vechi încă nefolosite
    await pool.query('DELETE FROM driver_login_tokens WHERE driver_id = ? AND used_at IS NULL', [driverId]);
    await pool.query(
        `INSERT INTO driver_login_tokens (token_hash, driver_id, expires_at) VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ${LOGIN_LINK_MINUTES} MINUTE)`,
        [sha256(token), driverId]
    );
    return token;
}

/** Folosește tokenul din link: întoarce șoferul (activ) sau null dacă linkul e invalid / expirat / folosit. */
export async function consumeLoginToken(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [result] = await pool.query(
        `UPDATE driver_login_tokens SET used_at = UTC_TIMESTAMP()
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()`,
        [sha256(token)]
    );
    if (!result.affectedRows) return null;
    const [rows] = await pool.query(
        `SELECT d.* FROM driver_login_tokens t JOIN drivers d ON d.id = t.driver_id WHERE t.token_hash = ? AND d.active = 1`,
        [sha256(token)]
    );
    if (!rows[0]) return null;
    await pool.query('UPDATE drivers SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [rows[0].id]);
    return rows[0];
}

export function setDriverCookie(res, driver) {
    const token = jwt.sign({ sub: String(driver.id), kind: 'driver', dv: driver.session_version || 0 }, config.jwtSecret, {
        expiresIn: `${SESSION_DAYS}d`
    });
    res.cookie(DRIVER_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_DAYS * 24 * 3600 * 1000 });
}

export const clearDriverCookie = (res) => res.clearCookie(DRIVER_COOKIE, cookieOptions());

export const publicDriver = (d) => ({ id: d.id, fullName: d.full_name, email: d.email, phone: d.phone });

/** Atașează req.driver dacă există o sesiune de șofer validă (șofer activ, sesiune nerevocată). */
export async function loadDriver(req, _res, next) {
    const token = req.cookies?.[DRIVER_COOKIE];
    if (!token) return next();
    try {
        const payload = jwt.verify(token, config.jwtSecret);
        if (payload.kind === 'driver') {
            const [rows] = await pool.query('SELECT * FROM drivers WHERE id = ? AND active = 1', [Number(payload.sub)]);
            if (rows[0] && (payload.dv ?? 0) === rows[0].session_version) req.driver = rows[0];
        }
    } catch {
        // token invalid / expirat
    }
    next();
}

export function requireDriver(req, res, next) {
    if (!req.driver) return res.status(401).json({ error: 'Please log in with the link from your email.', code: 'DRIVER_LOGIN_REQUIRED' });
    next();
}

/** Deconectează șoferul de pe toate dispozitivele (ex. la arhivare). */
export const revokeDriverSessions = (driverId) =>
    pool.query('UPDATE drivers SET session_version = session_version + 1 WHERE id = ?', [driverId]);
