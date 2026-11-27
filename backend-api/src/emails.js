// Șabloanele emailurilor. Tot textul introdus de clienți e escapat (fără HTML injectat în emailuri).
import { mailSettings, sendMailInBackground, sendMailNow } from './mailer.js';
import { describeLocation } from './orders.js';

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

/** „PayPal” / „card •••• 4242” / „card”. */
const paidWith = (o) =>
    o.paymentMethod === 'paypal' ? 'PayPal' : o.paymentMethod === 'offline' ? 'paid to RELOQ' : `card${o.cardLast4 ? ` •••• ${o.cardLast4}` : ''}`;
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

/** Rândurile cu detaliile unei locații (etaj, lift, acces), doar dacă au fost completate. */
function stopRows(order) {
    const rows = [];
    for (const [key, label] of [['pickup', 'Pickup'], ['dropoff', 'Drop-off']]) {
        const d = order[key]?.details;
        if (!d) continue;
        rows.push([`${label} details`, describeLocation(d)]);
        if (d.notes) rows.push([`${label} access notes`, d.notes]);
    }
    return rows;
}

function orderRows(order, { forDispatcher = false } = {}) {
    const rows = [
        ['Order', `#${order.id}`],
        ['Arrival window', order.scheduleText],
        ['Vehicle', `${order.vehicle?.name}${order.vehicle?.crewLabel ? ` (${order.vehicle.crewLabel})` : ''}`],
        ['Pickup', order.pickup?.address],
        ['Drop-off', order.dropoff?.address],
        ...stopRows(order),
        ['Distance', order.routeInfo ? `${order.routeInfo.distanceMiles} mi • ~${order.routeInfo.durationMins} min` : null],
        ['Items', order.itemsDescription],
        // Defalcarea (reservation / service / transportation) doar pentru dispecer; clientul vede totalul
        ...(forDispatcher ? (order.price?.lines || []).map((l) => [l.label, `${money2(l.amount)}${l.detail ? ` — ${l.detail}` : ''}`]) : []),
        ...(order.discount ? [['Discount', `${order.discount.code} (${order.discount.percent}%) −${money2(order.discount.amount)}`]] : []),
        order.paidOnline
            ? ['Paid at booking', `${money2(order.totalAmount)} (${paidWith(order)})`]
            : ['Due', `${money2(order.totalAmount)} (${order.createdBy ? 'booking price — RELOQ will collect it before your move' : 'pay after the job'})`],
        ['Labor (after the job)', order.price?.labor ? order.price.labor.label : 'Billed after the job, based on time']
    ];
    if (forDispatcher) {
        rows.splice(1, 0, ['Customer', order.customer?.fullName], ['Phone', order.customer?.phone], ['Email', order.customer?.email]);
        rows.push(['Photos', order.photosCount ? `${order.photosCount} — open the order in dispatch to see them` : 'None']);
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

/** Link Google Maps cu traseul pickup → drop-off (se deschide în aplicația Maps pe telefon). */
function directionsUrl(order) {
    const q = (p) => encodeURIComponent(p?.address || `${p?.lat},${p?.lng}`);
    return `https://www.google.com/maps/dir/?api=1&origin=${q(order.pickup)}&destination=${q(order.dropoff)}&travelmode=driving`;
}

/** Detaliile de care are nevoie șoferul (fără prețuri / plăți, cu contactul clientului). */
function driverRows(order) {
    return [
        ['Order', `#${order.id}`],
        ['Arrival window', order.scheduleText],
        ['Vehicle', `${order.vehicle?.name}${order.vehicle?.crewLabel ? ` (${order.vehicle.crewLabel})` : ''}`],
        ['Customer', order.customer?.fullName],
        ['Customer phone', order.customer?.phone],
        ['Pickup', order.pickup?.address],
        ['Drop-off', order.dropoff?.address],
        ...stopRows(order),
        ['Distance', order.routeInfo ? `${order.routeInfo.distanceMiles} mi • ~${order.routeInfo.durationMins} min` : null],
        ['Items', order.itemsDescription],
        ['Labor rate', order.price?.labor ? `${order.price.labor.label} — from arrival at pickup to completion` : null],
        ['Photos', order.photosCount ? `${order.photosCount} — on the job page` : null],
        ['Dispatch notes', order.dispatchNotes || null]
    ];
}

/** Email către șofer: i-a fost alocată o comandă. */
export function notifyDriverAssigned(order, { updated = false } = {}) {
    const driver = order.driver;
    if (!driver?.email) return Promise.resolve(false);
    const rows = driverRows(order);
    const firstName = driver.fullName?.split(' ')[0] || 'there';
    return sendMailInBackground({
        to: driver.email,
        subject: `${updated ? 'Updated job' : 'New job'}: ${order.scheduleText} — ${order.pickup?.address?.split(',')[0] || ''} (#${order.id})`,
        html: layout({
            preheader: updated ? `Job details changed — ${order.scheduleText}.` : `You're scheduled for ${order.scheduleText}.`,
            title: updated ? 'Your job was updated' : 'You have a new job',
            intro: updated
                ? `Hi ${esc(firstName)}, dispatch changed the job below. Please check the time, addresses and details before you go.`
                : `Hi ${esc(firstName)}, dispatch assigned you to the job below for <strong>${esc(order.scheduleText)}</strong>. Please call the customer about 45 minutes before you arrive.`,
            body: `${detailsTable(rows)}${button(order.jobUrl, 'Open job page')}${button(directionsUrl(order), 'Open route in Google Maps')}
${order.jobUrl ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">On the job page, tap <strong>On my way</strong> when you leave and <strong>Arrived</strong> at the pickup to start the labor timer. Pause it for breaks and <strong>Stop</strong> when everything is delivered.</p>` : ''}
${link('/driver') ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">All your jobs: <a href="${esc(link('/driver'))}" style="color:${BRAND.gray}">${esc(link('/driver'))}</a></p>` : ''}
<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">Can't make it? Reply to this email or call dispatch at ${BRAND.phone} as soon as possible.</p>`
        }),
        text: `You have a new RELOQ job for ${order.scheduleText}.\n\n${orderText(order, rows)}\n\n${order.jobUrl ? `Job page (tap On my way / Arrived / Completed): ${order.jobUrl}\n` : ''}Route: ${directionsUrl(order)}\n\nPlease call the customer about 45 minutes before you arrive. Can't make it? Call dispatch at ${BRAND.phone}.`
    });
}

/** Email către șofer: comanda i-a fost luată (realocată altcuiva sau anulată). */
export function notifyDriverRemoved(order, driver, { cancelled = false } = {}) {
    if (!driver?.email) return Promise.resolve(false);
    const rows = driverRows(order).filter(([k]) => ['Order', 'Arrival window', 'Pickup', 'Drop-off'].includes(k));
    const firstName = driver.fullName?.split(' ')[0] || 'there';
    const title = cancelled ? 'Job cancelled' : 'Job removed from your schedule';
    const why = cancelled ? 'this job was cancelled' : 'this job was reassigned';
    return sendMailInBackground({
        to: driver.email,
        subject: `${title}: ${order.scheduleText} (#${order.id})`,
        html: layout({
            preheader: title,
            title,
            intro: `Hi ${esc(firstName)}, ${why}. You no longer need to go to it.`,
            body: `${detailsTable(rows)}
<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">Questions? Call dispatch at ${BRAND.phone}.</p>`
        }),
        text: `${title}: ${why}. You no longer need to go to it.\n\n${orderText(order, rows)}\n\nQuestions: ${BRAND.phone}`
    });
}

/** Reamintirea de seară: joburile șoferului de mâine, în ordinea orelor. */
export function notifyDriverReminder(driver, orders, date) {
    if (!driver?.email || !orders.length) return Promise.resolve(false);
    const firstName = driver.fullName?.split(' ')[0] || 'there';
    const dayLabel = orders[0].scheduleText?.split(' • ')[0] || date;
    const blocks = orders
        .map(
            (o, i) => `<h2 style="margin:24px 0 0;font-size:16px;color:#111827">${i + 1}. ${esc(o.scheduleText?.split(' • ')[1] || o.scheduleText)}</h2>
${detailsTable(driverRows(o).filter(([k]) => k !== 'Arrival window'))}${button(o.jobUrl, 'Open job page')}`
        )
        .join('\n');
    const text = orders
        .map((o, i) => `${i + 1}. ${o.scheduleText}\n${orderText(o, driverRows(o))}${o.jobUrl ? `\nJob page: ${o.jobUrl}` : ''}\nRoute: ${directionsUrl(o)}`)
        .join('\n\n');
    return sendMailInBackground({
        to: driver.email,
        subject: `Tomorrow: ${orders.length} job${orders.length > 1 ? 's' : ''} — ${dayLabel}`,
        html: layout({
            preheader: `Your RELOQ schedule for ${dayLabel}.`,
            title: `Your jobs for ${dayLabel}`,
            intro: `Hi ${esc(firstName)}, here's your schedule for tomorrow (${orders.length} job${orders.length > 1 ? 's' : ''}). Please call each customer about 45 minutes before you arrive.`,
            body: `${blocks}
<p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">Can't make it? Call dispatch at ${BRAND.phone} as soon as possible.</p>`
        }),
        text: `Your RELOQ jobs for ${dayLabel}:\n\n${text}\n\nCan't make it? Call dispatch at ${BRAND.phone}.`
    });
}

/** Linkul de autentificare în panoul șoferului (fără parolă). `invite`: trimis de dispecerat prima dată. */
export function sendDriverLoginLink({ to, fullName, url, minutes, invite = false }) {
    const firstName = String(fullName || '').trim().split(/\s+/)[0] || 'there';
    const title = invite ? 'Your RELOQ driver account' : 'Log in to your RELOQ driver panel';
    const html = layout({
        preheader: invite ? 'Open your jobs on your phone' : 'Your login link',
        title,
        intro: invite
            ? `Hi ${esc(firstName)}, dispatch created your RELOQ driver account. From your phone you can see today's and upcoming jobs, start the labor timer on site and mark jobs complete.`
            : `Hi ${esc(firstName)}, tap the button below to open your RELOQ driver panel.`,
        body: `${button(url, 'Open my driver panel')}
<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">The link works once and expires in ${minutes} minutes. You'll stay logged in on this phone. Need a new link later? Go to ${esc(mailSettings.appUrl || '')}/driver and enter your email.</p>`
    });
    const text = `${title}\n\nOpen your driver panel: ${url}\n\nThe link works once and expires in ${minutes} minutes.`;
    return sendMailNow({ to, subject: invite ? 'Your RELOQ driver account' : 'Your RELOQ driver login link', html, text });
}

/** Ora în fusul firmei, ex. „Nov 27, 9:42 AM”. */
const fmtTime = (iso) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
        new Date(iso)
    );

/** Rândurile cu detaliile manoperei (timp, tarif, sumă). */
function laborRows(order) {
    const l = order.laborActual;
    return [
        ['Order', `#${order.id}`],
        ['Move', order.scheduleText],
        ['Crew arrived', l?.startedAt ? fmtTime(l.startedAt) : null],
        ['Job completed', l?.completedAt ? fmtTime(l.completedAt) : null],
        ['Elapsed time', l ? `${l.elapsedMinutes} min${l.adjusted ? ' (reviewed by dispatch)' : ''}` : null],
        ['Billable time', l ? `${l.minutes} min (rounded up to the next 5 minutes)` : null],
        ['Rate', order.price?.labor?.label || null],
        ['Amount due', money2(order.laborBilling?.amount)]
    ];
}

/** Cererea de plată pentru manoperă, după job. */
export function notifyLaborPaymentRequest(order) {
    if (!order.customer?.email) return Promise.resolve(false);
    const firstName = order.customer.fullName?.split(' ')[0] || 'there';
    const rows = laborRows(order);
    const payUrl = link(`/account?pay=${encodeURIComponent(order.id)}`);
    return sendMailInBackground({
        to: order.customer.email,
        subject: `Labor payment for your move — ${money2(order.laborBilling?.amount)} (#${order.id})`,
        html: layout({
            preheader: `Your RELOQ move is complete. Labor due: ${money2(order.laborBilling?.amount)}.`,
            title: 'Thanks for moving with RELOQ',
            intro: `Hi ${esc(firstName)}, your move is complete. Here is the labor for the time our crew worked, from arrival at pickup to completion (crew breaks not billed), in 5-minute increments.`,
            body: `${detailsTable(rows)}${button(payUrl, `Pay ${money2(order.laborBilling?.amount)}`)}
<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">You can pay by card, Apple Pay or Google Pay from your RELOQ account. Questions about the time? Reply to this email or call ${BRAND.phone}.</p>`
        }),
        text: `Your RELOQ move is complete.\n\n${orderText(order, rows)}\n\nPay here: ${payUrl || 'log in to your RELOQ account'}\n\nQuestions: ${BRAND.phone}`
    });
}

/** Confirmare după plata online a manoperei (Stripe trimite separat chitanța). */
export function notifyLaborPaid(order) {
    if (!order.customer?.email) return Promise.resolve(false);
    const firstName = order.customer.fullName?.split(' ')[0] || 'there';
    const rows = laborRows(order).map(([k, v]) => (k === 'Amount due' ? ['Paid', v] : [k, v]));
    return sendMailInBackground({
        to: order.customer.email,
        subject: `Payment received — thank you (#${order.id})`,
        html: layout({
            preheader: 'We received your labor payment.',
            title: 'Payment received',
            intro: `Hi ${esc(firstName)}, we received your labor payment. Thank you for choosing RELOQ!`,
            body: detailsTable(rows)
        }),
        text: `We received your labor payment. Thank you!\n\n${orderText(order, rows)}`
    });
}

/** Clientul: rezervarea a fost modificată de dispecerat. */
export function notifyOrderUpdated(order, changes = []) {
    if (!order.customer?.email) return Promise.resolve(false);
    const firstName = order.customer.fullName?.split(' ')[0] || 'there';
    const rows = orderRows(order).filter(([k]) =>
        ['Order', 'Arrival window', 'Vehicle', 'Pickup', 'Drop-off', 'Pickup details', 'Drop-off details', 'Items'].includes(k)
    );
    const what = changes.length ? ` (${changes.join(', ')})` : '';
    return sendMailInBackground({
        to: order.customer.email,
        subject: `Your booking was updated — ${order.scheduleText} (#${order.id})`,
        html: layout({
            preheader: `Your RELOQ booking was updated${what}.`,
            title: 'Your booking was updated',
            intro: `Hi ${esc(firstName)}, our team updated your booking${esc(what)}. Here are the current details. If something doesn't look right, reply to this email or call us.`,
            body: `${detailsTable(rows)}${button(link('/account'), 'View my bookings')}`
        }),
        text: `Your RELOQ booking was updated${what}.\n\n${orderText(order, rows)}\n\nQuestions: ${BRAND.phone} / ${BRAND.email}`
    });
}

/** Clientul la telefon: linkul de plată pentru rezervarea creată de dispecer. */
export function notifyPaymentLink(order, url, expiresAt) {
    if (!order.customer?.email || !url) return Promise.resolve(false);
    const firstName = order.customer.fullName?.split(' ')[0] || 'there';
    const rows = orderRows(order).filter(([k]) => ['Order', 'Arrival window', 'Vehicle', 'Pickup', 'Drop-off', 'Pickup details', 'Drop-off details', 'Discount'].includes(k));
    rows.push(['Amount to pay', money2(order.totalAmount)]);
    const until = expiresAt
        ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(expiresAt))
        : null;
    return sendMailInBackground({
        to: order.customer.email,
        subject: `Complete your RELOQ booking — pay ${money2(order.totalAmount)} (#${order.id})`,
        html: layout({
            preheader: `Your RELOQ move on ${order.scheduleText} is reserved. Pay securely to confirm it.`,
            title: 'Your move is reserved — complete the payment',
            intro: `Hi ${esc(firstName)}, thanks for calling RELOQ! We reserved your move. Pay the booking price securely online to confirm it.`,
            body: `${detailsTable(rows)}${button(url, `Pay ${money2(order.totalAmount)}`)}
<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">${until ? `The payment link works until ${esc(until)}. ` : ''}Payments are processed securely by Stripe.</p>
<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">${esc(laborNote(order))}</p>`
        }),
        text: `Your RELOQ move is reserved. Pay ${money2(order.totalAmount)} to confirm it: ${url}\n\n${orderText(order, rows)}\n\n${laborNote(order)}`
    });
}

/** Clientul: chitanța finală după plata manoperei — rezervare + timp de lucru + total. */
export function notifyFinalReceipt(order, { booking, labor, total, waived }) {
    if (!order.customer?.email) return Promise.resolve(false);
    const firstName = order.customer.fullName?.split(' ')[0] || 'there';
    const l = order.laborActual;
    const fmt = (iso) =>
        iso
            ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
            : null;
    const rows = [
        ['Order', `#${order.id}`],
        ['Service', `${order.vehicle?.name}${order.vehicle?.crewLabel ? ` (${order.vehicle.crewLabel})` : ''}`],
        ['Date', order.scheduleText],
        ['Pickup', order.pickup?.address],
        ['Drop-off', order.dropoff?.address],
        ['Paid at booking', money2(booking)],
        ['Crew arrived', fmt(order.timeline?.arrivedAt)],
        ['Job completed', fmt(order.timeline?.completedAt)],
        ['Time billed', l ? `${l.minutes} min (5-minute increments)` : null],
        ['Paid for labor', waived ? '$0.00 (no charge)' : money2(labor)],
        ['Total paid', money2(total)]
    ];
    return sendMailInBackground({
        to: order.customer.email,
        subject: `Your RELOQ receipt — total ${money2(total)} (#${order.id})`,
        html: layout({
            preheader: `Thank you for moving with RELOQ. Total paid: ${money2(total)}.`,
            title: 'Your final receipt',
            intro: `Hi ${esc(firstName)}, thank you for moving with RELOQ! Here is your final receipt with everything you paid for this move.`,
            body: `${detailsTable(rows)}<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${BRAND.gray}">Questions about your receipt? Reply to this email or call ${BRAND.phone} with your order number.</p>`
        }),
        text: `Your RELOQ final receipt\n\n${orderText(order, rows)}\n\nQuestions: ${BRAND.phone} / ${BRAND.email}`
    });
}

/** Firma: PDF-ul oficial al jobului (date client, plăți, ore, termeni, semnături). */
export function notifyCompanyReceipt(order, pdf, to, total) {
    return sendMailInBackground({
        to,
        replyTo: order.customer?.email,
        subject: `Official receipt #${order.id} — ${order.customer?.fullName || 'customer'} — ${money2(total)}`,
        html: layout({
            preheader: `Official receipt and job record for #${order.id}.`,
            title: 'Official receipt (PDF attached)',
            intro: `The job #${esc(order.id)} for ${esc(order.customer?.fullName || 'the customer')} is settled. The official receipt with payments, job times, terms and the customer's signatures is attached as a PDF. It can also be downloaded from the order in dispatch.`,
            body: ''
        }),
        text: `Official receipt for #${order.id} attached (PDF). Total paid: ${money2(total)}.`,
        attachments: [{ filename: `RELOQ-receipt-${order.id}.pdf`, content: pdf, contentType: 'application/pdf' }]
    });
}
