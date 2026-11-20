// Funcții comune pentru comenzi (folosite de rutele client și admin).
import crypto from 'node:crypto';
import { VEHICLES, priceLines } from './pricing.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // fără 0/O, 1/I

/** Cod de comandă greu de ghicit: RLQ-XXXXXXXX (32^8 ≈ 1 trilion combinații). */
export function newOrderCode() {
    const bytes = crypto.randomBytes(8);
    let out = '';
    for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    return `RLQ-${out}`;
}

const cents = (v) => Math.round(Number(v)) / 100;

/** Liniile de preț ale unei comenzi salvate (model v2), sau cele vechi pentru comenzile dinainte. */
function orderPrice(row, vehicle) {
    if (Number(row.pricing_version) >= 2) {
        return priceLines({
            reservationFeeCents: Number(row.time_cost_cents),
            serviceFeeCents: Number(row.base_fare_cents),
            transportationCents: Number(row.distance_cost_cents),
            totalCents: Number(row.total_cents),
            laborCentsPerMin: Number(row.labor_cents_per_min),
            crew: vehicle?.crew || 1,
            perMileCents: vehicle?.perMileCents || 0,
            outboundMins: Number(row.outbound_mins),
            returnMins: Number(row.return_mins),
            distanceMiles: Number(row.distance_miles)
        });
    }
    return {
        lines: [
            { key: 'base', label: 'Base fare', detail: '', amount: cents(row.base_fare_cents) },
            { key: 'distance', label: 'Distance', detail: '', amount: cents(row.distance_cost_cents) },
            { key: 'time', label: 'Time', detail: '', amount: cents(row.time_cost_cents) }
        ],
        total: cents(row.total_cents),
        labor: null
    };
}

function parseDetails(raw) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

const ORDINAL = (n) => `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10 > 3 || Math.floor((n % 100) / 10) === 1 ? 0 : n % 10] || 'th'}`;

/** „Apt 4B · 3rd floor · no elevator” (+ notele de acces separat). */
export function describeLocation(details) {
    if (!details) return '';
    const floor =
        details.floor === 'ground'
            ? 'Ground floor / house'
            : details.floor === 'basement'
              ? 'Basement'
              : details.floor === '10+'
                ? '10th floor or higher'
                : details.floor
                  ? `${ORDINAL(Number(details.floor))} floor`
                  : '';
    const elevator = details.floor && details.floor !== 'ground' ? (details.elevator === 'yes' ? 'elevator' : 'no elevator (stairs)') : '';
    return [details.unit ? `Unit ${details.unit}` : '', floor, elevator].filter(Boolean).join(' · ');
}

/** Manopera reală: de la sosirea la pickup până la finalizare, rotunjită în sus la minut. */
export function laborActual(row) {
    if (!row.arrived_at || !row.completed_at || !row.labor_cents_per_min) return null;
    const ms = new Date(row.completed_at) - new Date(row.arrived_at);
    if (!(ms > 0)) return null;
    const minutes = Math.ceil(ms / 60000);
    return { minutes, amount: cents(minutes * Number(row.labor_cents_per_min)) };
}

/** Transformă un rând din DB în obiectul trimis la frontend. */
export function toOrderDto(row, { includeCustomer = false, includeDriver = false } = {}) {
    const vehicle = VEHICLES[row.vehicle];
    const dto = {
        id: row.code,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        pickup: { address: row.pickup_address, lat: Number(row.pickup_lat), lng: Number(row.pickup_lng), details: parseDetails(row.pickup_details) },
        dropoff: { address: row.dropoff_address, lat: Number(row.dropoff_lat), lng: Number(row.dropoff_lng), details: parseDetails(row.dropoff_details) },
        routeInfo: { distanceMiles: Number(row.distance_miles), durationMins: row.duration_mins },
        vehicle: { id: row.vehicle, name: vehicle?.name || row.vehicle, crewLabel: vehicle?.crewLabel || '' },
        schedule: { type: row.schedule_type, scheduledFor: row.scheduled_for, label: row.schedule_label },
        scheduleText: row.schedule_label,
        itemsDescription: row.items_description,
        photosCount: row.photos_count,
        // Pozele încărcate (id-uri); fiecare pagină își construiește linkul (client / dispecer / șofer)
        photoIds: row.photo_ids ? String(row.photo_ids).split(',').map(Number) : [],
        price: orderPrice(row, vehicle),
        totalAmount: cents(row.total_cents),
        currency: row.currency,
        cardLast4: row.card_last4 || null,
        // Plătit online (transportul). Comenzile plătite înainte de coloana paid_at au status 'paid'.
        paidOnline: Boolean(row.paid_at) || row.status === 'paid',
        paymentMethod: row.payment_method || (row.card_last4 ? 'stripe' : null)
    };

    // Momentele jobului (raportate de șofer sau de dispecer) și manopera calculată din ele
    const iso = (v) => (v ? new Date(v).toISOString() : null);
    dto.timeline = { enRouteAt: iso(row.en_route_at), arrivedAt: iso(row.arrived_at), completedAt: iso(row.completed_at) };
    dto.laborActual = laborActual(row);

    // Șoferul alocat și notele interne: doar în dispecerat (și în emailurile trimise de acolo).
    if (includeDriver) {
        dto.dispatchNotes = row.dispatch_notes || '';
        dto.driver = row.driver_id
            ? {
                  id: row.driver_id,
                  fullName: row.driver_name ?? null,
                  email: row.driver_email ?? null,
                  phone: row.driver_phone ?? null,
                  notifiedAt: row.driver_notified_at ? new Date(row.driver_notified_at).toISOString() : null,
                  // Linkul paginii de job a șoferului (dispecerul îl poate copia / deschide)
                  jobPath: row.driver_token ? `/job/${row.driver_token}` : null
              }
            : null;
    }

    if (includeCustomer || row.customer_email) {
        dto.customer = {
            fullName: row.customer_name ?? null,
            email: row.customer_email ?? null,
            phone: row.customer_phone ?? null
        };
    }
    return dto;
}

export const ORDER_WITH_CUSTOMER_SQL = `
    SELECT o.*, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
           d.full_name AS driver_name, d.email AS driver_email, d.phone AS driver_phone,
           (SELECT GROUP_CONCAT(p.id ORDER BY p.id) FROM order_photos p WHERE p.order_id = o.id) AS photo_ids
    FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN drivers d ON d.id = o.driver_id`;
