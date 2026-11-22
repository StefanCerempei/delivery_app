import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout from './LegalLayout';
import { COMPANY, LICENSE_LINE } from '../data/company';

const tel = `tel:+1${COMPANY.phone.replace(/\D/g, '')}`;

/** /about — firma, licențele și serviciile (același conținut e randat și pe server pentru agenți). */
export const AboutPage = () => (
    <LegalLayout title="About RELOQ Moving Services" showDate={false}>
        <p className="legal-lead">
            {COMPANY.legalName} is a moving and delivery company based in Ashland, Massachusetts. Customers book a crew online, pay
            transport upfront and pay labor for the actual time worked after the job.
        </p>
        <h2>Service area</h2>
        <p>{COMPANY.serviceArea}.</p>
        <h2>Licenses</h2>
        <p>{LICENSE_LINE}</p>
        <h2>Services</h2>
        <ul>
            <li>Courier — 1 mover + standard vehicle, for boxes, luggage and small items</li>
            <li>Van – Solo and Van – Team — 1 or 2 movers with a cargo van</li>
            <li>Moving Truck and Large Moving Truck — 2 or 3 movers with a 12–26 ft truck</li>
        </ul>
        <h2>Contact</h2>
        <p>
            {COMPANY.address} · <a href={tel}>{COMPANY.phone}</a> · <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> ·{' '}
            <a href={COMPANY.instagram} target="_blank" rel="noopener noreferrer">
                Instagram {COMPANY.instagramHandle}
            </a>
        </p>
        <p>
            <Link to="/">Book a move →</Link>
        </p>
    </LegalLayout>
);

/** /contact — telefon, email, adresă. */
export const ContactPage = () => (
    <LegalLayout title="Contact RELOQ Moving Services" showDate={false}>
        <p className="legal-lead">Questions about a booking, a quote or a change? Call or email us with your order number.</p>
        <h2>Phone</h2>
        <p>
            <a href={tel}>{COMPANY.phone}</a>
        </p>
        <h2>Email</h2>
        <p>
            <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
        </p>
        <h2>Instagram</h2>
        <p>
            <a href={COMPANY.instagram} target="_blank" rel="noopener noreferrer">
                {COMPANY.instagramHandle}
            </a>
        </p>
        <h2>Address</h2>
        <p>
            {COMPANY.legalName}
            <br />
            {COMPANY.address}
        </p>
        <h2>Service area</h2>
        <p>{COMPANY.serviceArea}.</p>
        <p>
            <Link to="/">Book a move →</Link>
        </p>
    </LegalLayout>
);
