// Șabloanele emailurilor. Tot textul introdus de clienți e escapat (fără HTML injectat în emailuri).
import { mailSettings, sendMailInBackground, sendMailNow } from './mailer.js';

const BRAND = {
    name: 'RELOQ Moving Services',
    red: '#E4362C',
    navy: '#0B1F3B',
    gray: '#5F6A78',
    phone: '(508) 816-7230',
    email: 'info@reloqmove.com',
    address: '98 Mountain Gate Rd., Ashland, MA 01721',
    licenses: 'U.S. DOT No. 4182047 • MC No. 1623651 • MA DPU No. 24HG10'
};

const esc = (v) =>
    String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const money = (n) => `$${Number(n || 0).toFixed(Number(n) % 1 === 0 ? 0 : 2)}`;
const link = (path) => (mailSettings.appUrl ? `${mailSettings.appUrl}${path}` : null);

/** Un tabel simplu de detalii (eticheta → valoarea), compatibil cu clienții de email. */
function detailsTable(rows) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0 4px">
${rows
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(
        ([k, v]) => `<tr>
  <td style="padding:9px 0;border-bottom:1px solid #E6E9EE;color:${BRAND.gray};font-size:13px;width:38%;vertical-align:top">${esc(k)}</td>
  <td style="padding:9px 0;border-bottom:1px solid #E6E9EE;color:#111827;font-size:14px;font-weight:600;vertical-align:top">${esc(v)}</td>
</tr>`
    )
    .join('\n')}
</table>`;
}

function button(href, label) {
    if (!href) return '';
    return `<p style="margin:24px 0 8px"><a href="${esc(href)}" style="display:inline-block;background:${BRAND.red};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:10px">${esc(label)}</a></p>`;
}

/** Cadrul comun: antet cu numele firmei, conținut, footer cu datele legale. */
function layout({ preheader, title, intro, body }) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F3F5F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F8;padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E6E9EE">
    <tr><td style="background:${BRAND.navy};padding:20px 28px">
      <span style="font-size:22px;font-weight:900;letter-spacing:1px;color:${BRAND.red}">RELO</span><span style="font-size:22px;font-weight:900;letter-spacing:1px;color:#ffffff">Q</span>
      <span style="display:block;font-size:10px;letter-spacing:3px;color:#C3CBD6;margin-top:2px">MOVING SERVICES</span>
    </td></tr>
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 10px;font-size:22px;line-height:1.25;color:#111827">${esc(title)}</h1>
      <p style="margin:0;font-size:15px;line-height:1.55;color:#374151">${intro}</p>
      ${body}
    </td></tr>
    <tr><td style="padding:18px 28px;background:#F8FAFC;border-top:1px solid #E6E9EE;font-size:12px;line-height:1.6;color:${BRAND.gray}">
      Questions? Call <a href="tel:5088167230" style="color:${BRAND.gray}">${BRAND.phone}</a> or email <a href="mailto:${BRAND.email}" style="color:${BRAND.gray}">${BRAND.email}</a>.<br>
      ${BRAND.name} LLC • ${BRAND.address}<br>${BRAND.licenses}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function orderRows(order, { forDispatcher = false } = {}) {
    const rows = [
        ['Order', `#${order.id}`],
        ['Arrival window', order.scheduleText],
        ['Vehicle', `${order.vehicle?.name}${order.vehicle?.crewLabel ? ` (${order.vehicle.crewLabel})` : ''}`],
        ['Pickup', order.pickup?.address],
        ['Drop-off', order.dropoff?.address],
        ['Distance', order.routeInfo ? `${order.routeInfo.distanceMiles} mi • ~${order.routeInfo.durationMins} min` : null],
        ['Items', order.itemsDescription],
        ['Total', `${money(order.totalAmount)}${order.status === 'paid' ? ' (paid)' : ' (pay after the job)'}`]
    ];
    if (forDispatcher) {
        rows.splice(1, 0, ['Customer', order.customer?.fullName], ['Phone', order.customer?.phone], ['Email', order.customer?.email]);
        rows.push(['Photos', order.photosCount ? `${order.photosCount} (not uploaded)` : '0']);
    }
    return rows;
}

const orderText = (order, rows) =>
    rows
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

/** Comandă nouă: confirmare pentru client + alertă pentru dispecer. */
export function notifyNewOrder(order) {
    // 1) Clientul
    if (order.customer?.email) {
        const rows = orderRows(order);
        const firstName = order.customer.fullName?.split(' ')[0] || 'there';
        sendMailInBackground({
            to: order.customer.email,
            subject: `Booking confirmed — ${order.scheduleText} (#${order.id})`,
            html: layout({
                preheader: `Your RELOQ crew is booked for ${order.scheduleText}.`,
                title: 'Your move is booked',
                intro: `Hi ${esc(firstName)}, thanks for choosing RELOQ. Here are your booking details. We'll text you the day before and when your crew is on the way.`,
                body: `${detailsTable(rows)}${button(link('/account'), 'View my bookings')}
<p style="margin:16px 0 0;font-size:13px;color:${BRAND.gray}">Need to change or cancel? Free cancellation up to 24 hours before your arrival window. Just reply to this email or call us with your order number.</p>`
            }),
            text: `Your RELOQ move is booked.\n\n${orderText(order, rows)}\n\nFree cancellation up to 24 hours before your arrival window. Questions: ${BRAND.phone} / ${BRAND.email}`
        });
    }

    // 2) Dispecerul
    if (mailSettings.notifyTo) {
        const rows = orderRows(order, { forDispatcher: true });
        sendMailInBackground({
            to: mailSettings.notifyTo,
            replyTo: order.customer?.email,
            subject: `New booking #${order.id} — ${order.scheduleText} — ${money(order.totalAmount)}`,
            html: layout({
                preheader: `${order.customer?.fullName || 'A customer'} booked ${order.vehicle?.name} for ${order.scheduleText}.`,
                title: 'New booking received',
                intro: `A new booking just came in through the app. Reply to this email to contact the customer directly.`,
                body: `${detailsTable(rows)}${button(link(`/admin/order/${encodeURIComponent(order.id)}`), 'Open in dispatch')}`
            }),
            text: `New booking received.\n\n${orderText(order, rows)}`
        });
    }
}

const STATUS_EMAILS = {
    en_route: {
        subject: (o) => `Your RELOQ crew is on the way (#${o.id})`,
        title: 'Your crew is on the way',
        intro: (name) => `Hi ${esc(name)}, your RELOQ crew has left and is heading to your pickup address. Please make sure someone is there to meet them.`
    },
    cancelled: {
        subject: (o) => `Booking cancelled (#${o.id})`,
        title: 'Your booking was cancelled',
        intro: (name) =>
            `Hi ${esc(name)}, your booking below has been cancelled. If you didn't ask for this or want to rebook, reply to this email or call us.`
    }
};

/** Email către client când dispecerul schimbă statusul (doar pentru statusurile care contează pentru el). */
export function notifyStatusChange(order) {
    const tpl = STATUS_EMAILS[order.status];
    if (!tpl || !order.customer?.email) return;
    const rows = orderRows(order).filter(([k]) => ['Order', 'Arrival window', 'Pickup', 'Drop-off'].includes(k));
    const name = order.customer.fullName?.split(' ')[0] || 'there';
    sendMailInBackground({
        to: order.customer.email,
        subject: tpl.subject(order),
        html: layout({
            preheader: tpl.title,
            title: tpl.title,
            intro: tpl.intro(name),
            body: `${detailsTable(rows)}${button(link('/account'), 'View my bookings')}`
        }),
        text: `${tpl.title}.\n\n${orderText(order, rows)}\n\nQuestions: ${BRAND.phone} / ${BRAND.email}`
    });
}

/** Codul unic de verificare a emailului. Întoarce un Promise (eroarea ajunge la client). */
export function sendVerificationCodeEmail({ to, fullName, code, minutes }) {
    const firstName = String(fullName || '').trim().split(/\s+/)[0] || 'there';
    const html = layout({
        preheader: `Your RELOQ verification code is ${code}`,
        title: 'Verify your email',
        intro: `Hi ${esc(firstName)}, enter this code in the RELOQ app to confirm your email and complete your booking.`,
        body: `<p style="margin:24px 0 8px;text-align:center"><span style="display:inline-block;font-family:'SFMono-Regular',Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:${BRAND.navy};background:#F3F5F8;border:1px solid #E6E9EE;border-radius:12px;padding:14px 22px">${esc(code)}</span></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">The code expires in ${minutes} minutes. If you didn’t create a RELOQ account, you can ignore this email.</p>`
    });
    const text = `Your RELOQ verification code is ${code}\n\nIt expires in ${minutes} minutes. If you didn't create a RELOQ account, ignore this email.`;
    return sendMailNow({ to, subject: `${code} is your RELOQ verification code`, html, text });
}
