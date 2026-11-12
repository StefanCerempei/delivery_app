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

/**
 * Trimite un email fără să blocheze cererea care l-a declanșat.
 * O eroare de email nu trebuie să strice o comandă deja salvată.
 */
export function sendMailInBackground({ to, subject, html, text, replyTo }) {
    if (!transporter || !to) return;
    transporter
        .sendMail({
            from: mailSettings.from,
            to,
            subject,
            html,
            text,
            replyTo: replyTo || mailSettings.replyTo || undefined
        })
        .then((info) => console.log(`[reloq] Email trimis: „${subject}” → ${to} (${info.messageId})`))
        .catch((err) => console.error(`[reloq] Email eșuat: „${subject}” → ${to}: ${err.code || ''} ${err.message}`));
}
