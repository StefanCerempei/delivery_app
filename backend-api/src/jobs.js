// Jobul văzut de șofer: linkul fără cont (/job/<token>), momentele raportate și reamintirile.
import crypto from 'node:crypto';
import { pool } from './db.js';
import { mailSettings } from './mailer.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL } from './orders.js';
import { businessTodayUTC } from './time.js';
import { notifyDriverReminder } from './emails.js';

const DAY_MS = 24 * 3600e3;

export const jobUrl = (token) => (mailSettings.appUrl && token ? `${mailSettings.appUrl}/driver/job/${token}` : null);

/** Tokenul linkului de job al comenzii (îl creează la prima nevoie). Se schimbă când se schimbă șoferul. */
export async function ensureDriverToken(code) {
    const [rows] = await pool.query('SELECT driver_token FROM orders WHERE code = ?', [code]);
    if (rows[0]?.driver_token) return rows[0].driver_token;
    const token = crypto.randomBytes(32).toString('base64url'); // 43 de caractere
    await pool.query('UPDATE orders SET driver_token = ? WHERE code = ? AND driver_token IS NULL', [token, code]);
    const [again] = await pool.query('SELECT driver_token FROM orders WHERE code = ?', [code]);
    return again[0]?.driver_token || token;
}

/** Notează momentul unui status (prima dată): pe drum / finalizat. */
export async function stampStatus(code, status) {
    const column = { en_route: 'en_route_at', completed: 'completed_at' }[status];
    if (!column) return;
    await pool.query(`UPDATE orders SET ${column} = COALESCE(${column}, UTC_TIMESTAMP()) WHERE code = ?`, [code]);
}

/** „YYYY-MM-DD” pentru mâine, după ora firmei. */
export function tomorrowDate() {
    return new Date(businessTodayUTC().getTime() + DAY_MS).toISOString().slice(0, 10);
}

/**
 * Trimite fiecărui șofer activ lista joburilor lui de pe `date` (implicit mâine).
 * Un singur email pe șofer pe zi (tabela driver_reminders), cu excepția `force`.
 */
export async function sendDriverReminders({ date = tomorrowDate(), force = false } = {}) {
    const [rows] = await pool.query(
        `${ORDER_WITH_CUSTOMER_SQL}
         WHERE o.driver_id IS NOT NULL AND d.active = 1
           AND o.status IN ('paid', 'confirmed', 'en_route')
           AND o.scheduled_for BETWEEN ? AND ?
         ORDER BY o.scheduled_for ASC`,
        [`${date} 00:00:00`, `${date} 23:59:59`]
    );

    const byDriver = new Map();
    for (const row of rows) {
        const order = toOrderDto(row, { includeCustomer: true, includeDriver: true });
        order.jobUrl = jobUrl(await ensureDriverToken(order.id));
        const list = byDriver.get(order.driver.id) || [];
        list.push(order);
        byDriver.set(order.driver.id, list);
    }

    const result = { date, drivers: 0, jobs: rows.length, skipped: 0, failed: 0 };
    for (const [driverId, orders] of byDriver) {
        if (!force) {
            const [done] = await pool.query('SELECT 1 FROM driver_reminders WHERE driver_id = ? AND job_date = ?', [driverId, date]);
            if (done.length) {
                result.skipped += 1;
                continue;
            }
        }
        const sent = await notifyDriverReminder(orders[0].driver, orders, date);
        if (sent) {
            await pool.query(
                `INSERT INTO driver_reminders (driver_id, job_date, sent_at) VALUES (?, ?, UTC_TIMESTAMP())
                 ON DUPLICATE KEY UPDATE sent_at = VALUES(sent_at)`,
                [driverId, date]
            );
            result.drivers += 1;
        } else {
            result.failed += 1;
        }
    }
    return result;
}
