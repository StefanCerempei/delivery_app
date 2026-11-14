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
    dateOfBirth: z
        .string({ error: 'Please enter your date of birth.' })
        .superRefine((value, ctx) => {
            const birth = parseDateOnly(value);
            const age = birth ? ageOn(birth) : null;
            if (age === null || age > 120) {
                ctx.addIssue({ code: 'custom', message: 'Please enter a valid date of birth.' });
            } else if (age < MIN_AGE) {
                ctx.addIssue({
                    code: 'custom',
                    message: `You must be at least ${MIN_AGE} years old to create a RELOQ account.`
                });
            }
        }),
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

export const createOrderSchema = z.object({
    pickup: locationSchema,
    dropoff: locationSchema,
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
        res.status(400).json({ error: first?.message || 'Invalid data.', field: first?.path?.join('.') });
        return null;
    }
    return result.data;
}
