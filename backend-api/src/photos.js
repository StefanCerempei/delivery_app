// Pozele obiectelor: încărcare (clientul care a făcut comanda) și citire (client, dispecer, șofer).
import express from 'express';
import { pool } from './db.js';

export const MAX_PHOTOS = 5;
const MAX_BYTES = 3 * 1024 * 1024; // după comprimarea din browser o poză are de obicei sub 1 MB

/** Acceptăm doar JPEG / PNG / WebP, verificat după primii octeți (nu după ce declară browserul). */
export function detectImage(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}

/** Corpul cererii de încărcare: poza ca octeți (Content-Type: image/…), nu JSON. */
export const rawImageBody = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_BYTES });

/** Salvează poza; întoarce { photoId } sau { error, status }. */
export async function savePhoto(orderId, body) {
    const mime = detectImage(body);
    if (!mime) return { status: 415, error: 'Only JPG, PNG or WebP photos are supported.' };

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        // blocăm comanda cât numărăm, ca două încărcări simultane să nu treacă de limită
        await conn.query('SELECT id FROM orders WHERE id = ? FOR UPDATE', [orderId]);
        const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM order_photos WHERE order_id = ?', [orderId]);
        if (Number(n) >= MAX_PHOTOS) {
            await conn.rollback();
            return { status: 409, error: `You can add up to ${MAX_PHOTOS} photos per booking.` };
        }
        const [result] = await conn.query('INSERT INTO order_photos (order_id, mime, size_bytes, data) VALUES (?, ?, ?, ?)', [
            orderId,
            mime,
            body.length,
            body
        ]);
        await conn.query('UPDATE orders SET photos_count = ? WHERE id = ?', [Number(n) + 1, orderId]);
        await conn.commit();
        return { photoId: result.insertId };
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    } finally {
        conn.release();
    }
}

/** Trimite poza `photoId` dacă aparține comenzii `orderId`. */
export async function sendPhoto(res, orderId, photoId) {
    const id = Number(photoId);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).end();
    const [rows] = await pool.query('SELECT mime, data FROM order_photos WHERE id = ? AND order_id = ?', [id, orderId]);
    if (!rows[0]) return res.status(404).end();
    res.set({
        'Content-Type': rows[0].mime,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="photo-${id}.${rows[0].mime.split('/')[1]}"`
    });
    res.send(rows[0].data);
}
