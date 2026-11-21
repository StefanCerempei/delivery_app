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
import { paypalEnabled } from './src/paypal.js';
import { mailEnabled, verifyMailer } from './src/mailer.js';
import authRoutes from './src/routes/auth.js';
import orderRoutes from './src/routes/orders.js';
import adminRoutes from './src/routes/admin.js';
import accountRoutes from './src/routes/account.js';
import stripeWebhookRoutes from './src/routes/stripeWebhook.js';
import driverJobRoutes from './src/routes/driverJob.js';
import driverPortalRoutes from './src/routes/driverPortal.js';
import mcpRoutes, { serverCard } from './src/routes/mcp.js';
import { classifyPath, baseUrl, renderHtml, renderMarkdown, robotsTxt, sitemapXml, llmsTxt } from './src/agentReady.js';

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
                'script-src': ["'self'", 'https://js.stripe.com', 'https://*.js.stripe.com', 'https://www.paypal.com', 'https://*.paypal.com'],
                'style-src': ["'self'", "'unsafe-inline'"],
                'font-src': ["'self'"], // fonturile sunt găzduite local, nu de pe Google
                'img-src': [
                    "'self'",
                    'data:',
                    'blob:',
                    'https://*.tile.openstreetmap.org',
                    'https://tile.openstreetmap.org',
                    'https://*.paypal.com',
                    'https://*.paypalobjects.com'
                ],
                'connect-src': [
                    "'self'",
                    'https://photon.komoot.io',
                    'https://nominatim.openstreetmap.org',
                    'https://router.project-osrm.org',
                    'https://api.stripe.com',
                    'https://*.stripe.com',
                    'https://*.paypal.com'
                ],
                // Butoanele Apple Pay / Google Pay / Amazon Pay ale Stripe rulează în iframe-uri *.js.stripe.com
                'frame-src': ['https://js.stripe.com', 'https://*.js.stripe.com', 'https://hooks.stripe.com', 'https://*.paypal.com']
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

// Webhook-ul Stripe are nevoie de corpul brut (verificarea semnăturii), deci e înainte de express.json().
app.use('/api/stripe/webhook', stripeWebhookRoutes);

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
        res.json({ ok: true, db: 'connected', payments: Boolean(stripe), webhook: Boolean(stripe && config.stripeWebhookSecret), paypal: paypalEnabled, email: mailEnabled });
    } catch (err) {
        dbError = err.code || 'UNKNOWN';
        // Adresa serverului de bază de date apare doar în log-uri, nu în răspunsul public.
        console.error(`[reloq] Health: baza de date nu răspunde (${dbError}) la ${config.db.host}:${config.db.port}`);
        res.status(503).json({ ok: false, db: 'unreachable', error: dbError });
    }
});

// Dacă lipsesc setări obligatorii, restul API-ului răspunde clar cu 503 în loc să cadă serverul.
app.use('/api', (_req, res, next) => {
    if (configOk) return next();
    res.status(503).json({ error: 'Our booking service is not configured yet. Please try again later.' });
});

app.get('/api/config', (_req, res) => {
    res.json({
        paymentsEnabled: Boolean(stripe),
        currency: config.currency,
        // Client ID-ul PayPal e public (îl folosește scriptul PayPal din browser); secretul rămâne pe server.
        paypalClientId: stripe && paypalEnabled ? config.paypal.clientId : null
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api', orderRoutes);
app.use('/api', driverJobRoutes);
app.use('/api/driver', driverPortalRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));

// ---- Pentru agenți (AI / motoare de căutare): robots, sitemap, llms.txt, MCP ----
const publicCors = (req, res, next) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id' });
    if (req.method === 'OPTIONS') return res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS').sendStatus(204);
    next();
};
const sendText = (type, body) => (req, res) => res.type(type).set('Cache-Control', 'public, max-age=3600').send(body(baseUrl(req)));
app.get('/robots.txt', sendText('text/plain; charset=utf-8', robotsTxt));
app.get('/sitemap.xml', sendText('application/xml; charset=utf-8', sitemapXml));
app.get('/llms.txt', publicCors, sendText('text/plain; charset=utf-8', llmsTxt));
app.get(['/.well-known/mcp/server-card.json', '/.well-known/mcp.json'], publicCors, (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600').json(serverCard(baseUrl(req)));
});
app.use('/mcp', publicCors, mcpRoutes);

// Site-ul React
if (fs.existsSync(distDir)) {
    app.use(
        express.static(distDir, {
            index: false,
            setHeaders(res, filePath) {
                if (filePath.includes(`${path.sep}assets${path.sep}`)) {
                    res.set('Cache-Control', 'public, max-age=31536000, immutable');
                }
                // Aplicația șoferului: service worker-ul și manifestul trebuie verificate la fiecare deschidere
                if (/((driver|admin)-sw\.js|\.webmanifest|pwa\.js)$/.test(filePath)) res.set('Cache-Control', 'no-cache');
                if (filePath.endsWith('.webmanifest')) res.type('application/manifest+json');
            }
        })
    );
    // Paginile aplicației: index.html cu titlu / descriere / canonical / JSON-LD și conținutul randat pe server
    // (paginile publice), Markdown la `Accept: text/markdown`, 404 real pentru adresele care nu există.
    let indexTemplate = null;
    const template = () => (indexTemplate ??= fs.readFileSync(path.join(distDir, 'index.html'), 'utf8'));
    app.get(/.*/, (req, res) => {
        const pathname = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
        const kind = classifyPath(pathname);
        const base = baseUrl(req);
        res.set('Cache-Control', 'no-cache');
        res.set('Vary', 'Accept');
        res.status(kind === 'missing' ? 404 : 200);
        if (kind === 'public') {
            const self = `${base}${pathname === '/' ? '/' : pathname}`;
            res.set('Link', [`<${base}/llms.txt>; rel="describedby"; type="text/plain"`, `<${self}>; rel="alternate"; type="text/markdown"`, `<${base}/sitemap.xml>; rel="sitemap"; type="application/xml"`, `<${base}/.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"`].join(', '));
        }
        // Agenții care cer Markdown (și preferă Markdown față de HTML)
        if (kind !== 'app' && req.accepts(['text/html', 'text/markdown']) === 'text/markdown') {
            return res.type('text/markdown; charset=utf-8').send(renderMarkdown({ base, path: pathname, kind }));
        }
        res.type('html').send(renderHtml(template(), { base, path: pathname, kind }));
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
