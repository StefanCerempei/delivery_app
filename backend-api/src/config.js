// Configurația aplicației, citită din variabilele de mediu.
// Pe Hostinger le setezi în hPanel → aplicația Node.js → Environment variables.
// Local le pui în backend-api/.env (vezi .env.example).

// Implicit producție. Doar local, cu NODE_ENV=development în .env, se relaxează regulile.
const isProduction = process.env.NODE_ENV !== 'development';

function required(name, fallbackForDev) {
    const value = process.env[name];
    if (value && value.trim() !== '') return value.trim();
    if (!isProduction && fallbackForDev !== undefined) return fallbackForDev;
    throw new Error(`Lipsește variabila de mediu obligatorie: ${name}`);
}

export const config = {
    isProduction,
    port: Number(process.env.PORT) || 3000,

    db: {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: required('DB_USER'),
        password: process.env.DB_PASSWORD ?? '',
        database: required('DB_NAME')
    },

    // Cheie lungă și aleatorie (minim 32 de caractere) pentru semnarea sesiunilor.
    jwtSecret: required('JWT_SECRET', 'dev-only-secret-change-me-dev-only-secret'),
    sessionDays: Number(process.env.SESSION_DAYS) || 7,

    // Contul de dispecer creat automat la prima pornire (dacă nu există niciun admin).
    adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() || null,
    adminPassword: process.env.ADMIN_PASSWORD || null,

    // Opțional: dacă lipsesc, comenzile se salvează ca „pending_payment” fără plată online.
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || null,
    currency: (process.env.CURRENCY || 'usd').toLowerCase(),

    // Doar dacă frontend-ul stă pe alt domeniu decât API-ul (altfel lasă gol).
    corsOrigin: process.env.CORS_ORIGIN || null
};

if (config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET trebuie să aibă cel puțin 32 de caractere.');
}
