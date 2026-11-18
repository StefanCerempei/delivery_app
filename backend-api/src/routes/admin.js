import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';
import { statusSchema, parseBody } from '../validation.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL } from '../orders.js';
import { notifyStatusChange, notifyOrderConfirmed } from '../emails.js';
import { waitForMail } from '../mailer.js';

const router = Router();

const UNPAID_ONLINE_HIDDEN = "NOT (o.status = 'pending_payment' AND o.stripe_payment_intent_id IS NOT NULL)";

// Toate rutele de aici cer cont de dispecer, verificat pe server.
router.use(requireAdmin);

router.get('/orders', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    // Comenzile cu plată online începută dar neterminată (coș abandonat) nu ajung la dispecer:
    // o comandă apare în dispecerat abia după ce transportul e plătit.
    const conditions = [UNPAID_ONLINE_HIDDEN];
    const params = [];
    if (status) {
        conditions.push('o.status = ?');
        params.push(status);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [rows] = await pool.query(
        `${ORDER_WITH_CUSTOMER_SQL} ${where} ORDER BY o.created_at DESC LIMIT 200`,
        params
    );
    res.json({ orders: rows.map((r) => toOrderDto(r, { includeCustomer: true })) });
});

router.get('/orders/:code', async (req, res) => {
    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.code = ?`, [req.params.code]);
    if (!rows[0]) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order: toOrderDto(rows[0], { includeCustomer: true }) });
});

router.patch('/orders/:code/status', async (req, res) => {
    const data = parseBody(statusSchema, req, res);
    if (!data) return;

    const [before] = await pool.query('SELECT status, stripe_payment_intent_id FROM orders WHERE code = ?', [req.params.code]);
    if (!before[0]) return res.status(404).json({ error: 'Order not found.' });

    // O comandă cu plată online se confirmă doar după ce transportul a fost plătit.
    if (data.status === 'confirmed' && before[0].status === 'pending_payment' && before[0].stripe_payment_intent_id) {
        return res.status(409).json({ error: 'This order has not been paid yet. It can be confirmed after the online payment goes through.' });
    }

    await pool.query('UPDATE orders SET status = ? WHERE code = ?', [data.status, req.params.code]);

    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.code = ?`, [req.params.code]);
    const order = toOrderDto(rows[0], { includeCustomer: true });

    // Emailul pleacă doar la o schimbare reală (nu dacă dispecerul apasă de două ori același buton)
    if (before[0].status !== data.status) {
        // Când dispecerul acceptă comanda („confirmed”), clientul primește emailul de confirmare.
        const mail = data.status === 'confirmed' ? notifyOrderConfirmed(order) : notifyStatusChange(order);
        await waitForMail(mail);
    }

    res.json({ order });
});

export default router;
