// Șabloanele emailurilor. Tot textul introdus de clienți e escapat (fără HTML injectat în emailuri).
import { mailSettings, sendMailInBackground, sendMailNow } from './mailer.js';

const BRAND = {
    name: 'RELOQ Moving Services',
    logoUrl: mailSettings.appUrl ? `${mailSettings.appUrl}/email-logo.png` : null,
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

// La rezervare se plătesc Reservation fee + Service fee + Transportation; manopera se facturează după job.
function laborNote(order) {
    const rate = order.price?.labor ? ` at ${order.price.labor.label}` : '';
    return `Labor is not included in the amount paid at booking. It is billed after the job${rate}, based on the actual time from the crew's arrival at pickup to completion at the destination.`;
}

const money2 = (n) => `$${Number(n || 0).toFixed(2)}`;
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
      ${BRAND.logoUrl
          ? `<img src="${BRAND.logoUrl}" alt="RELOQ Moving Services" width="150" height="45" style="display:block;border:0;outline:none;text-decoration:none">`
          : `<span style="font-size:22px;font-weight:900;letter-spacing:1px;color:${BRAND.red}">RELO</span><span style="font-size:22px;font-weight:900;letter-spacing:1px;color:#ffffff">Q</span><span style="display:block;font-size:10px;letter-spacing:3px;color:#C3CBD6;margin-top:6px">MOVING SERVICES</span>`}
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
        ...(order.price?.lines || []).map((l) => [l.label, `${money2(l.amount)}${l.detail ? ` — ${l.detail}` : ''}`]),
        order.paidOnline
            ? ['Paid at booking', `${money2(order.totalAmount)} (card${order.cardLast4 ? ` •••• ${order.cardLast4}` : ''})`]
            : ['Due', `${money2(order.totalAmount)} (pay after the job)`],
        ['Labor (after the job)', order.price?.labor ? order.price.labor.label : 'Billed after the job, based on time']
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

/** Primul email către client: cererea a fost primită, urmează confirmarea dispecerului. */
export function notifyOrderReceived(order) {
    if (!order.customer?.email) return Promise.resolve(false);
    const rows = orderRows(order);
    const firstName = order.customer.fullName?.split(' ')[0] || 'there';
    return sendMailInBackground({
        to: order.customer.email,
        subject: `Order submitted successfully — we'll confirm shortly (#${order.id})`,
        html: layout({
            preheader: `We received your RELOQ request for ${order.scheduleText}.`,
            title: 'Order submitted successfully',
            intro: `Hi ${esc(firstName)}, thanks for choosing RELOQ! We've received your request and our team is reviewing it. In a short time we'll confirm your order — you'll get a confirmation email as soon as it's accepted.`,
            body: `${detailsTable(rows)}${button(link('/account'), 'View my bookings')}
<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">${order.paidOnline ? `We've received your payment of ${money(order.totalAmount)}. ` : 'No payment is due yet. '}${esc(laborNote(order))}</p>`
        }),
        text: `Order submitted successfully. We received your RELOQ request and will confirm it shortly.\n\n${orderText(order, rows)}\n\n${laborNote(order)}\n\nQuestions: ${BRAND.phone} / ${BRAND.email}`
    });
}

/** Confirmarea propriu-zisă, trimisă când dispecerul acceptă comanda (status „confirmed”). */
export function notifyOrderConfirmed(order) {
    if (!order.customer?.email) return Promise.resolve(false);
    const rows = orderRows(order);
    const firstName = order.customer.fullName?.split(' ')[0] || 'there';
    return sendMailInBackground({
        to: order.customer.email,
        subject: `Booking confirmed — ${order.scheduleText} (#${order.id})`,
        html: layout({
            preheader: `Your RELOQ crew is booked for ${order.scheduleText}.`,
            title: 'Your order was booked and confirmed',
            intro: `Hi ${esc(firstName)}, good news — your RELOQ booking is confirmed! Here are your details. We'll let you know when your crew is on the way.`,
            body: `${detailsTable(rows)}${button(link('/account'), 'View my bookings')}
<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">${esc(laborNote(order))}</p>
<p style="margin:12px 0 0;font-size:13px;color:${BRAND.gray}">Need to change or cancel? Free cancellation up to 24 hours before your arrival window. Just reply to this email or call us with your order number.</p>`
        }),
        text: `Your RELOQ move is confirmed.\n\n${orderText(order, rows)}\n\n${laborNote(order)}\n\nFree cancellation up to 24 hours before your arrival window. Questions: ${BRAND.phone} / ${BRAND.email}`
    });
}

/** Alertă pentru dispecer când intră o comandă nouă. */
export function notifyDispatcherNewOrder(order) {
    if (!mailSettings.notifyTo) return Promise.resolve(false);
    const rows = orderRows(order, { forDispatcher: true });
    return sendMailInBackground({
        to: mailSettings.notifyTo,
        replyTo: order.customer?.email,
        subject: `New order #${order.id} — ${order.scheduleText} — ${money(order.totalAmount)}`,
        html: layout({
            preheader: `${order.customer?.fullName || 'A customer'} requested ${order.vehicle?.name} for ${order.scheduleText}.`,
            title: 'New order to confirm',
            intro: `A new order just came in through the app${order.paidOnline ? ' and the transport is paid online' : ''}. Open it in dispatch to review and confirm it, or reply to this email to contact the customer directly.`,
            body: `${detailsTable(rows)}${button(link(`/admin/order/${encodeURIComponent(order.id)}`), 'Open in dispatch')}`
        }),
        text: `New order to confirm.\n\n${orderText(order, rows)}`
    });
}

/** La crearea comenzii: emailul „primit” către client + alerta către dispecer. */
export function notifyNewOrder(order) {
    return Promise.all([notifyOrderReceived(order), notifyDispatcherNewOrder(order)]);
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
    if (!tpl || !order.customer?.email) return Promise.resolve(false);
    const rows = orderRows(order).filter(([k]) => ['Order', 'Arrival window', 'Pickup', 'Drop-off'].includes(k));
    const name = order.customer.fullName?.split(' ')[0] || 'there';
    return sendMailInBackground({
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

/** Linkul de resetare a parolei. */
export function sendPasswordResetEmail({ to, fullName, url, minutes }) {
    const firstName = String(fullName || '').trim().split(/\s+/)[0] || 'there';
    const html = layout({
        preheader: 'Reset your RELOQ password',
        title: 'Reset your password',
        intro: `Hi ${esc(firstName)}, we received a request to reset the password for your RELOQ account.`,
        body: `${button(url, 'Choose a new password')}
<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">This link expires in ${minutes} minutes and can be used once. If you didn’t ask for a reset, ignore this email — your password stays the same.</p>
<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${BRAND.gray};word-break:break-all">Button not working? Paste this link into your browser:<br>${esc(url)}</p>`
    });
    const text = `Reset your RELOQ password:\n${url}\n\nThis link expires in ${minutes} minutes. If you didn't ask for a reset, ignore this email.`;
    return sendMailNow({ to, subject: 'Reset your RELOQ password', html, text });
}

/** Confirmare după schimbarea parolei (alertă de securitate). */
export function notifyPasswordChanged({ to, fullName }) {
    const firstName = String(fullName || '').trim().split(/\s+/)[0] || 'there';
    const html = layout({
        preheader: 'Your RELOQ password was changed',
        title: 'Your password was changed',
        intro: `Hi ${esc(firstName)}, the password for your RELOQ account was just changed and other devices were signed out.`,
        body: `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#374151">If this wasn’t you, reset your password right away or call us at ${BRAND.phone}.</p>`
    });
    return sendMailInBackground({
        to,
        subject: 'Your RELOQ password was changed',
        html,
        text: `The password for your RELOQ account was just changed. If this wasn't you, reset it right away or call ${BRAND.phone}.`
    });
}

/** Confirmare după ștergerea contului (trimisă înainte ca adresa să fie anonimizată). */
export function notifyAccountDeleted({ to, fullName }) {
    const firstName = String(fullName || '').trim().split(/\s+/)[0] || 'there';
    const html = layout({
        preheader: 'Your RELOQ account was deleted',
        title: 'Your account was deleted',
        intro: `Hi ${esc(firstName)}, your RELOQ account and personal details have been deleted. Sorry to see you go.`,
        body: `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:#374151">Records of past moves are kept only as long as the law requires, without your name or contact details. If this wasn’t you, call us at ${BRAND.phone}.</p>`
    });
    return sendMailInBackground({
        to,
        subject: 'Your RELOQ account was deleted',
        html,
        text: `Your RELOQ account and personal details have been deleted. If this wasn't you, call ${BRAND.phone}.`
    });
}
