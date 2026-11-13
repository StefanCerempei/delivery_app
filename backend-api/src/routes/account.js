// Setările contului: date de profil și schimbarea parolei.
import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { requireAuth, setSessionCookie, clearSessionCookie } from '../auth.js';
import { profileSchema, changePasswordSchema, deleteAccountSchema, parseBody } from '../validation.js';
import { setNewPassword, notifyPasswordChanged } from '../passwordReset.js';
import { waitForMail } from '../mailer.js';
import { notifyAccountDeleted } from '../emails.js';

const router = Router();

const accountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again in a few minutes.' }
});

/** PATCH /api/account/profile — { fullName, phone } */
router.patch('/profile', requireAuth, accountLimiter, async (req, res) => {
    const data = parseBody(profileSchema, req, res);
    if (!data) return;
    await pool.query('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [data.fullName, data.phone, req.user.id]);
    res.json({ user: { ...req.user, fullName: data.fullName, phone: data.phone } });
});

/** POST /api/account/password — { currentPassword, newPassword } */
router.post('/password', requireAuth, accountLimiter, async (req, res) => {
    const data = parseBody(changePasswordSchema, req, res);
    if (!data) return;

    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const ok = rows[0] && (await bcrypt.compare(data.currentPassword, rows[0].password_hash));
    if (!ok) return res.status(400).json({ error: 'Your current password is incorrect.' });
    if (data.currentPassword === data.newPassword) {
        return res.status(400).json({ error: 'Choose a password different from your current one.' });
    }

    const sessionVersion = await setNewPassword(req.user.id, data.newPassword);
    setSessionCookie(res, req.user, sessionVersion); // sesiunea curentă rămâne activă; celelalte dispozitive sunt deconectate
    await waitForMail(notifyPasswordChanged({ to: req.user.email, fullName: req.user.fullName }));
    res.json({ ok: true });
});

const ACTIVE_STATUSES = ['pending_payment', 'paid', 'en_route'];

/**
 * DELETE /api/account — { password }
 * Fără comenzi: contul se șterge complet.
 * Cu comenzi vechi: datele personale sunt anonimizate, comenzile rămân (evidență contabilă/legală).
 * Cu mutări active: refuzat, clientul trebuie întâi să le anuleze/finalizeze.
 */
router.delete('/', requireAuth, accountLimiter, async (req, res) => {
    if (req.user.role === 'admin') {
        return res.status(403).json({ error: 'Dispatcher accounts can’t be deleted from here.' });
    }
    const data = parseBody(deleteAccountSchema, req, res);
    if (!data) return;

    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const ok = rows[0] && (await bcrypt.compare(data.password, rows[0].password_hash));
    if (!ok) return res.status(400).json({ error: 'Your password is incorrect.' });

    const [[counts]] = await pool.query(
        `SELECT COUNT(*) AS total, SUM(status IN (?)) AS active FROM orders WHERE user_id = ?`,
        [ACTIVE_STATUSES, req.user.id]
    );
    if (Number(counts.active) > 0) {
        return res.status(409).json({
            error: 'You have an upcoming move. Please contact us to cancel it before deleting your account.'
        });
    }

    const { email, fullName } = req.user;
    if (Number(counts.total) === 0) {
        await pool.query('DELETE FROM users WHERE id = ?', [req.user.id]);
    } else {
        const randomHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
        await pool.query(
            `UPDATE users SET
                email = ?, full_name = 'Deleted user', phone = NULL, password_hash = ?,
                email_verified_at = NULL, session_version = session_version + 1, deleted_at = UTC_TIMESTAMP()
             WHERE id = ?`,
            [`deleted-${req.user.id}@deleted.invalid`, randomHash, req.user.id]
        );
        await pool.query('DELETE FROM email_verifications WHERE user_id = ?', [req.user.id]);
        await pool.query('DELETE FROM password_resets WHERE user_id = ?', [req.user.id]);
    }

    console.log(`[reloq] Cont șters: #${req.user.id}${Number(counts.total) ? ' (anonimizat, are comenzi)' : ''}`);
    await waitForMail(notifyAccountDeleted({ to: email, fullName }));
    clearSessionCookie(res);
    res.json({ ok: true });
});

export default router;
