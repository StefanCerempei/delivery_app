// Setările contului: date de profil și schimbarea parolei.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { requireAuth, setSessionCookie } from '../auth.js';
import { profileSchema, changePasswordSchema, parseBody } from '../validation.js';
import { setNewPassword, notifyPasswordChanged } from '../passwordReset.js';

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
    notifyPasswordChanged({ to: req.user.email, fullName: req.user.fullName });
    res.json({ ok: true });
});

export default router;
