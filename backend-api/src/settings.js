// Setări simple, modificabile din dispecerat (tabela app_settings).
import { pool } from './db.js';

const DEFAULTS = {
    // true: la finalul jobului clientul primește imediat cererea de plată pentru manoperă;
    // false: dispecerul verifică și aprobă suma întâi.
    labor_auto_request: 'false'
};

export async function getSetting(name) {
    const [rows] = await pool.query('SELECT value FROM app_settings WHERE name = ?', [name]);
    return rows[0]?.value ?? DEFAULTS[name] ?? null;
}

export async function setSetting(name, value) {
    await pool.query(
        'INSERT INTO app_settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [name, String(value)]
    );
}

export async function getSettings() {
    const [rows] = await pool.query('SELECT name, value FROM app_settings');
    const out = { ...DEFAULTS };
    for (const r of rows) out[r.name] = r.value;
    return { laborAutoRequest: out.labor_auto_request === 'true' };
}
