// Funcții comune pentru comenzi (folosite de rutele client și admin).
import crypto from 'node:crypto';
import { VEHICLES } from './pricing.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // fără 0/O, 1/I

/** Cod de comandă greu de ghicit: RLQ-XXXXXXXX (32^8 ≈ 1 trilion combinații). */
export function newOrderCode() {
    const bytes = crypto.randomBytes(8);
    let out = '';
    for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    return `RLQ-${out}`;
}

const cents = (v) => Math.round(Number(v)) / 100;

/** Transformă un rând din DB în obiectul trimis la frontend. */
export function toOrderDto(row, { includeCustomer = false } = {}) {
    const vehicle = VEHICLES[row.vehicle];
    const dto = {
        id: row.code,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        pickup: { address: row.pickup_address, lat: Number(row.pickup_lat), lng: Number(row.pickup_lng) },
        dropoff: { address: row.dropoff_address, lat: Number(row.dropoff_lat), lng: Number(row.dropoff_lng) },
        routeInfo: { distanceMiles: Number(row.distance_miles), durationMins: row.duration_mins },
        vehicle: { id: row.vehicle, name: vehicle?.name || row.vehicle, crewLabel: vehicle?.crewLabel || '' },
        schedule: { type: row.schedule_type, scheduledFor: row.scheduled_for, label: row.schedule_label },
        scheduleText: row.schedule_label,
        itemsDescription: row.items_description,
        photosCount: row.photos_count,
        price: {
            baseFare: cents(row.base_fare_cents),
            distanceCost: cents(row.distance_cost_cents),
            timeCost: cents(row.time_cost_cents),
            total: cents(row.total_cents)
        },
        totalAmount: cents(row.total_cents),
        currency: row.currency,
        cardLast4: row.card_last4 || null
    };

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
    SELECT o.*, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
    FROM orders o
    JOIN users u ON u.id = o.user_id`;
