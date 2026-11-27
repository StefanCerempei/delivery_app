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
        const p = priceLines({
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
        // Reducerea apare ca linie separată (totalul salvat e deja redus)
        if (Number(row.discount_cents) > 0) {
            p.lines.push({
                key: 'discount',
                label: `Discount ${row.discount_code} (${row.discount_percent}%)`,
                detail: 'Discount code',
                amount: -Number(row.discount_cents) / 100
            });
        }
        return p;
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
        details.floor === 'house'
            ? 'Private home / townhome'
            : details.floor === 'storage'
              ? 'Storage'
              : details.floor === 'ground'
            ? 'Ground floor'
            : details.floor === 'basement'
              ? 'Basement'
              : details.floor === '6+'
                ? '6th floor or above'
                : details.floor === '10+'
                ? '10th floor or above'
                : details.floor
                  ? `${ORDINAL(Number(details.floor))} floor`
                  : '';
    const elevator =
        details.floor && !['house', 'storage', 'ground'].includes(details.floor)
            ? details.elevator === 'yes'
                ? 'elevator'
                : 'walk-up stairs (no elevator)'
            : '';
    return [details.unit ? `Unit ${details.unit}` : '', floor, elevator].filter(Boolean).join(' · ');
}

/** Specificația RELOQ 4.2: durata se facturează rotunjită în sus la următorul multiplu de 5 minute. */
export const billableMinutes = (elapsedMinutes) => Math.ceil(Number(elapsedMinutes) / 5) * 5;

/**
 * Manopera reală: cronometrul pornit la sosire (Arrived) și oprit la final (Completed).
 * elapsedMinutes = timpul scurs (rotunjit în sus la minut, din timestamp-urile de pe server);
 * minutes = durata facturată (rotunjită în sus la 5 min). Dispecerul poate corecta timpul scurs
 * (labor_minutes_override), cu motiv salvat în jurnalul comenzii.
 */
export function laborActual(row) {
    if (!row.labor_cents_per_min) return null;
    let timed = null;
    if (row.arrived_at && row.completed_at) {
        const ms = new Date(row.completed_at) - new Date(row.arrived_at) - Number(row.labor_paused_secs || 0) * 1000;
        if (ms > 0) timed = Math.ceil(ms / 60000);
    }
    const override = row.labor_minutes_override != null ? Number(row.labor_minutes_override) : null;
    const elapsed = override ?? timed;
    if (elapsed == null) return null;
    const minutes = billableMinutes(elapsed);
    return {
        minutes,
        elapsedMinutes: elapsed,
        timedMinutes: timed,
        adjusted: override != null,
        startedAt: row.arrived_at ? new Date(row.arrived_at).toISOString() : null,
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        ratePerMinute: cents(row.labor_cents_per_min),
        amount: cents(minutes * Number(row.labor_cents_per_min))
    };
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
        discount: Number(row.discount_cents) > 0
            ? { code: row.discount_code, percent: Number(row.discount_percent), amount: cents(row.discount_cents) }
            : null,
        currency: row.currency,
        cardLast4: row.card_last4 || null,
        // Plătit online (transportul). Comenzile plătite înainte de coloana paid_at au status 'paid'.
        paidOnline: Boolean(row.paid_at) || row.status === 'paid',
        paymentMethod: row.payment_method || (row.card_last4 ? 'stripe' : null),
        createdBy: row.created_by || null,
        paymentLink:
            row.status === 'pending_payment' && row.payment_link_url
                ? { url: row.payment_link_url, expiresAt: row.payment_link_expires_at ? new Date(row.payment_link_expires_at).toISOString() : null }
                : null
    };

    // Momentele jobului (raportate de șofer sau de dispecer) și manopera calculată din ele
    const iso = (v) => (v ? new Date(v).toISOString() : null);
    dto.timeline = {
        enRouteAt: iso(row.en_route_at),
        arrivedAt: iso(row.arrived_at),
        completedAt: iso(row.completed_at),
        // pauza în curs (dacă e pe pauză) și totalul pauzelor terminate, în secunde
        pausedAt: iso(row.labor_paused_at),
        pausedSecs: Number(row.labor_paused_secs || 0)
    };
    dto.laborActual = laborActual(row);
    // Plata manoperei după job (vezi labor.js): starea și suma cerută / plătită
    dto.laborBilling = {
        status: row.labor_status || 'none',
        amount: row.labor_cents != null ? cents(row.labor_cents) : dto.laborActual?.amount ?? null,
        requestedAt: iso(row.labor_requested_at),
        paidAt: iso(row.labor_paid_at),
        method: row.labor_payment_method || null
    };

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
                  jobPath: row.driver_token ? `/driver/job/${row.driver_token}` : null
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

/**
 * Salvează o comandă nouă (rezervarea clientului sau comanda creată de dispecer), cu prețul calculat
 * pe server. Reîncearcă cu alt cod dacă codul generat există deja. Întoarce codul final.
 * o: { id, code, userId, status, pickup, dropoff, pickupDetails, dropoffDetails, route, vehicle, schedule,
 *      itemsDescription, price, totalCents, currency, discount, termsVersion, createdBy }
 */
export async function insertOrderRow(conn, o) {
    let code = o.code;
    for (let attempt = 0; ; attempt++) {
        try {
            await conn.query(
                `INSERT INTO orders (
                    id, code, user_id, status,
                    pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
                    distance_miles, duration_mins, vehicle, schedule_type, scheduled_for, schedule_label,
                    items_description, photos_count,
                    base_fare_cents, distance_cost_cents, time_cost_cents, total_cents, currency,
                    pricing_version, outbound_mins, return_mins, labor_cents_per_min,
                    pickup_details, dropoff_details, discount_code, discount_percent, discount_cents,
                    route_source, terms_accepted_at, terms_version, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                          IF(? IS NULL, NULL, UTC_TIMESTAMP()), ?, ?)`,
                [
                    o.id, code, o.userId, o.status,
                    o.pickup.address, o.pickup.lat, o.pickup.lng,
                    o.dropoff.address, o.dropoff.lat, o.dropoff.lng,
                    o.route.distanceMiles, o.route.durationMins, o.vehicle,
                    o.schedule.type, o.schedule.scheduledFor, o.schedule.label,
                    // numărul real de poze se actualizează la încărcarea lor (/orders/:code/photos)
                    o.itemsDescription,
                    // Model de preț v2: base_fare = Service fee, distance_cost = Transportation, time_cost = Reservation fee
                    o.price.serviceFeeCents, o.price.transportationCents, o.price.reservationFeeCents, o.totalCents,
                    o.currency,
                    o.price.outboundMins, o.price.returnMins, o.price.laborCentsPerMin,
                    o.pickupDetails ? JSON.stringify(o.pickupDetails) : null,
                    o.dropoffDetails ? JSON.stringify(o.dropoffDetails) : null,
                    o.discount?.code || null, o.discount?.percent || null, o.discount?.cents || 0,
                    o.route.source || null, o.termsVersion || null, o.termsVersion || null, o.createdBy || null
                ]
            );
            return code;
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY' && attempt < 3) {
                code = newOrderCode();
                continue;
            }
            throw err;
        }
    }
}
