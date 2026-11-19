// Configurația aplicației, citită din variabilele de mediu.
// Pe Hostinger le setezi în hPanel → aplicația Node.js → Environment variables.
// Local le pui în backend-api/.env (vezi .env.example).
//
// Dacă lipsește ceva, serverul NU se oprește: pornește în „mod de diagnostic”,
// iar /api/health arată ce variabile lipsesc (doar numele, niciodată valorile).

// Implicit producție. Doar local, cu NODE_ENV=development în .env, se relaxează regulile.
const isProduction = process.env.NODE_ENV !== 'development';

export const configProblems = [];

function read(name, { fallbackForDev } = {}) {
    const value = process.env[name];
    if (value && value.trim() !== '') return value.trim();
    if (!isProduction && fallbackForDev !== undefined) return fallbackForDev;
    configProblems.push(`${name} is missing`);
    return null;
}

const jwtSecret = read('JWT_SECRET', { fallbackForDev: 'dev-only-secret-change-me-dev-only-secret' });
if (jwtSecret && jwtSecret.length < 32) {
    configProblems.push('JWT_SECRET must be at least 32 characters');
}

export const config = {
    isProduction,
    port: Number(process.env.PORT) || 3000,

    db: {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: read('DB_USER'),
        password: process.env.DB_PASSWORD ?? '',
        database: read('DB_NAME')
    },

    // Cheie lungă și aleatorie (minim 32 de caractere) pentru semnarea sesiunilor.
    jwtSecret: jwtSecret && jwtSecret.length >= 32 ? jwtSecret : null,
    sessionDays: Number(process.env.SESSION_DAYS) || 7,

    // Contul de dispecer creat automat la prima pornire (dacă nu există niciun admin).
    adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() || null,
    adminPassword: process.env.ADMIN_PASSWORD || null,

    // Opțional: dacă lipsesc, comenzile se salvează ca „pending_payment” fără plată online.
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || null,
    // Signing secret-ul endpoint-ului de webhook (whsec_…), din Stripe → Developers → Webhooks.
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
    currency: (process.env.CURRENCY || 'usd').toLowerCase(),

    // Opțional: buton PayPal direct (cont PayPal Business → Apps & Credentials → REST app).
    paypal: {
        clientId: process.env.PAYPAL_CLIENT_ID?.trim() || null,
        clientSecret: process.env.PAYPAL_CLIENT_SECRET?.trim() || null,
        env: (process.env.PAYPAL_ENV || 'sandbox').trim().toLowerCase() === 'live' ? 'live' : 'sandbox'
    },

    // Opțional: cheia pentru Cron Job-ul din hPanel care trimite seara reamintirile șoferilor
    // (minim 16 caractere). Fără ea, URL-ul de cron e dezactivat.
    cronSecret: process.env.CRON_SECRET?.trim() || null,

    // Doar dacă frontend-ul stă pe alt domeniu decât API-ul (altfel lasă gol).
    corsOrigin: process.env.CORS_ORIGIN || null
};

if (isProduction && !process.env.DB_PASSWORD) {
    configProblems.push('DB_PASSWORD is missing');
}

export const configOk = configProblems.length === 0;
