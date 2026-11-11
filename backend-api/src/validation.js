import { z } from 'zod';
import { VEHICLES } from './pricing.js';

export const locationSchema = z.object({
    address: z.string().trim().min(3).max(500),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
});

export const registerSchema = z.object({
    fullName: z.string().trim().min(2, 'Introdu numele complet.').max(120),
    phone: z
        .string()
        .trim()
        .max(32)
        .refine((v) => {
            const digits = v.replace(/\D/g, '');
            return digits.length >= 9 && digits.length <= 15;
        }, 'Număr de telefon invalid.'),
    email: z.string().trim().toLowerCase().email('Email invalid.').max(255),
    password: z.string().min(8, 'Parola trebuie să aibă minim 8 caractere.').max(200)
});

export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email('Email invalid.').max(255),
    password: z.string().min(1).max(200)
});

export const estimateSchema = z.object({
    pickup: locationSchema,
    dropoff: locationSchema
});

export const createOrderSchema = z.object({
    pickup: locationSchema,
    dropoff: locationSchema,
    vehicle: z.enum(Object.keys(VEHICLES)),
    schedule: z.union([
        z.object({ type: z.literal('asap') }),
        z.object({
            type: z.literal('scheduled'),
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            slot: z.string().regex(/^\d{2}:\d{2}$/),
            label: z.string().trim().max(120).optional()
        })
    ]),
    itemsDescription: z.string().trim().min(2, 'Descrie ce mutăm.').max(2000),
    photosCount: z.number().int().min(0).max(5).default(0)
});

export const statusSchema = z.object({
    status: z.enum(['pending_payment', 'paid', 'en_route', 'completed', 'cancelled'])
});

/** Rulează validarea și răspunde cu 400 dacă datele nu sunt bune. */
export function parseBody(schema, req, res) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        const first = result.error.issues[0];
        res.status(400).json({ error: first?.message || 'Date invalide.', field: first?.path?.join('.') });
        return null;
    }
    return result.data;
}
