// Conținut citibil de agenți (AI, motoare de căutare) fără JavaScript:
//   - paginile publice primesc HTML randat pe server (titlu, descriere, canonical, <h1>, text, JSON-LD);
//   - aceeași pagină în Markdown când se cere `Accept: text/markdown`;
//   - robots.txt (Content-Signal + Sitemap), sitemap.xml, llms.txt;
//   - adresele necunoscute răspund 404 real.
// React înlocuiește conținutul randat aici imediat ce pornește (createRoot), deci vizitatorii văd aplicația normală.
import { VEHICLES, SERVICE_FEE_CENTS, RESERVATION_CENTS_PER_MIN, LABOR_CENTS_PER_MIN } from './pricing.js';
import { SERVICE_AREA_LABEL } from './serviceArea.js';

/** Datele firmei (aceleași ca în frontend-client/src/data/company.js). */
export const COMPANY = {
    brand: 'RELOQ Moving Services',
    legalName: 'RELOQ Moving Services LLC',
    street: '98 Mountain Gate Rd.',
    city: 'Ashland',
    region: 'MA',
    postalCode: '01721',
    country: 'US',
    phone: '(508) 816-7230',
    phoneE164: '+15088167230',
    email: 'info@reloqmove.com',
    website: 'https://www.reloqmove.com',
    instagram: 'https://www.instagram.com/myreloq/',
    usdot: '4182047',
    mc: '1623651',
    madpu: '24HG10',
    geo: { lat: 42.2612, lng: -71.4634 } // Ashland, MA (aproximativ)
};

const usd = (cents) => `$${(cents / 100).toFixed(2)}`;
const esc = (v) =>
    String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Profiluri externe ale firmei (sameAs): FMCSA (din numărul DOT) + site-ul principal + cele din SAME_AS (virgulă). */
export function sameAsLinks() {
    const extra = String(process.env.SAME_AS || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^https:\/\//.test(s));
    return [
        COMPANY.website,
        COMPANY.instagram,
        `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${COMPANY.usdot}`,
        ...extra
    ];
}

const fullAddress = `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.region} ${COMPANY.postalCode}`;
const licenses = `U.S. DOT No. ${COMPANY.usdot} • MC No. ${COMPANY.mc} • MA DPU No. ${COMPANY.madpu}`;

const vehicleLines = () =>
    Object.values(VEHICLES).map(
        (v) => `${v.name} — ${v.crewLabel}; transportation ${usd(v.perMileCents)}/mile; labor ${usd(LABOR_CENTS_PER_MIN[v.crew])}/min`
    );

/**
 * Paginile publice. Fiecare secțiune: { heading, paragraphs[], list[], links[[text, href]] }.
 * Textul descrie doar ce face aplicația și datele publice ale firmei.
 */
function pages() {
    const contactLinks = [
        [`Call ${COMPANY.phone}`, `tel:${COMPANY.phoneE164}`],
        [`Email ${COMPANY.email}`, `mailto:${COMPANY.email}`],
        ['Instagram @myreloq', COMPANY.instagram]
    ];
    const footerLinks = [
        ['Book a move', '/'],
        ['About RELOQ', '/about'],
        ['Contact', '/contact'],
        ['Terms of Service', '/terms'],
        ['Privacy Policy', '/privacy'],
        ['RELOQ Moving Services website', COMPANY.website]
    ];
    // Linkuri oficiale obligatorii pentru firmele de mutări (FMCSA, 49 CFR 375.213) + profilul firmei la FMCSA
    const fmcsaLinks = [
        ['Your Rights and Responsibilities When You Move (FMCSA)', 'https://www.fmcsa.dot.gov/protect-your-move/consumer-rights'],
        ['Ready to Move? brochure (FMCSA)', 'https://www.fmcsa.dot.gov/sites/fmcsa.dot.gov/files/ReadytoMoveBrochure_2022Update.pdf'],
        [`RELOQ on FMCSA SAFER (USDOT ${COMPANY.usdot})`, sameAsLinks().find((u) => u.includes('safer.fmcsa'))]
    ];
    return {
        '/': {
            title: 'Book Movers in Massachusetts — RELOQ Moving Services',
            description: 'Book licensed movers online in Massachusetts, from Worcester east. Courier, van or moving truck with 1–3 movers and upfront transport pricing.',
            h1: 'Book movers and delivery online in Massachusetts',
            type: 'WebPage',
            sections: [
                {
                    paragraphs: [
                        `Book movers and delivery online in Massachusetts with RELOQ Moving Services, a licensed moving and delivery company based in ${COMPANY.city}, MA. Book movers online in a few minutes: enter your pickup and drop-off addresses, choose your items and vehicle, pick a 2-hour arrival window from tomorrow onward and pay securely online.`,
                        'From a single delivery of boxes or a TV to a full apartment move, our movers bring the right vehicle, straps and moving blankets.',
                        `Service area: ${SERVICE_AREA_LABEL}.`
                    ]
                },
                {
                    heading: 'How booking works',
                    list: [
                        'Enter the pickup and drop-off addresses, with floor, elevator and access details.',
                        'Choose your items and add photos so the crew brings the right equipment.',
                        'Pick the recommended vehicle: courier, van or moving truck with 1–3 movers.',
                        'Choose a date and a 2-hour arrival window; booked windows are not offered twice.',
                        'Pay the reservation fee, service fee and transportation online (card, Apple Pay, Google Pay, Amazon Pay).',
                        'Labor is billed after the job for the actual time worked, from arrival at pickup to completion.'
                    ]
                },
                {
                    heading: 'Pricing',
                    paragraphs: [
                        `Paid at booking: reservation fee (${usd(RESERVATION_CENTS_PER_MIN)} per minute of driving to the pickup and back from the drop-off), a ${usd(SERVICE_FEE_CENTS)} service fee and transportation per mile. Labor is billed after the job, per minute, by crew size.`
                    ],
                    list: vehicleLines()
                },
                {
                    heading: 'Frequently asked questions',
                    faq: [
                        [
                            'When can I book a move?',
                            'Bookings open from tomorrow onward, in 2-hour arrival windows between 7:00 AM and 5:00 PM. Each window is booked by one customer only, so the crew arrives on time.'
                        ],
                        [
                            'What do I pay when I book?',
                            `At booking you pay the reservation fee, the ${usd(SERVICE_FEE_CENTS)} service fee and transportation for the miles between pickup and drop-off. You can pay by card, Apple Pay, Google Pay or Amazon Pay.`
                        ],
                        [
                            'How is labor charged?',
                            'Labor is billed after the job, per minute, for the time from the crew’s arrival at pickup until everything is delivered. Breaks are not billed. You get a payment request by email and in your account.'
                        ],
                        [
                            'Which vehicle do I need?',
                            'Pick your items and the app recommends a vehicle: a courier for boxes and small items, a van with one or two movers, or a 12–26 ft moving truck with two or three movers for larger moves.'
                        ],
                        [
                            'Do you handle stairs and apartments?',
                            'Yes. Add the floor, whether there is an elevator, the apartment number and any access notes for both addresses, so the crew comes prepared.'
                        ],
                        [
                            'Can I cancel?',
                            'Cancellation is free up to 24 hours before your arrival window. Call or email us with your order number.'
                        ],
                        [
                            'Will the crew contact me?',
                            'Yes. The crew calls you about 45 minutes before arrival, and you receive an email when they are on the way.'
                        ]
                    ]
                },
                { heading: 'Contact', paragraphs: [fullAddress, licenses], links: contactLinks },
                { heading: 'Moving resources', links: fmcsaLinks },
                { heading: 'More', links: footerLinks }
            ]
        },
        '/about': {
            title: 'About — RELOQ Moving Services',
            description: 'RELOQ Moving Services LLC: licensed Massachusetts movers (USDOT 4182047) based in Ashland. Online booking for moves and deliveries.',
            h1: 'About RELOQ Moving Services',
            type: 'AboutPage',
            sections: [
                {
                    paragraphs: [
                        `${COMPANY.legalName} is a moving and delivery company based in ${COMPANY.city}, Massachusetts. Customers book online, pay transport upfront and pay labor for the actual time worked after the job.`,
                        `We serve ${SERVICE_AREA_LABEL}.`
                    ]
                },
                { heading: 'Licenses', list: [`U.S. DOT No. ${COMPANY.usdot}`, `MC No. ${COMPANY.mc}`, `MA DPU No. ${COMPANY.madpu}`] },
                { heading: 'Services', list: vehicleLines() },
                { heading: 'Contact', paragraphs: [fullAddress], links: contactLinks },
                { heading: 'Moving resources', links: fmcsaLinks },
                { heading: 'More', links: footerLinks }
            ]
        },
        '/contact': {
            title: 'Contact — RELOQ Moving Services',
            description: `Contact RELOQ Moving Services in Ashland, MA: call ${COMPANY.phone} or email ${COMPANY.email} about a booking, quote or change.`,
            h1: 'Contact RELOQ Moving Services',
            type: 'ContactPage',
            sections: [
                {
                    paragraphs: [
                        'Questions about a booking, a quote or a change? Call or email us with your order number.',
                        `${COMPANY.legalName}, ${fullAddress}`
                    ],
                    links: contactLinks
                },
                { heading: 'Service area', paragraphs: [SERVICE_AREA_LABEL] },
                { heading: 'More', links: footerLinks }
            ]
        },
        '/terms': {
            title: 'Terms of Service — RELOQ Moving Services',
            description: 'Terms of Service for RELOQ Moving Services bookings: payment at booking, labor billed after the job, cancellations and liability.',
            h1: 'Terms of Service',
            type: 'WebPage',
            sections: [
                {
                    paragraphs: [
                        'These terms govern bookings made through the RELOQ app: the reservation fee, service fee and transportation are paid at booking; labor is billed after the job for the actual time worked. Free cancellation up to 24 hours before the arrival window.',
                        `Governing law: the Commonwealth of Massachusetts. Questions: ${COMPANY.email}.`
                    ],
                    links: [['Contact', '/contact'], ['Privacy Policy', '/privacy']]
                }
            ]
        },
        '/privacy': {
            title: 'Privacy Policy — RELOQ Moving Services',
            description: 'How RELOQ Moving Services uses your data when you book a move: account, addresses, items, photos and payments. Card data stays with Stripe.',
            h1: 'Privacy Policy',
            type: 'WebPage',
            sections: [
                {
                    paragraphs: [
                        'We collect the details needed to perform your move: your account (name, email, phone), pickup and drop-off addresses with access details, item descriptions and photos, and payment status. Card details are processed by Stripe and PayPal and never stored by RELOQ.',
                        `Privacy questions or data requests: ${COMPANY.email}.`
                    ],
                    links: [['Contact', '/contact'], ['Terms of Service', '/terms']]
                }
            ]
        }
    };
}

export const PUBLIC_PATHS = ['/', '/about', '/contact', '/terms', '/privacy'];

// Paginile aplicației (cont, dispecerat, șoferi): există, dar nu sunt pentru indexare
const APP_PATHS = [
    /^\/(login|signup|account|account\/settings|forgot-password|reset-password)$/,
    /^\/admin(\/(login|dashboard))?$/,
    /^\/admin\/order\/[^/]+$/,
    /^\/job\/[^/]+$/,
    /^\/driver(\/login)?$/,
    /^\/driver\/job\/[^/]+$/
];

/** 'public' | 'app' | 'missing' */
export function classifyPath(pathname) {
    const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    if (PUBLIC_PATHS.includes(p)) return 'public';
    if (APP_PATHS.some((re) => re.test(p))) return 'app';
    return 'missing';
}

export const baseUrl = (req) => (process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

/* ------------------------------------------------------------------ JSON-LD ------------------------------------------------------------------ */

export function jsonLd(base, path, page) {
    const orgId = `${base}/#organization`;
    const graph = [
        {
            '@type': ['MovingCompany', 'LocalBusiness'],
            '@id': orgId,
            name: COMPANY.brand,
            legalName: COMPANY.legalName,
            url: `${base}/`,
            logo: `${base}/email-logo.png`,
            image: `${base}/driver-icon-512.png`,
            telephone: COMPANY.phoneE164,
            email: COMPANY.email,
            address: {
                '@type': 'PostalAddress',
                streetAddress: COMPANY.street,
                addressLocality: COMPANY.city,
                addressRegion: COMPANY.region,
                postalCode: COMPANY.postalCode,
                addressCountry: COMPANY.country
            },
            geo: { '@type': 'GeoCoordinates', latitude: COMPANY.geo.lat, longitude: COMPANY.geo.lng },
            areaServed: { '@type': 'State', name: 'Massachusetts', description: SERVICE_AREA_LABEL },
            contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'customer service',
                telephone: COMPANY.phoneE164,
                email: COMPANY.email,
                areaServed: 'US-MA',
                availableLanguage: 'en'
            },
            identifier: [
                { '@type': 'PropertyValue', propertyID: 'USDOT', value: COMPANY.usdot },
                { '@type': 'PropertyValue', propertyID: 'MC', value: COMPANY.mc },
                { '@type': 'PropertyValue', propertyID: 'MA DPU', value: COMPANY.madpu }
            ],
            sameAs: sameAsLinks(),
            hasOfferCatalog: {
                '@type': 'OfferCatalog',
                name: 'Moving and delivery services',
                itemListElement: Object.values(VEHICLES).map((v) => ({
                    '@type': 'Offer',
                    itemOffered: { '@type': 'Service', name: v.name, description: v.crewLabel, provider: { '@id': orgId } },
                    priceSpecification: {
                        '@type': 'UnitPriceSpecification',
                        price: (v.perMileCents / 100).toFixed(2),
                        priceCurrency: 'USD',
                        unitText: 'mile'
                    }
                }))
            }
        },
        {
            '@type': 'WebSite',
            '@id': `${base}/#website`,
            url: `${base}/`,
            name: COMPANY.brand,
            publisher: { '@id': orgId },
            inLanguage: 'en-US'
        },
        {
            '@type': page.type || 'WebPage',
            '@id': `${base}${path}#webpage`,
            url: `${base}${path}`,
            name: page.title,
            description: page.description,
            isPartOf: { '@id': `${base}/#website` },
            about: { '@id': orgId },
            inLanguage: 'en-US'
        },
        {
            '@type': 'Service',
            '@id': `${base}/#service`,
            serviceType: 'Moving and delivery',
            name: 'Online moving booking',
            provider: { '@id': orgId },
            areaServed: { '@type': 'State', name: 'Massachusetts' },
            url: `${base}/`
        }
    ];
    const faq = (page.sections || []).flatMap((sec) => sec.faq || []);
    if (faq.length) {
        graph.push({
            '@type': 'FAQPage',
            '@id': `${base}${path}#faq`,
            mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
        });
    }
    return { '@context': 'https://schema.org', '@graph': graph };
}

/* ---------------------------------------------------------------- HTML / Markdown ---------------------------------------------------------------- */

const linkHtml = ([text, href]) => `<a href="${esc(href)}">${esc(text)}</a>`;

function bodyHtml(page) {
    const parts = [`<h1>${esc(page.h1)}</h1>`];
    for (const s of page.sections) {
        parts.push('<section>');
        if (s.heading) parts.push(`<h2>${esc(s.heading)}</h2>`);
        for (const p of s.paragraphs || []) parts.push(`<p>${esc(p)}</p>`);
        if (s.list?.length) parts.push(`<ul>${s.list.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>`);
        for (const [q, a] of s.faq || []) parts.push(`<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`);
        if (s.links?.length) parts.push(`<ul class="ssr-links">${s.links.map((l) => `<li>${linkHtml(l)}</li>`).join('')}</ul>`);
        parts.push('</section>');
    }
    return `<main class="ssr-page">${parts.join('\n')}</main>`;
}

/** Pagina 404 (aceeași structură, ca agenții să primească un text clar). */
const NOT_FOUND = {
    title: 'Page not found — RELOQ Moving Services',
    description: 'This page does not exist.',
    h1: 'Page not found',
    sections: [{ paragraphs: ['The page you are looking for does not exist.'], links: [['Book a move', '/'], ['Contact', '/contact']] }]
};

/**
 * index.html cu meta-datele paginii și conținutul randat în #root.
 * kind: 'public' | 'app' | 'missing'
 */
export function renderHtml(template, { base, path, kind }) {
    const page = kind === 'public' ? pages()[path] : kind === 'missing' ? NOT_FOUND : null;
    const canonical = kind === 'public' ? `${base}${path === '/' ? '/' : path}` : null;
    const head = [];
    if (page) {
        head.push(`<meta name="description" content="${esc(page.description)}" />`);
        head.push(`<meta property="og:title" content="${esc(page.title)}" />`);
        head.push(`<meta property="og:description" content="${esc(page.description)}" />`);
        head.push(`<meta property="og:type" content="website" />`);
        head.push(`<meta property="og:site_name" content="${esc(COMPANY.brand)}" />`);
    }
    if (canonical) {
        head.push(`<link rel="canonical" href="${esc(canonical)}" />`);
        head.push(`<meta property="og:url" content="${esc(canonical)}" />`);
        head.push(`<link rel="alternate" type="text/markdown" href="${esc(canonical)}" title="Markdown version" />`);
        head.push(`<script type="application/ld+json">${JSON.stringify(jsonLd(base, path, page)).replace(/</g, '\\u003c')}</script>`);
    }
    // Paginile de cont / dispecerat / șoferi și 404: fără indexare
    if (kind !== 'public') head.push('<meta name="robots" content="noindex" />');
    head.push(`<link rel="help" type="text/plain" href="/llms.txt" />`);

    let html = template;
    if (page) html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`);
    html = html.replace('</head>', `    ${head.join('\n    ')}\n</head>`);
    if (page) html = html.replace('<div id="root"></div>', `<div id="root">${bodyHtml(page)}</div>`);
    return html;
}

function pageMarkdown(page, base) {
    const abs = (href) => (href.startsWith('/') ? `${base}${href}` : href);
    const out = [`# ${page.h1}`, '', `> ${page.description}`, ''];
    for (const s of page.sections) {
        if (s.heading) out.push(`## ${s.heading}`, '');
        for (const p of s.paragraphs || []) out.push(p, '');
        if (s.list?.length) out.push(...s.list.map((li) => `- ${li}`), '');
        for (const [q, a] of s.faq || []) out.push(`### ${q}`, '', a, '');
        if (s.links?.length) out.push(...s.links.map(([t, h]) => `- [${t}](${abs(h)})`), '');
    }
    return out.join('\n');
}

export function renderMarkdown({ base, path, kind }) {
    const page = kind === 'public' ? pages()[path] : NOT_FOUND;
    return pageMarkdown(page, base);
}

/* ----------------------------------------------------------- robots / sitemap / llms.txt ----------------------------------------------------------- */

export function robotsTxt(base) {
    return [
        '# RELOQ Moving Services',
        '# Content-Signal: search = may be indexed for search; ai-input = may be used to answer questions (RAG / grounding);',
        '# ai-train = may not be used to train AI models.',
        'User-agent: *',
        'Content-Signal: search=yes, ai-input=yes, ai-train=no',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /admin',
        'Disallow: /driver',
        'Disallow: /job/',
        'Disallow: /account',
        '',
        `Sitemap: ${base}/sitemap.xml`,
        ''
    ].join('\n');
}

export function sitemapXml(base) {
    const prio = { '/': '1.0', '/about': '0.7', '/contact': '0.7', '/terms': '0.3', '/privacy': '0.3' };
    const urls = PUBLIC_PATHS.map(
        (p) => `  <url>\n    <loc>${esc(`${base}${p}`)}</loc>\n    <changefreq>${p === '/' ? 'weekly' : 'monthly'}</changefreq>\n    <priority>${prio[p]}</priority>\n  </url>`
    );
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function llmsTxt(base) {
    return [
        `# ${COMPANY.brand}`,
        '',
        `> Licensed Massachusetts moving and delivery company (${licenses}). Customers book a crew online — courier, van or moving truck with 1–3 movers — pay transport upfront and pay labor per minute after the job. Service area: ${SERVICE_AREA_LABEL}.`,
        '',
        `Contact: ${COMPANY.phone} · ${COMPANY.email} · ${fullAddress}`,
        '',
        '## Pages',
        '',
        `- [Book a move](${base}/): online booking — addresses, items, vehicle, arrival window, payment`,
        `- [About](${base}/about): company, licenses and services`,
        `- [Contact](${base}/contact): phone, email and address`,
        `- [Terms of Service](${base}/terms): payments, labor billing, cancellations`,
        `- [Privacy Policy](${base}/privacy): personal data and payments`,
        '',
        '## Pricing',
        '',
        `- Reservation fee: ${usd(RESERVATION_CENTS_PER_MIN)} per minute of driving (to the pickup and back from the drop-off), paid at booking`,
        `- Service fee: ${usd(SERVICE_FEE_CENTS)} per booking, paid at booking`,
        ...vehicleLines().map((l) => `- ${l}`),
        '',
        '## For agents',
        '',
        `- [MCP server card](${base}/.well-known/mcp/server-card.json): read-only tools — company info, pricing, free arrival windows, price estimate`,
        `- [MCP endpoint](${base}/mcp): Streamable HTTP (JSON-RPC over POST)`,
        `- Markdown: request any page above with \`Accept: text/markdown\``,
        `- [Sitemap](${base}/sitemap.xml)`,
        ''
    ].join('\n');
}
