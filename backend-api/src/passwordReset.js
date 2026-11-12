// Resetarea parolei prin link trimis pe email.
// Tokenul (32 de octeți aleatori) ajunge doar în email; în baza de date stă doar hash-ul lui.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { config } from './config.js';
import { mailEnabled, mailSettings } from './mailer.js';
import { sendPasswordResetEmail, notifyPasswordChanged } from './emails.js';

const TOKEN_TTL_MINUTES = 60;
const RESEND_COOLDOWN_SECONDS = 60;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Adresa publică pentru link. Din APP_URL (nu din antetul Host, care poate fi falsificat). */
function appUrl(req) {
    if (mailSettings.appUrl) return mailSettings.appUrl;
    if (!config.isProduction) return `${req.protocol}://${req.get('host')}`;
    return null;
}

/**
 * Trimite linkul dacă există contul. Răspunsul către browser e mereu același,
 * ca nimeni să nu poată afla ce emailuri au cont la RELOQ.
 */
export async function requestPasswordReset(req, email) {
    const [rows] = await pool.query('SELECT id, email, full_name FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) return;

    const [recent] = await pool.query(
        'SELECT 1 FROM password_resets WHERE user_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL ? SECOND',
        [user.id, RESEND_COOLDOWN_SECONDS]
    );
    if (recent.length > 0) return;

    const base = appUrl(req);
    if (!base) {
        console.error('[reloq] Resetare parolă: lipsește APP_URL, linkul nu poate fi construit.');
        return;
    }

    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), expires_at = VALUES(expires_at), created_at = VALUES(created_at)`,
        [user.id, hashToken(token), TOKEN_TTL_MINUTES]
    );

    const url = `${base}/reset-password?token=${token}`;
    if (!mailEnabled) {
        console.log(`[reloq] (dev) Link de resetare pentru ${user.email}: ${url}`);
        return;
    }
    try {
        await sendPasswordResetEmail({ to: user.email, fullName: user.full_name, url, minutes: TOKEN_TTL_MINUTES });
    } catch (err) {
        console.error(`[reloq] Email eșuat: resetare parolă → ${user.email}: ${err.code || ''} ${err.message}`);
    }
}

/** Setează parola nouă și deconectează toate sesiunile. Întoarce noua versiune de sesiune. */
export async function setNewPassword(userId, password) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
        'UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(), session_version = session_version + 1 WHERE id = ?',
        [hash, userId]
    );
    await pool.query('DELETE FROM password_resets WHERE user_id = ?', [userId]);
    const [rows] = await pool.query('SELECT session_version FROM users WHERE id = ?', [userId]);
    return rows[0].session_version;
}

/** Consumă tokenul. Întoarce utilizatorul sau null dacă linkul e invalid/expirat. */
export async function resetPasswordWithToken(token, password) {
    const [rows] = await pool.query(
        `SELECT u.id, u.email, u.full_name, u.phone, u.role
         FROM password_resets r JOIN users u ON u.id = r.user_id
         WHERE r.token_hash = ? AND r.expires_at > UTC_TIMESTAMP()`,
        [hashToken(token)]
    );
    const user = rows[0];
    if (!user) return null;

    const sessionVersion = await setNewPassword(user.id, password);
    // Linkul a venit pe email, deci adresa e dovedit a clientului.
    await pool.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?', [user.id]);
    notifyPasswordChanged({ to: user.email, fullName: user.full_name });
    return { ...user, email_verified_at: new Date(), session_version: sessionVersion };
}

export { notifyPasswordChanged };
