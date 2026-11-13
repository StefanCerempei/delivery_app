// Trimiterea emailurilor (confirmări de comandă, alerte pentru dispecer).
//
// Se activează doar dacă SMTP_HOST, SMTP_USER și SMTP_PASS sunt setate.
// Fără ele, aplicația merge normal, doar că nu trimite emailuri.
//
// Gmail (test):       SMTP_HOST=smtp.gmail.com     SMTP_PORT=465  SMTP_PASS=<App Password, 16 caractere>
// Hostinger (domeniu): SMTP_HOST=smtp.hostinger.com SMTP_PORT=465  SMTP_PASS=<parola căsuței de email>

import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST?.trim();
const user = process.env.SMTP_USER?.trim();
const pass = process.env.SMTP_PASS?.replace(/\s+/g, ''); // Google afișează App Password cu spații
const port = Number(process.env.SMTP_PORT) || 465;

export const mailEnabled = Boolean(host && user && pass);

export const mailSettings = {
    from: process.env.MAIL_FROM?.trim() || (user ? `RELOQ Moving Services <${user}>` : null),
    replyTo: process.env.MAIL_REPLY_TO?.trim() || null,
    // Unde ajung alertele de comandă nouă (dispecerat). Mai multe adrese: separate prin virgulă.
    notifyTo: process.env.ORDER_NOTIFY_EMAIL?.trim() || user || null,
    // Adresa publică a aplicației, pentru linkurile din emailuri
    appUrl: (process.env.APP_URL?.trim() || '').replace(/\/$/, '')
};

const transporter = mailEnabled
    ? nodemailer.createTransport({
          host,
          port,
          secure: port === 465, // 465 = SSL direct; 587 = STARTTLS
          auth: { user, pass },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000
      })
    : null;

/** Verifică la pornire că datele SMTP sunt bune (doar loghează, nu oprește serverul). */
export async function verifyMailer() {
    if (!transporter) {
        console.log('[reloq] Email dezactivat (lipsesc SMTP_HOST / SMTP_USER / SMTP_PASS).');
        return;
    }
    try {
        await transporter.verify();
        console.log(`[reloq] Email activ prin ${host}:${port} ca ${user}.`);
    } catch (err) {
        console.error(`[reloq] Email: conectarea la ${host}:${port} a eșuat — ${err.code || ''} ${err.message}`);
    }
}

const TRANSIENT_CODES = new Set(['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNRESET', 'EDNS']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Trimite un email și întoarce un Promise care NU aruncă niciodată (rezultat: true/false).
 * O eroare de email nu trebuie să strice o comandă deja salvată.
 * Reîncearcă o dată la erori de rețea (timeout, conexiune întreruptă).
 *
 * IMPORTANT: pe Hostinger (LiteSpeed) procesul Node e încetinit/înghețat după ce răspunsul
 * a plecat, așa că emailurile trimise „în fundal” dau ETIMEDOUT. Rutele trebuie să facă
 * `await` (prin waitForMail) ÎNAINTE de res.json().
 */
export async function sendMailSafe({ to, subject, html, text, replyTo }) {
    if (!transporter || !to) return false;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const info = await transporter.sendMail({
                from: mailSettings.from,
                to,
                subject,
                html,
                text,
                replyTo: replyTo || mailSettings.replyTo || undefined
            });
            console.log(`[reloq] Email trimis: „${subject}” → ${to} (${info.messageId})${attempt > 1 ? ' (a 2-a încercare)' : ''}`);
            return true;
        } catch (err) {
            const retry = attempt === 1 && TRANSIENT_CODES.has(err.code);
            console.error(
                `[reloq] Email eșuat${retry ? ' (reîncerc)' : ''}: „${subject}” → ${to}: ${err.code || ''} ${err.message}`
            );
            if (!retry) return false;
            await sleep(1000);
        }
    }
    return false;
}

/** Păstrat pentru compatibilitate: același lucru ca sendMailSafe. */
export const sendMailInBackground = sendMailSafe;

/**
 * Așteaptă trimiterea emailurilor, dar cel mult `ms` milisecunde, ca clientul să nu stea
 * prea mult după răspuns. Nu aruncă niciodată.
 */
export async function waitForMail(promise, ms = 25000) {
    if (!promise) return;
    let timer;
    await Promise.race([
        Promise.resolve(promise).catch(() => {}),
        new Promise((r) => {
            timer = setTimeout(r, ms);
        })
    ]);
    clearTimeout(timer);
}

/** Trimite un email și așteaptă rezultatul (pentru coduri de verificare, unde clientul trebuie să știe dacă a plecat). */
export async function sendMailNow({ to, subject, html, text }) {
    if (!transporter) throw new Error('Email is not configured');
    const info = await transporter.sendMail({ from: mailSettings.from, to, subject, html, text });
    console.log(`[reloq] Email trimis: „${subject}” → ${to} (${info.messageId})`);
}
