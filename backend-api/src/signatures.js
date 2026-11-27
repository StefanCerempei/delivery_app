// Semnăturile clientului (start = acceptă termenii și pornirea timpului; end = jobul e terminat).
// O semnătură, odată salvată, nu se mai poate înlocui (dovadă pentru client și firmă).
import { pool } from './db.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Verifică semnătura trimisă ca „data:image/png;base64,…”: o imagine PNG reală, între 200 B și 500 KB. */
export function parseSignature(dataUrl) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) return null;
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length < 200 || buf.length > 500 * 1024 || !buf.subarray(0, 4).equals(PNG_MAGIC)) return null;
    return buf;
}

export async function saveSignature({ orderId, kind, signerName, termsAccepted, termsVersion, image, driverName, ip, userAgent }) {
    const [r] = await pool.query(
        `INSERT IGNORE INTO order_signatures
            (order_id, kind, signer_name, terms_accepted, terms_version, image, driver_name, ip, user_agent, signed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
        [orderId, kind, signerName.slice(0, 120), termsAccepted ? 1 : 0, termsVersion || null, image, driverName || null, ip || null, String(userAgent || '').slice(0, 300)]
    );
    return r.affectedRows === 1;
}

/** Datele semnăturilor (fără imagine): { start: {...} | null, end: {...} | null }. */
export async function signaturesFor(orderId) {
    const [rows] = await pool.query(
        'SELECT kind, signer_name, terms_accepted, terms_version, driver_name, ip, user_agent, signed_at FROM order_signatures WHERE order_id = ?',
        [orderId]
    );
    const out = { start: null, end: null };
    for (const r of rows) {
        out[r.kind] = {
            signerName: r.signer_name,
            termsAccepted: Boolean(r.terms_accepted),
            termsVersion: r.terms_version,
            driverName: r.driver_name,
            ip: r.ip,
            device: r.user_agent,
            signedAt: new Date(r.signed_at).toISOString()
        };
    }
    return out;
}

export async function signatureImage(orderId, kind) {
    const [[r]] = await pool.query('SELECT image FROM order_signatures WHERE order_id = ? AND kind = ?', [orderId, kind]);
    return r?.image || null;
}
