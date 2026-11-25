import Stripe from 'stripe';
import { config } from './config.js';

/** Clientul Stripe, sau null dacă STRIPE_SECRET_KEY nu e setată. */
export const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

/**
 * Clientul Stripe (Customer) al utilizatorului, creat o singură dată și salvat în users.stripe_customer_id,
 * ca plățile să apară în Stripe cu numele, emailul și telefonul clientului.
 * Cheia restricționată are nevoie de permisiunea „Customers: Write”; fără ea plata merge oricum, fără client atașat.
 */
export async function stripeCustomerId(userId) {
    if (!stripe || !userId) return null;
    try {
        const { pool } = await import('./db.js');
        const [[u]] = await pool.query('SELECT id, email, full_name, phone, stripe_customer_id FROM users WHERE id = ?', [userId]);
        if (!u) return null;
        if (u.stripe_customer_id) return u.stripe_customer_id;
        const customer = await stripe.customers.create({
            email: u.email,
            name: u.full_name || undefined,
            phone: u.phone || undefined,
            metadata: { reloq_user_id: String(u.id) }
        });
        await pool.query('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customer.id, u.id]);
        return customer.id;
    } catch (err) {
        console.warn(`[reloq] Stripe Customer nu a putut fi creat (verifică permisiunea Customers: Write): ${err.message}`);
        return null;
    }
}

/** Câmpurile client pentru un PaymentIntent (customer dacă există, plus metadata cu numele și emailul). */
export async function customerFields(userId, { name, email } = {}) {
    const customer = await stripeCustomerId(userId);
    return {
        ...(customer ? { customer } : {}),
        meta: { ...(name ? { customer_name: String(name).slice(0, 200) } : {}), ...(email ? { customer_email: String(email).slice(0, 200) } : {}) }
    };
}
