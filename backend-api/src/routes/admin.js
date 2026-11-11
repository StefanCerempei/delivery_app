import { Router } from 'express';
import { pool } from '../db.js';
import { requireAdmin } from '../auth.js';
import { statusSchema, parseBody } from '../validation.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL } from '../orders.js';

const router = Router();

// Toate rutele de aici cer cont de dispecer, verificat pe server.
router.use(requireAdmin);

router.get('/orders', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const params = [];
    let where = '';
    if (status) {
        where = 'WHERE o.status = ?';
        params.push(status);
    }
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

    const [result] = await pool.query('UPDATE orders SET status = ? WHERE code = ?', [data.status, req.params.code]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Order not found.' });

    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.code = ?`, [req.params.code]);
    res.json({ order: toOrderDto(rows[0], { includeCustomer: true }) });
});

export default router;
