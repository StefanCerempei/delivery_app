import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

export const pool = mysql.createPool({
    ...config.db,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    timezone: 'Z',
    decimalNumbers: true
});

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');

/** Creează tabelele dacă nu există și contul de dispecer, dacă e configurat. */
export async function migrate() {
    const sql = await fs.readFile(schemaPath, 'utf8');
    const statements = sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
        .filter(Boolean);

    for (const statement of statements) {
        await pool.query(statement);
    }

    await addColumnIfMissing('users', 'age_confirmed_at', 'DATETIME NULL AFTER role');
    await addColumnIfMissing('users', 'email_verified_at', 'DATETIME NULL AFTER age_confirmed_at');
    await addColumnIfMissing('users', 'password_changed_at', 'DATETIME NULL AFTER email_verified_at');
    await addColumnIfMissing('users', 'session_version', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER password_changed_at');
    await addColumnIfMissing('users', 'deleted_at', 'DATETIME NULL AFTER session_version');
    await addColumnIfMissing('orders', 'paid_at', 'DATETIME NULL AFTER card_last4');
    await addColumnIfMissing('orders', 'payment_method', 'VARCHAR(20) NULL AFTER paid_at');
    await addColumnIfMissing('orders', 'paypal_order_id', 'VARCHAR(64) NULL AFTER payment_method');
    await addColumnIfMissing('orders', 'paypal_capture_id', 'VARCHAR(64) NULL AFTER paypal_order_id');
    await addColumnIfMissing('orders', 'pricing_version', 'TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER currency');
    await addColumnIfMissing('orders', 'outbound_mins', 'INT UNSIGNED NULL AFTER pricing_version');
    await addColumnIfMissing('orders', 'return_mins', 'INT UNSIGNED NULL AFTER outbound_mins');
    await addColumnIfMissing('orders', 'labor_cents_per_min', 'INT UNSIGNED NULL AFTER return_mins');
    await ensureStatusEnum();
    await ensureAdmin();
}

/** Adaugă statusul 'confirmed' în ENUM-ul comenzilor, dacă lipsește (baze create înainte). */
async function ensureStatusEnum() {
    const [rows] = await pool.query(
        "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'status'"
    );
    if (rows[0] && !/'confirmed'/.test(rows[0].t)) {
        await pool.query(
            "ALTER TABLE orders MODIFY status ENUM('pending_payment','confirmed','paid','en_route','completed','cancelled') NOT NULL DEFAULT 'pending_payment'"
        );
        console.log('[reloq] Status „confirmed” adăugat în comenzi.');
    }
}

/** Migrare simplă pentru baze create înainte de o coloană nouă. */
async function addColumnIfMissing(table, column, definition) {
    const [rows] = await pool.query(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [table, column]
    );
    if (rows.length === 0) {
        await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
        console.log(`[reloq] Coloană adăugată: ${table}.${column}`);
    }
}

async function ensureAdmin() {
    const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (admins.length > 0) return;

    if (!config.adminEmail || !config.adminPassword) {
        console.warn('[reloq] Nu există niciun cont de dispecer. Setează ADMIN_EMAIL și ADMIN_PASSWORD și repornește.');
        return;
    }
    if (config.adminPassword.length < 10) {
        console.warn('[reloq] ADMIN_PASSWORD trebuie să aibă minim 10 caractere. Contul de dispecer NU a fost creat.');
        return;
    }

    const hash = await bcrypt.hash(config.adminPassword, 12);
    await pool.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES (?, ?, 'RELOQ Dispatcher', 'admin')
         ON DUPLICATE KEY UPDATE role = 'admin', password_hash = VALUES(password_hash)`,
        [config.adminEmail, hash]
    );
    console.log(`[reloq] Cont de dispecer creat: ${config.adminEmail}`);
}
