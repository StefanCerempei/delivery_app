import { z } from 'zod';
import { VEHICLES } from './pricing.js';
import { parseDateOnly, ageOn } from './time.js';

export const MIN_AGE = 18;
// Ferestre de sosire de 2 ore (ora de start). Echipa anunță clientul cu ~45 min înainte de sosire.
export const ALLOWED_SLOTS = ['07:00', '09:00', '11:00', '13:00', '15:00'];

export const locationSchema = z.object({
    address: z.string().trim().min(3).max(500),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180)
});

const fullNameField = z.string().trim().min(2, 'Please enter your full name.').max(120);
/**
 * Doar numere din SUA (NANP): 10 cifre, opțional cu prefixul 1 / +1.
 * Prefixul zonal și centrala nu pot începe cu 0 sau 1, iar prefixul zonal nu poate fi N11 (211, 311, 911…).
 * Întoarce numărul în forma (XXX) XXX-XXXX sau null dacă nu e valid.
 */
export function normalizeUsPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
    if (digits[1] === '1' && digits[2] === '1') return null;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const phoneField = z
    .string()
    .trim()
    .max(32)
    .refine((v) => normalizeUsPhone(v) !== null, 'Please enter a valid US mobile number, e.g. (508) 555-0192.')
    .transform((v) => normalizeUsPhone(v));
const emailField = z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email address.')).pipe(z.string().max(255));
const newPasswordField = z.string().min(8, 'Password must be at least 8 characters.').max(200);

export const registerSchema = z.object({
    fullName: fullNameField,
    phone: phoneField,
    ageConfirmed: z.literal(true, { error: `You must confirm you are at least ${MIN_AGE} years old to book with RELOQ.` }),
    email: z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email address.')).pipe(z.string().max(255)),
    password: z.string().min(8, 'Password must be at least 8 characters.').max(200)
});

export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email('Please enter a valid email address.')).pipe(z.string().max(255)),
    password: z.string().min(1).max(200)
});

export const profileSchema = z.object({
    fullName: fullNameField,
    phone: phoneField
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Please enter your current password.').max(200),
    newPassword: newPasswordField
});

export const deleteAccountSchema = z.object({
    password: z.string().min(1, 'Please enter your password to confirm.').max(200)
});

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, { error: 'This reset link is invalid.' }),
    password: newPasswordField
});

export const verifyCodeSchema = z.object({
    code: z.string().trim().regex(/^\d{6}$/, { error: 'Enter the 6-digit code from your email.' })
});

export const estimateSchema = z.object({
    pickup: locationSchema,
    dropoff: locationSchema
});

// Tipul locației / etajul (cum se spune în SUA: „2nd floor”). Opțiunile din formular:
// casă / townhome, storage, parter, etajul 2–10+. Valoarea veche „basement” rămâne validă pentru comenzile existente.
export const FLOORS = ['house', 'storage', 'ground', '2', '3', '4', '5', 'basement', '6', '7', '8', '9', '10+'];
/** Fără întrebarea de acces (lift / scări): casă, storage, parter. */
export const NO_ACCESS_FLOORS = ['house', 'storage', 'ground'];

/** Detalii despre locație: apartament / unitate, etaj, lift, note de acces. */
export const locationDetailsSchema = z
    .object({
        unit: z.string().trim().max(40).optional().default(''),
        floor: z.enum(FLOORS, { error: 'Please choose the floor.' }),
        // obligatoriu când nu e parter / casă
        elevator: z.enum(['yes', 'no']).nullable().optional().default(null),
        notes: z.string().trim().max(300).optional().default('')
    })
    .refine((d) => NO_ACCESS_FLOORS.includes(d.floor) || d.elevator, { error: 'Please choose the access type (elevator or stairs).', path: ['elevator'] })
    .transform((d) => ({ ...d, elevator: NO_ACCESS_FLOORS.includes(d.floor) ? null : d.elevator }));

export const createOrderSchema = z.object({
    pickup: locationSchema,
    dropoff: locationSchema,
    // Opționale pentru compatibilitate cu paginile deja deschise înainte de actualizare
    pickupDetails: locationDetailsSchema.optional(),
    dropoffDetails: locationDetailsSchema.optional(),
    vehicle: z.enum(Object.keys(VEHICLES)),
    // Doar rezervări programate (opțiunea „Now / ASAP” a fost scoasă)
    schedule: z.object(
        {
            type: z.literal('scheduled', { error: 'Please pick a date and arrival window.' }),
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            slot: z.enum(ALLOWED_SLOTS, { error: 'Please pick a valid arrival window.' }),
            label: z.string().trim().max(120).optional()
        },
        { error: 'Please pick a date and arrival window.' }
    ),
    itemsDescription: z.string().trim().min(2, 'Please describe what we are moving.').max(2000),
    photosCount: z.number().int().min(0).max(5).default(0),
    discountCode: z.string().trim().max(40).optional(),
    // Specificația 11.2: clientul acceptă termenii și plata manoperei după job, la fiecare rezervare
    acceptTerms: z.literal(true, { error: 'Please accept the booking terms to continue.' })
});

/** Cod de discount creat de dispecer: litere, cifre, - și _; procent 1–100. */
export const discountCodeSchema = z.object({
    code: z
        .string()
        .trim()
        .transform((s) => s.toUpperCase().replace(/\s+/g, ''))
        .pipe(z.string().regex(/^[A-Z0-9_-]{3,40}$/, 'Use 3–40 letters, digits, - or _.')),
    percent: z.coerce.number().int().min(1, 'Percent must be 1–100.').max(100, 'Percent must be 1–100.').default(10),
    note: z.string().trim().max(200).optional().default('')
});

/** Editarea unei comenzi din dispecerat: doar câmpurile trimise se schimbă. */
export const adminOrderUpdateSchema = z.object({
    pickup: locationSchema.optional(),
    dropoff: locationSchema.optional(),
    pickupDetails: locationDetailsSchema.nullable().optional(),
    dropoffDetails: locationDetailsSchema.nullable().optional(),
    schedule: z
        .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Pick a valid date.' }),
            slot: z.enum(ALLOWED_SLOTS, { error: 'Pick a valid arrival window.' })
        })
        .optional(),
    vehicle: z.enum(Object.keys(VEHICLES)).optional(),
    itemsDescription: z.string().trim().min(2, 'Please describe the items.').max(2000).optional(),
    // anunță clientul și șoferul alocat despre modificări
    notify: z.boolean().optional().default(true),
    // motivul modificării (jurnalul comenzii)
    reason: z.string().trim().max(300).optional()
});

export const statusSchema = z.object({
    status: z.enum(['pending_payment', 'confirmed', 'paid', 'en_route', 'completed', 'cancelled']),
    // Opțional: șoferul ales odată cu confirmarea (null = fără șofer)
    driverId: z.number().int().positive().nullable().optional()
});

/** Șofer / angajat (dispecerat). Telefonul e liber (pot fi și numere din afara SUA). */
export const driverSchema = z.object({
    fullName: z.string().trim().min(2, 'Please enter the driver’s full name.').max(120),
    email: emailField,
    phone: z.string().trim().max(32).optional().nullable().transform((v) => v || null),
    notes: z.string().trim().max(500).optional().nullable().transform((v) => v || null),
    active: z.boolean().optional(),
    // Parola de acces în panoul șoferului, setată de dispecer (gol = neschimbată)
    password: z
        .string()
        .max(100)
        .optional()
        .nullable()
        .transform((v) => (v ? v : undefined))
        .refine((v) => v === undefined || v.length >= 8, { error: 'The driver password must have at least 8 characters.' })
});

export const assignDriverSchema = z.object({
    driverId: z.number().int().positive().nullable(),
    // Retrimite emailul chiar dacă e același șofer
    resend: z.boolean().optional()
});

/** Rulează validarea și răspunde cu 400 dacă datele nu sunt bune. */
export function parseBody(schema, req, res) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        const first = result.error.issues[0];
        res.status(400).json({ error: first?.message || 'Invalid data.', field: first?.path?.join('.') });
        return null;
    }
    return result.data;
}
