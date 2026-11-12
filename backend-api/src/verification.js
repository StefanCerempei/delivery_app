// Verificarea emailului prin cod unic de 6 cifre.
// Codul nu se salvează în clar: doar HMAC-ul lui (cheia e JWT_SECRET).
import crypto from 'node:crypto';
import { pool } from './db.js';
import { config } from './config.js';
import { mailEnabled } from './mailer.js';
import { sendVerificationCodeEmail } from './emails.js';

export const CODE_TTL_MINUTES = 10;
export const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5; // greșeli permise per cod, apoi trebuie cerut altul
const MAX_SENDS_PER_HOUR = 5;

const hashCode = (userId, code) =>
    crypto.createHmac('sha256', config.jwtSecret).update(`${userId}:${code}`).digest('hex');

export class VerificationError extends Error {
    constructor(message, status, extra = {}) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

/** Generează un cod nou, îl salvează și îl trimite pe email. */
export async function sendVerificationCode(user) {
    const [rows] = await pool.query(
        `SELECT TIMESTAMPDIFF(SECOND, sent_at, UTC_TIMESTAMP()) AS since_sent,
                TIMESTAMPDIFF(SECOND, sends_window_start, UTC_TIMESTAMP()) AS since_window,
                sends_count
         FROM email_verifications WHERE user_id = ?`,
        [user.id]
    );
    const prev = rows[0];

    if (prev && prev.since_sent < RESEND_COOLDOWN_SECONDS) {
        const wait = RESEND_COOLDOWN_SECONDS - prev.since_sent;
        throw new VerificationError(`Please wait ${wait} seconds before requesting a new code.`, 429, { retryAfter: wait });
    }
    const windowExpired = !prev || prev.since_window >= 3600;
    if (!windowExpired && prev.sends_count >= MAX_SENDS_PER_HOUR) {
        throw new VerificationError('Too many codes requested. Please try again in an hour.', 429);
    }

    if (!mailEnabled && config.isProduction) {
        throw new VerificationError('Email verification is temporarily unavailable. Please call us to book.', 503);
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await pool.query(
        `INSERT INTO email_verifications (user_id, code_hash, expires_at, attempts, sent_at, sends_window_start, sends_count)
         VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1)
         ON DUPLICATE KEY UPDATE
            code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), attempts = 0, sent_at = VALUES(sent_at),
            sends_window_start = IF(?, VALUES(sends_window_start), sends_window_start),
            sends_count = IF(?, 1, sends_count + 1)`,
        [user.id, hashCode(user.id, code), CODE_TTL_MINUTES, windowExpired, windowExpired]
    );

    if (!mailEnabled) {
        // Doar local (NODE_ENV=development) fără SMTP: codul apare în terminal.
        console.log(`[reloq] (dev) Cod de verificare pentru ${user.email}: ${code}`);
        return;
    }

    try {
        await sendVerificationCodeEmail({ to: user.email, fullName: user.fullName, code, minutes: CODE_TTL_MINUTES });
    } catch (err) {
        console.error(`[reloq] Email eșuat: cod de verificare → ${user.email}: ${err.code || ''} ${err.message}`);
        // Permitem retrimiterea imediată dacă emailul n-a plecat.
        await pool.query('UPDATE email_verifications SET sent_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR WHERE user_id = ?', [user.id]);
        throw new VerificationError('We could not send the code. Please try again in a moment.', 502);
    }
}

/** Verifică codul; la succes marchează emailul ca verificat. */
export async function confirmVerificationCode(user, code) {
    const [rows] = await pool.query(
        'SELECT code_hash, attempts, expires_at < UTC_TIMESTAMP() AS expired FROM email_verifications WHERE user_id = ?',
        [user.id]
    );
    const row = rows[0];
    if (!row) throw new VerificationError('Please request a verification code first.', 400);
    if (row.expired) throw new VerificationError('This code has expired. Please request a new one.', 400);
    if (row.attempts >= MAX_ATTEMPTS) {
        throw new VerificationError('Too many incorrect attempts. Please request a new code.', 429);
    }

    const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(hashCode(user.id, code), 'hex'));
    if (!ok) {
        await pool.query('UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = ?', [user.id]);
        const left = MAX_ATTEMPTS - row.attempts - 1;
        throw new VerificationError(
            left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Please request a new code.',
            400
        );
    }

    await pool.query('UPDATE users SET email_verified_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
    await pool.query('DELETE FROM email_verifications WHERE user_id = ?', [user.id]);
}
