// Chitanța finală: emailul pentru client (rezervare + manoperă + total) și PDF-ul oficial pentru firmă
// (date client, adrese, serviciu, plăți, orele jobului, termenii și semnăturile clientului).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { pool } from './db.js';
import { toOrderDto, ORDER_WITH_CUSTOMER_SQL, describeLocation } from './orders.js';
import { signaturesFor, signatureImage } from './signatures.js';
import { mailSettings, waitForMail } from './mailer.js';
import { notifyFinalReceipt, notifyCompanyReceipt } from './emails.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOGO = [path.join(here, '../../frontend-client/dist/email-logo.png'), path.join(here, '../../frontend-client/public/email-logo.png')].find(
    (p) => fs.existsSync(p)
);

const COMPANY = {
    name: 'RELOQ Moving Services LLC',
    address: '98 Mountain Gate Rd., Ashland, MA 01721',
    phone: '(508) 816-7230',
    email: 'info@reloqmove.com',
    web: 'reloqmove.com',
    licenses: 'U.S. DOT No. 4182047 · MC No. 1623651 · MA DPU No. 24HG10'
};

// Termenii principali ai rezervării, așa cum sunt prezentați clientului (versiunea completă: /terms).
const TERMS = [
    'Pricing: the booking price (reservation fee for driving time to and from our Dedham base, a service fee and transportation per mile from pickup to destination) is paid at booking. Labor is billed after the job is completed.',
    'Labor is calculated from the actual time between crew arrival at the pickup and completion of the job at the destination, rounded up to the next 5-minute increment, at the per-minute rate of the booked crew size. Waiting time and access delays during this period are included; crew breaks are not billed.',
    'The customer must disclose stairs, elevators, long carries, heavy, fragile or high-value items and access restrictions. Undisclosed conditions may increase labor time.',
    'Free cancellation up to 24 hours before the arrival window. Later cancellations or no-shows may be charged a cancellation fee as described in the Terms of Service.',
    'Liability for loss or damage is limited as described in the Terms of Service; claims must be reported promptly with photos.',
    'These terms are governed by the laws of the Commonwealth of Massachusetts.'
];

const TZ = 'America/New_York';
const fmtDateTime = (iso) =>
    iso
        ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
              new Date(iso)
          )
        : '—';
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
// Fonturile standard ale PDF-ului nu au săgeți / minus tipografic
const clean = (v) => String(v ?? '—').replace(/→/g, '->').replace(/−/g, '-');
const LABOR_STATUS = {
    none: 'Not billed yet',
    pending_review: 'Under review',
    requested: 'Requested — not paid yet',
    paid: 'Paid online',
    paid_cash: 'Paid in cash',
    waived: 'No charge'
};

/** Toate datele chitanței pentru o comandă (după cod). */
export async function receiptData(code) {
    const [rows] = await pool.query(`${ORDER_WITH_CUSTOMER_SQL} WHERE o.code = ?`, [code]);
    const row = rows[0];
    if (!row) return null;
    const order = toOrderDto(row, { includeCustomer: true, includeDriver: true });
    const signatures = await signaturesFor(row.id);
    const images = {};
    for (const kind of ['start', 'end']) if (signatures[kind]) images[kind] = await signatureImage(row.id, kind);

    const booking = order.totalAmount || 0;
    const laborSettled = ['paid', 'paid_cash', 'waived'].includes(order.laborBilling.status);
    const labor = order.laborBilling.status === 'waived' ? 0 : order.laborBilling.amount ?? order.laborActual?.amount ?? 0;
    return {
        order,
        uuid: row.id,
        bookingPaidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
        termsAcceptedAt: row.terms_accepted_at ? new Date(row.terms_accepted_at).toISOString() : null,
        termsVersion: row.terms_version || null,
        signatures,
        images,
        booking,
        labor,
        laborSettled,
        total: Math.round((booking + (laborSettled ? labor : 0)) * 100) / 100
    };
}

const bookingMethod = (o) =>
    !o.paidOnline
        ? 'Not paid online'
        : o.paymentMethod === 'offline'
          ? 'Paid to RELOQ (cash / phone)'
          : o.paymentMethod === 'paypal'
            ? 'PayPal'
            : `Card${o.cardLast4 ? ` •••• ${o.cardLast4}` : ''}`;

/** PDF-ul oficial (Buffer). */
export function buildReceiptPdf(d) {
    const o = d.order;
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: `RELOQ receipt ${o.id}`, Author: COMPANY.name } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const NAVY = '#0B1F3B';
    const RED = '#E4362C';
    const GRAY = '#5F6A78';
    const W = doc.page.width - 96;

    const ensure = (h) => {
        if (doc.y + h > doc.page.height - 60) doc.addPage();
    };
    const section = (title) => {
        ensure(60);
        doc.moveDown(0.8);
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(title.toUpperCase(), { characterSpacing: 0.6 });
        const y = doc.y + 3;
        doc.moveTo(48, y).lineTo(48 + W, y).lineWidth(1).strokeColor('#D3D9E0').stroke();
        doc.moveDown(0.5);
    };
    const row = (label, value, { bold = false } = {}) => {
        ensure(18);
        const y = doc.y;
        doc.fillColor(GRAY).font('Helvetica').fontSize(9.5).text(label, 48, y, { width: 150 });
        doc.fillColor('#111827').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).text(clean(value), 200, y, { width: W - 152 });
        doc.y = Math.max(doc.y, y + 14);
        doc.x = 48;
    };
    const amount = (label, value, { bold = false, color = '#111827' } = {}) => {
        ensure(18);
        const y = doc.y;
        doc.fillColor(bold ? '#111827' : GRAY).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).text(clean(label), 48, y, { width: W - 120 });
        doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9.5).text(clean(value), 48 + W - 120, y, { width: 120, align: 'right' });
        doc.y = Math.max(doc.y, y + (bold ? 17 : 14));
        doc.x = 48;
    };

    // Antet
    if (LOGO) doc.image(LOGO, 48, 44, { height: 30 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text('Final Receipt & Job Record', 48, 44, { width: W, align: 'right' });
    doc.fillColor(GRAY).font('Helvetica').fontSize(9).text(`Order ${o.id} · issued ${fmtDateTime(new Date().toISOString())}`, 48, 64, { width: W, align: 'right' });
    doc.y = 92;
    doc.fillColor(GRAY).fontSize(8.5).text(`${COMPANY.name} · ${COMPANY.address} · ${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}`, 48, doc.y, { width: W });
    doc.text(COMPANY.licenses, { width: W });
    doc.moveTo(48, doc.y + 6).lineTo(48 + W, doc.y + 6).lineWidth(2).strokeColor(RED).stroke();
    doc.y += 10;

    section('Customer');
    row('Name', o.customer?.fullName);
    row('Email', o.customer?.email);
    row('Phone', o.customer?.phone);

    section('Service');
    row('Order', o.id);
    row('Service', `${o.vehicle?.name}${o.vehicle?.crewLabel ? ` — ${o.vehicle.crewLabel}` : ''}`);
    row('Arrival window', o.scheduleText);
    row('Pickup', o.pickup?.address);
    if (o.pickup?.details) row('Pickup details', [describeLocation(o.pickup.details), o.pickup.details.notes].filter(Boolean).join(' · '));
    row('Drop-off', o.dropoff?.address);
    if (o.dropoff?.details) row('Drop-off details', [describeLocation(o.dropoff.details), o.dropoff.details.notes].filter(Boolean).join(' · '));
    row('Distance', o.routeInfo ? `${o.routeInfo.distanceMiles} mi` : null);
    row('Items', o.itemsDescription);
    row('Driver', o.driver?.fullName);

    section('Payment 1 — booking');
    for (const l of o.price?.lines || []) amount(`${l.label}${l.detail ? ` (${l.detail})` : ''}`, `${l.amount < 0 ? '-' : ''}${money(Math.abs(l.amount))}`);
    amount('Booking total', money(d.booking), { bold: true });
    row('Paid with', bookingMethod(o));
    row('Paid at', fmtDateTime(d.bookingPaidAt));

    section('Payment 2 — labor (time worked)');
    const l = o.laborActual;
    row('Crew arrived (start)', fmtDateTime(o.timeline?.arrivedAt));
    row('Job completed (end)', fmtDateTime(o.timeline?.completedAt));
    if (o.timeline?.pausedSecs > 0) row('Crew breaks (not billed)', `${Math.round(o.timeline.pausedSecs / 60)} min`);
    row('Elapsed time', l ? `${l.elapsedMinutes} min${l.adjusted ? ` (corrected by dispatch; measured ${l.timedMinutes ?? '—'} min)` : ''}` : null);
    row('Billable time', l ? `${l.minutes} min (rounded up to the next 5 minutes)` : null);
    row('Rate', o.price?.labor?.label);
    amount('Labor total', o.laborBilling.status === 'waived' ? '$0.00 (no charge)' : money(d.labor), { bold: true });
    row('Status', `${LABOR_STATUS[o.laborBilling.status] || o.laborBilling.status}${o.laborBilling.paidAt ? ` · ${fmtDateTime(o.laborBilling.paidAt)}` : ''}`);

    ensure(40);
    doc.moveDown(0.6);
    const y = doc.y;
    doc.rect(48, y, W, 30).fill('#F3F5F8');
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(d.laborSettled ? 'TOTAL PAID' : 'TOTAL PAID SO FAR (labor not settled)', 60, y + 9, { width: W - 160 });
    doc.fillColor(NAVY).fontSize(13).text(money(d.total), 48 + W - 160, y + 8, { width: 148, align: 'right' });
    doc.y = y + 42;
    doc.x = 48;

    section('Terms & conditions');
    doc.fillColor('#111827').font('Helvetica').fontSize(8.5);
    for (const t of TERMS) {
        ensure(30);
        doc.text(`•  ${t}`, 48, doc.y, { width: W, lineGap: 1 });
        doc.moveDown(0.25);
    }
    doc.fillColor(GRAY).fontSize(8.5).text(
        `Full Terms of Service: https://${'app.' + COMPANY.web}/terms · Terms version ${d.termsVersion || '—'}${
            d.termsAcceptedAt ? ` · accepted online at booking on ${fmtDateTime(d.termsAcceptedAt)}` : ''
        }`,
        48,
        doc.y + 2,
        { width: W }
    );

    section('Customer signatures');
    const sigBlock = (title, s, img, note) => {
        ensure(130);
        const top = doc.y;
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5).text(title, 48, top, { width: W });
        const boxY = doc.y + 4;
        doc.rect(48, boxY, 220, 80).lineWidth(0.8).strokeColor('#D3D9E0').stroke();
        if (img) {
            try {
                doc.image(img, 52, boxY + 4, { fit: [212, 72], align: 'center', valign: 'center' });
            } catch {
                /* imagine invalidă */
            }
        } else {
            doc.fillColor(GRAY).font('Helvetica').fontSize(9).text('Not signed', 52, boxY + 34, { width: 212, align: 'center' });
        }
        doc.fillColor('#111827').font('Helvetica').fontSize(9);
        const tx = 284;
        if (s) {
            doc.text(`Signed by: ${s.signerName}`, tx, boxY + 4, { width: W - 236 });
            doc.text(`Date & time: ${fmtDateTime(s.signedAt)}`, tx, doc.y + 2, { width: W - 236 });
            if (s.driverName) doc.text(`Crew lead: ${s.driverName}`, tx, doc.y + 2, { width: W - 236 });
            doc.fillColor(GRAY).fontSize(7.5).text(`Device: ${String(s.device || '—').slice(0, 110)} · IP ${s.ip || '—'}`, tx, doc.y + 2, { width: W - 236 });
        }
        if (note) doc.fillColor(GRAY).fontSize(8).text(note, tx, doc.y + 4, { width: W - 236 });
        doc.y = boxY + 92;
        doc.x = 48;
    };
    const st = d.signatures.start;
    sigBlock('1. Terms & conditions', st, d.images.start, st ? 'Customer checked “I have read and agree to the RELOQ Terms of Service” and signed before the labor timer started.' : null);
    sigBlock('2. Start of job (labor timer started)', st, d.images.start, st ? `Labor started: ${fmtDateTime(o.timeline?.arrivedAt)}` : null);
    sigBlock('3. End of job (labor timer stopped)', d.signatures.end, d.images.end, d.signatures.end ? `Labor stopped: ${fmtDateTime(o.timeline?.completedAt)}` : null);

    doc.fillColor(GRAY).font('Helvetica').fontSize(7.5).text(
        `Electronic signatures captured in the RELOQ app on the crew's device. Generated by RELOQ on ${fmtDateTime(new Date().toISOString())}.`,
        48,
        doc.y + 4,
        { width: W, align: 'center' }
    );
    doc.end();
    return done;
}

/**
 * Manopera e închisă (plătită online / cash / fără taxă): clientul primește chitanța finală,
 * iar firma PDF-ul oficial. O singură dată pe comandă (receipt_sent_at).
 */
export async function sendFinalReceipts(code) {
    const [[r]] = await pool.query('SELECT id FROM orders WHERE code = ?', [code]);
    if (!r) return;
    const [claim] = await pool.query('UPDATE orders SET receipt_sent_at = UTC_TIMESTAMP() WHERE id = ? AND receipt_sent_at IS NULL', [r.id]);
    if (claim.affectedRows !== 1) return;
    try {
        const d = await receiptData(code);
        const pdf = await buildReceiptPdf(d);
        await waitForMail(
            Promise.all([
                notifyFinalReceipt(d.order, { booking: d.booking, labor: d.labor, total: d.total, waived: d.order.laborBilling.status === 'waived' }),
                mailSettings.notifyTo ? notifyCompanyReceipt(d.order, pdf, mailSettings.notifyTo, d.total) : false
            ])
        );
    } catch (err) {
        console.warn(`[reloq] Chitanța finală pentru ${code} a eșuat: ${err.message}`);
        await pool.query('UPDATE orders SET receipt_sent_at = NULL WHERE id = ?', [r.id]);
    }
}
