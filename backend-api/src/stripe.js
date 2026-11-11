import Stripe from 'stripe';
import { config } from './config.js';

/** Clientul Stripe, sau null dacă STRIPE_SECRET_KEY nu e setată. */
export const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;
