// Punctul de pornire al aplicației Reloq.
// Servește API-ul (/api/...) și site-ul React compilat (frontend-client/dist)
// de pe același domeniu, deci nu e nevoie de CORS și cookie-urile de sesiune sunt sigure.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config, configOk, configProblems } from './src/config.js';
import { pool, migrate } from './src/db.js';
import { loadUser } from './src/auth.js';
import { stripe } from './src/stripe.js';
import { mailEnabled, verifyMailer } from './src/mailer.js';
import authRoutes from './src/routes/auth.js';
import orderRoutes from './src/routes/orders.js';
import adminRoutes from './src/routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../frontend-client/dist');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Hostinger rulează aplicația în spatele unui proxy

app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                'script-src': ["'self'", 'https://js.stripe.com'],
                'style-src': ["'self'", "'unsafe-inline'"],
                'font-src': ["'self'"], // fonturile sunt găzduite local, nu de pe Google
                'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://tile.openstreetmap.org'],
                'connect-src': [
                    "'self'",
                    'https://photon.komoot.io',
                    'https://nominatim.openstreetmap.org',
                    'https://router.project-osrm.org',
                    'https://api.stripe.com'
                ],
                'frame-src': ['https://js.stripe.com', 'https://hooks.stripe.com']
            }
        },
        crossOriginEmbedderPolicy: false,
        // OpenStreetMap (hartă + căutare adrese) blochează cererile fără Referer.
        // Trimitem doar domeniul site-ului, nu adresa completă a paginii.
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    })
);

if (config.corsOrigin) {
    // Folosit doar dacă frontend-ul e pe alt domeniu decât API-ul.
    app.use('/api', (req, res, next) => {
        res.set('Access-Control-Allow-Origin', config.corsOrigin);
        res.set('Access-Control-Allow-Credentials', 'true');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
        res.set('Vary', 'Origin');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });
}

app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use('/api', loadUser);

let dbError = null; // ultimul cod de eroare MySQL (ex. ER_ACCESS_DENIED_ERROR), fără detalii sensibile

app.get('/api/health', async (_req, res) => {
    if (!configOk) {
        return res.status(503).json({ ok: false, problems: configProblems });
    }
    try {
        await pool.query('SELECT 1');
        dbError = null;
        res.json({ ok: true, db: 'connected', payments: Boolean(stripe), email: mailEnabled, node: process.version });
    } catch (err) {
        dbError = err.code || 'UNKNOWN';
        res.status(503).json({ ok: false, db: 'unreachable', error: dbError, dbHost: config.db.host });
    }
});

// Dacă lipsesc setări obligatorii, restul API-ului răspunde clar cu 503 în loc să cadă serverul.
app.use('/api', (_req, res, next) => {
    if (configOk) return next();
    res.status(503).json({ error: 'Our booking service is not configured yet. Please try again later.' });
});

app.get('/api/config', (_req, res) => {
    res.json({ paymentsEnabled: Boolean(stripe), currency: config.currency });
});

app.use('/api/auth', authRoutes);
app.use('/api', orderRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));

// Site-ul React
if (fs.existsSync(distDir)) {
    app.use(
        express.static(distDir, {
            index: false,
            setHeaders(res, filePath) {
                if (filePath.includes(`${path.sep}assets${path.sep}`)) {
                    res.set('Cache-Control', 'public, max-age=31536000, immutable');
                }
            }
        })
    );
    // Orice altă adresă (/admin/login etc.) încarcă aplicația React, care își face singură rutarea.
    app.get(/.*/, (_req, res) => {
        res.set('Cache-Control', 'no-cache');
        res.sendFile(path.join(distDir, 'index.html'));
    });
} else {
    app.get('/', (_req, res) => res.send('Reloq API is running. The frontend is not built (frontend-client/dist is missing).'));
}

// Eroare neașteptată: o logăm, dar nu trimitem detalii interne la client.
app.use((err, _req, res, _next) => {
    console.error('[reloq] Eroare:', err);
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

if (!configOk) {
    console.error('[reloq] Configurare incompletă:', configProblems.join('; '));
} else try {
    await migrate();
    console.log('[reloq] Baza de date este pregătită.');
} catch (err) {
    console.error('[reloq] Nu mă pot conecta la baza de date. Verifică DB_HOST / DB_USER / DB_PASSWORD / DB_NAME.');
    console.error(err.message);
}

verifyMailer();

app.listen(config.port, () => {
    console.log(`[reloq] Server pornit pe portul ${config.port}${stripe ? ' (plăți Stripe active)' : ''}`);
});
