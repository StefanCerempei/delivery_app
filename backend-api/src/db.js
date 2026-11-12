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
    await ensureAdmin();
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
         VALUES (?, ?, 'Reloq Dispatcher', 'admin')
         ON DUPLICATE KEY UPDATE role = 'admin', password_hash = VALUES(password_hash)`,
        [config.adminEmail, hash]
    );
    console.log(`[reloq] Cont de dispecer creat: ${config.adminEmail}`);
}
