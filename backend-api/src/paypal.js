// PayPal direct (contul PayPal Business al RELOQ), lângă Stripe.
// PayPal prin Stripe nu e disponibil firmelor din SUA, deci folosim API-ul PayPal Orders v2:
//   1. browserul cere crearea unei comenzi PayPal pentru comanda RELOQ (suma o pune serverul);
//   2. clientul aprobă în fereastra PayPal;
//   3. serverul face „capture” și verifică suma + comanda — abia atunci banii sunt luați.
// Fără capture nu se încasează nimic, deci nu e nevoie de webhook pentru cazul „tab închis”.
//
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV=sandbox|live (implicit sandbox).
import { config } from './config.js';

const BASE = config.paypal.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

export const paypalEnabled = Boolean(config.paypal.clientId && config.paypal.clientSecret);

let cachedToken = null; // { value, expiresAt }

async function accessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
    const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
    const res = await fetch(`${BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(15000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
        throw new Error(`PayPal auth failed (${res.status}${data.error ? `: ${data.error}` : ''})`);
    }
    cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 300) * 1000 };
    return cachedToken.value;
}

async function paypalRequest(path, { body, requestId } = {}) {
    const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${await accessToken()}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
            ...(requestId ? { 'PayPal-Request-Id': requestId } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000)
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

const usd = (cents) => (cents / 100).toFixed(2);

/** Creează comanda PayPal pentru o comandă RELOQ. Întoarce id-ul PayPal. */
export async function createPaypalOrder(row) {
    const { ok, status, data } = await paypalRequest('/v2/checkout/orders', {
        requestId: `create-${row.id}-${row.total_cents}`,
        body: {
            intent: 'CAPTURE',
            purchase_units: [
                {
                    reference_id: row.code,
                    custom_id: row.id, // verificat la capture
                    description: `RELOQ booking ${row.code}`.slice(0, 127),
                    amount: { currency_code: row.currency.toUpperCase(), value: usd(row.total_cents) }
                }
            ],
            payment_source: {
                paypal: {
                    experience_context: {
                        brand_name: 'RELOQ Moving Services',
                        shipping_preference: 'NO_SHIPPING',
                        user_action: 'PAY_NOW'
                    }
                }
            }
        }
    });
    if (!ok || !data.id) throw new Error(`PayPal create order failed (${status}${data.name ? `: ${data.name}` : ''})`);
    return data.id;
}

/**
 * Încasează comanda PayPal aprobată de client și verifică că plata e pentru comanda și suma corectă.
 * @returns {{ paid: boolean, captureId?: string, reason?: string }}
 */
export async function capturePaypalOrder(paypalOrderId, row) {
    const { ok, status, data } = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
        requestId: `capture-${paypalOrderId}`
    });

    // Comanda fusese deja încasată (ex. dublu-click): o citim ca să verificăm captura existentă.
    let order = data;
    if (!ok && data?.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
        const res = await fetch(`${BASE}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, {
            headers: { Authorization: `Bearer ${await accessToken()}` },
            signal: AbortSignal.timeout(15000)
        });
        order = await res.json().catch(() => ({}));
    } else if (!ok) {
        const issue = data?.details?.[0]?.issue || data?.name || status;
        return { paid: false, reason: String(issue) };
    }

    const unit = order?.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    const expected = usd(row.total_cents);
    const paid =
        order?.status === 'COMPLETED' &&
        capture?.status === 'COMPLETED' &&
        (capture.custom_id ?? unit?.custom_id) === row.id &&
        capture.amount?.value === expected &&
        capture.amount?.currency_code === row.currency.toUpperCase();

    if (!paid) {
        console.warn(
            `[reloq] PayPal capture ${paypalOrderId} nu se potrivește cu ${row.code}: status=${order?.status}/${capture?.status}, sumă=${capture?.amount?.value} (așteptat ${expected})`
        );
        const completed = order?.status === 'COMPLETED' && capture?.status === 'COMPLETED';
        return { paid: false, reason: completed ? 'MISMATCH' : capture?.status || order?.status || 'UNKNOWN' };
    }
    return { paid: true, captureId: capture.id };
}
