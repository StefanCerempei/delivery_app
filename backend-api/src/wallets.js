// Apple Pay / Google Pay pe site: domeniul trebuie înregistrat în Stripe („Payment method domains”),
// iar pentru Apple Pay Stripe verifică fișierul /.well-known/apple-developer-merchantid-domain-association.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripe } from './stripe.js';
import { mailSettings } from './mailer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Dacă vreți fișierul pus manual (descărcat din Stripe), puneți-l aici: backend-api/apple-developer-merchantid-domain-association
const LOCAL_FILE = path.join(here, '..', 'apple-developer-merchantid-domain-association');
const STRIPE_FILE_URL = 'https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association';
let cached = null;

/** Conținutul fișierului de verificare Apple Pay (local, altfel descărcat o dată de la Stripe). */
export async function applePayAssociation() {
    if (cached) return cached;
    if (fs.existsSync(LOCAL_FILE)) return (cached = fs.readFileSync(LOCAL_FILE));
    const res = await fetch(STRIPE_FILE_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Stripe a răspuns ${res.status}`);
    cached = Buffer.from(await res.arrayBuffer());
    return cached;
}

/**
 * La pornire: înregistrează domeniul site-ului (APP_URL) în Stripe pentru Apple Pay / Google Pay,
 * dacă nu e deja. Cheia restricționată are nevoie de „Payment Method Domains: Write”;
 * fără ea, doar scriem în log ce trebuie făcut în Dashboard.
 */
export async function ensureWalletDomain() {
    if (!stripe || !mailSettings.appUrl) return;
    let domain;
    try {
        domain = new URL(mailSettings.appUrl).hostname;
    } catch {
        return;
    }
    if (/^(localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(domain)) return;
    try {
        const list = await stripe.paymentMethodDomains.list({ domain_name: domain, limit: 1 });
        let pmd = list.data[0];
        if (!pmd) pmd = await stripe.paymentMethodDomains.create({ domain_name: domain, enabled: true });
        else if (pmd.apple_pay?.status !== 'active') pmd = await stripe.paymentMethodDomains.validate(pmd.id).catch(() => pmd);
        console.log(
            `[reloq] Stripe wallets pentru ${domain}: Apple Pay ${pmd.apple_pay?.status || '?'}, Google Pay ${pmd.google_pay?.status || '?'}`
        );
        if (pmd.apple_pay?.status_details?.error_message) console.warn(`[reloq] Apple Pay: ${pmd.apple_pay.status_details.error_message}`);
    } catch (err) {
        console.warn(
            `[reloq] Domeniul ${domain} nu a putut fi înregistrat automat în Stripe (${err.message}). ` +
                'Adaugă-l în Stripe → Settings → Payment methods → Payment method domains, sau dă cheii permisiunea „Payment Method Domains: Write”.'
        );
    }
}
