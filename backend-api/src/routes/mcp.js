// Server MCP (Model Context Protocol) public, doar pentru citire: agenții AI pot afla despre firmă,
// prețuri, ferestrele libere și o estimare de preț — fără cont și fără să poată rezerva sau plăti.
// Transport: Streamable HTTP, fără sesiuni (JSON-RPC 2.0 prin POST /mcp, răspuns application/json).
// Descriere publică: /.well-known/mcp/server-card.json
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { VEHICLES, SERVICE_FEE_CENTS, RESERVATION_CENTS_PER_MIN, LABOR_CENTS_PER_MIN, getTrip, allPrices, priceLines } from '../pricing.js';
import { inServiceArea, SERVICE_AREA_LABEL } from '../serviceArea.js';
import { takenSlots } from '../slots.js';
import { businessTodayUTC, parseDateOnly } from '../time.js';
import { searchAddresses } from '../geocode.js';
import { COMPANY, baseUrl } from '../agentReady.js';

const router = Router();
export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_INFO = { name: 'reloq-moving', title: 'RELOQ Moving Services', version: '1.0.0' };
const SLOTS = [
    ['07:00', '7:00 AM – 9:00 AM'],
    ['09:00', '9:00 AM – 11:00 AM'],
    ['11:00', '11:00 AM – 1:00 PM'],
    ['13:00', '1:00 PM – 3:00 PM'],
    ['15:00', '3:00 PM – 5:00 PM']
];
const usd = (c) => Math.round(c) / 100;

export const MCP_TOOLS = [
    {
        name: 'get_company_info',
        title: 'Company info',
        description: 'RELOQ Moving Services: contact details, address, licenses (USDOT/MC/MA DPU), service area and how to book.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, openWorldHint: false }
    },
    {
        name: 'get_pricing',
        title: 'Pricing',
        description: 'How RELOQ prices a move: reservation fee, service fee, per-mile transportation by vehicle, and per-minute labor by crew size.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, openWorldHint: false }
    },
    {
        name: 'check_availability',
        title: 'Free arrival windows',
        description: 'Free 2-hour arrival windows (one booking per window). Bookings start tomorrow (Massachusetts time).',
        inputSchema: {
            type: 'object',
            properties: {
                from: { type: 'string', description: 'First date, YYYY-MM-DD (default: tomorrow).' },
                days: { type: 'integer', minimum: 1, maximum: 14, description: 'How many days to check (default 7).' }
            },
            additionalProperties: false
        },
        annotations: { readOnlyHint: true, openWorldHint: false }
    },
    {
        name: 'estimate_price',
        title: 'Price estimate',
        description:
            'Estimate the amount paid at booking for a move between two addresses in the service area (Massachusetts, from Worcester east), for every vehicle, plus the labor rate billed after the job.',
        inputSchema: {
            type: 'object',
            properties: {
                pickup_address: { type: 'string', description: 'Pickup address, e.g. "98 Mountain Gate Rd, Ashland, MA".' },
                dropoff_address: { type: 'string', description: 'Drop-off address.' },
                vehicle: { type: 'string', enum: Object.keys(VEHICLES), description: 'Optional: only this vehicle.' }
            },
            required: ['pickup_address', 'dropoff_address'],
            additionalProperties: false
        },
        annotations: { readOnlyHint: true, openWorldHint: true }
    }
];

const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }], structuredContent: typeof obj === 'string' ? undefined : obj });
const toolError = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

async function firstInArea(address) {
    const results = await searchAddresses(String(address).slice(0, 200));
    return results.find((r) => !r.outside) || (results[0] ? { ...results[0], outside: true } : null);
}

async function callTool(name, args = {}, base) {
    if (name === 'get_company_info') {
        return text({
            name: COMPANY.brand,
            legalName: COMPANY.legalName,
            phone: COMPANY.phone,
            email: COMPANY.email,
            address: `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.region} ${COMPANY.postalCode}`,
            licenses: { usdot: COMPANY.usdot, mc: COMPANY.mc, maDpu: COMPANY.madpu },
            serviceArea: SERVICE_AREA_LABEL,
            booking: { url: `${base}/`, notes: 'Bookings from tomorrow onward, in 2-hour arrival windows. Payment online at booking; labor after the job.' },
            website: COMPANY.website
        });
    }
    if (name === 'get_pricing') {
        return text({
            currency: 'USD',
            paidAtBooking: {
                reservationFeePerDrivingMinute: usd(RESERVATION_CENTS_PER_MIN),
                serviceFee: usd(SERVICE_FEE_CENTS),
                transportation: 'per mile from pickup to drop-off, by vehicle'
            },
            billedAfterJob: 'labor per minute, from crew arrival at pickup to completion (crew breaks not billed), billed in 5-minute increments (rounded up)',
            vehicles: Object.entries(VEHICLES).map(([id, v]) => ({
                id,
                name: v.name,
                crew: v.crewLabel,
                transportationPerMile: usd(v.perMileCents),
                laborPerMinute: usd(LABOR_CENTS_PER_MIN[v.crew])
            }))
        });
    }
    if (name === 'check_availability') {
        const tomorrow = new Date(businessTodayUTC().getTime() + 864e5);
        let from = args.from ? parseDateOnly(args.from) : tomorrow;
        if (!from) return toolError('from must be a date in YYYY-MM-DD format.');
        if (from < tomorrow) from = tomorrow;
        const days = Math.min(14, Math.max(1, Number.parseInt(args.days ?? 7, 10) || 7));
        const to = new Date(from.getTime() + (days - 1) * 864e5);
        const iso = (d) => d.toISOString().slice(0, 10);
        const taken = await takenSlots(iso(from), iso(to));
        const out = [];
        for (let d = from; d <= to; d = new Date(d.getTime() + 864e5)) {
            const busy = taken[iso(d)] || [];
            out.push({ date: iso(d), freeWindows: SLOTS.filter(([id]) => !busy.includes(id)).map(([, label]) => label) });
        }
        return text({ timezone: 'America/New_York', days: out, bookAt: `${base}/` });
    }
    if (name === 'estimate_price') {
        if (!args.pickup_address || !args.dropoff_address) return toolError('pickup_address and dropoff_address are required.');
        if (args.vehicle && !VEHICLES[args.vehicle]) return toolError(`Unknown vehicle. Use one of: ${Object.keys(VEHICLES).join(', ')}.`);
        const [pickup, dropoff] = await Promise.all([firstInArea(args.pickup_address), firstInArea(args.dropoff_address)]);
        if (!pickup || !dropoff) return toolError('Could not find one of the addresses. Include street, town and "MA".');
        if (!inServiceArea(pickup.lat, pickup.lng) || !inServiceArea(dropoff.lat, dropoff.lng)) {
            return toolError(`One of the addresses is outside the service area (${SERVICE_AREA_LABEL}).`);
        }
        const trip = await getTrip(pickup, dropoff);
        const prices = allPrices(trip);
        const ids = args.vehicle ? [args.vehicle] : Object.keys(VEHICLES);
        return text({
            currency: 'USD',
            pickup: pickup.address,
            dropoff: dropoff.address,
            distanceMiles: trip.distanceMiles,
            estimates: ids.map((id) => {
                const l = priceLines(prices[id]);
                return {
                    vehicle: id,
                    name: VEHICLES[id].name,
                    paidAtBooking: l.total,
                    lines: l.lines.map(({ label, amount }) => ({ label, amount })),
                    laborAfterJob: l.labor?.label || null
                };
            }),
            note: 'Estimate only; the final booking price is calculated when you book. Labor is billed after the job for the actual time.',
            bookAt: `${base}/`
        });
    }
    return null;
}

const mcpLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handle(msg, base) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid Request');
    const isNotification = msg.id === undefined || msg.id === null;
    const { method, params = {} } = msg;
    if (isNotification) return null; // notifications/initialized etc.: nimic de răspuns

    if (method === 'initialize') {
        return {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: { tools: { listChanged: false } },
                serverInfo: MCP_SERVER_INFO,
                instructions:
                    'Read-only tools for RELOQ Moving Services (Massachusetts). Use get_pricing and estimate_price for quotes, check_availability for free arrival windows. Bookings are made by the customer at the booking URL.'
            }
        };
    }
    if (method === 'ping') return { jsonrpc: '2.0', id: msg.id, result: {} };
    if (method === 'tools/list') return { jsonrpc: '2.0', id: msg.id, result: { tools: MCP_TOOLS } };
    if (method === 'tools/call') {
        try {
            const result = await callTool(params.name, params.arguments || {}, base);
            if (!result) return rpcError(msg.id, -32602, `Unknown tool: ${params.name}`);
            return { jsonrpc: '2.0', id: msg.id, result };
        } catch (err) {
            console.warn(`[reloq] MCP ${params.name} a eșuat: ${err.message}`);
            return { jsonrpc: '2.0', id: msg.id, result: toolError('The tool failed. Please try again later.') };
        }
    }
    return rpcError(msg.id, -32601, `Method not found: ${method}`);
}

router.post('/', mcpLimiter, async (req, res) => {
    const base = baseUrl(req);
    const body = req.body;
    res.set('MCP-Protocol-Version', MCP_PROTOCOL_VERSION);
    if (Array.isArray(body)) {
        const out = (await Promise.all(body.map((m) => handle(m, base)))).filter(Boolean);
        return out.length ? res.json(out) : res.status(202).end();
    }
    const out = await handle(body, base);
    if (!out) return res.status(202).end();
    res.json(out);
});

// Fără flux SSE (server fără sesiuni): GET / DELETE nu sunt folosite
router.get('/', (req, res) => res.set('Allow', 'POST').status(405).json(rpcError(null, -32000, 'Use POST with JSON-RPC 2.0.')));
router.delete('/', (req, res) => res.set('Allow', 'POST').status(405).end());

/** MCP Server Card (SEP-1649): descrierea publică a serverului. */
export function serverCard(base) {
    return {
        $schema: 'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
        version: '1.0',
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: MCP_SERVER_INFO,
        name: MCP_SERVER_INFO.name,
        title: MCP_SERVER_INFO.title,
        description: 'Read-only tools for RELOQ Moving Services (Massachusetts, from Worcester east): company info, pricing, free arrival windows and price estimates.',
        documentationUrl: `${base}/llms.txt`,
        endpoint: `${base}/mcp`,
        transport: { type: 'streamable-http', endpoint: `${base}/mcp` },
        remotes: [{ type: 'streamable-http', url: `${base}/mcp` }],
        capabilities: { tools: { listChanged: false } },
        authentication: { required: false, schemes: [] },
        tools: MCP_TOOLS.map(({ name, title, description }) => ({ name, title, description }))
    };
}

export default router;
