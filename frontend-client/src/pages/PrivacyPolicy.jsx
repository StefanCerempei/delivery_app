import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout, { CompanyName, Field } from './LegalLayout';
import { COMPANY } from '../data/company';

const SECTIONS = [
    ['who-we-are', 'Who we are'],
    ['data-we-collect', 'Information we collect'],
    ['how-we-use', 'How we use your information'],
    ['legal-bases', 'Legal bases (EEA & UK users)'],
    ['sharing', 'Who we share it with'],
    ['cookies', 'Cookies and local storage'],
    ['retention', 'How long we keep it'],
    ['security', 'Security'],
    ['your-rights', 'Your rights'],
    ['transfers', 'International transfers'],
    ['children', 'Children'],
    ['changes', 'Changes to this policy'],
    ['contact', 'Contact us']
];

const PrivacyPolicy = () => (
    <LegalLayout title="Privacy Policy" sections={SECTIONS}>
        <p className="legal-lead">
            This policy explains what personal information {COMPANY.brand} collects when you use our website and book a
            move, why we collect it, who we share it with and the choices you have. We only collect what we need to
            plan and complete your move.
        </p>

        <section id="who-we-are">
            <h2>1. Who we are</h2>
            <p>
                The service at {COMPANY.website} is operated by <CompanyName />
                {COMPANY.registrationNumber ? ` (registration no. ${COMPANY.registrationNumber})` : ''}, located at{' '}
                <Field value={COMPANY.address} label="Registered address" /> (“Reloq”, “we”, “us”). We are the
                controller of the personal information described in this policy.
            </p>
        </section>

        <section id="data-we-collect">
            <h2>2. Information we collect</h2>
            <h3>Information you give us</h3>
            <ul>
                <li>
                    <strong>Account details:</strong> your full name, email address, mobile phone number and a password.
                    We never store your password itself, only a one-way encrypted hash of it. We also ask for your
                    date of birth to confirm you are at least 18; we use it only for that check and do not store it,
                    keeping only a record that the check was passed.
                </li>
                <li>
                    <strong>Booking details:</strong> pickup and drop-off addresses and their map coordinates, the
                    vehicle you choose, the date and time slot, and the description of the items to be moved.
                </li>
                <li>
                    <strong>Photos of your items:</strong> if you add photos, they are used in your browser to help you
                    describe the job. We currently record only how many photos you added; the image files are not
                    uploaded to our servers.
                </li>
                <li>
                    <strong>Messages:</strong> anything you send us by email or phone, for example about a booking or a
                    damage claim.
                </li>
            </ul>
            <h3>Payment information</h3>
            <p>
                Card payments are processed by Stripe. Your card number, expiry date and security code are entered
                directly into Stripe’s secure form and are never sent to or stored on Reloq’s servers. We receive and
                keep only the payment status, a payment reference and the last four digits of the card, so we can show
                you and our dispatchers which card was used.
            </p>
            <h3>Information collected automatically</h3>
            <ul>
                <li>
                    <strong>Technical data:</strong> IP address, browser type, device information and the date and time
                    of requests, recorded in our server and hosting logs for security and troubleshooting.
                </li>
                <li>
                    <strong>Session cookie:</strong> a cookie that keeps you signed in (see section 6).
                </li>
            </ul>
            <p>We do not use advertising trackers, and we do not sell or rent your personal information.</p>
        </section>

        <section id="how-we-use">
            <h2>3. How we use your information</h2>
            <ul>
                <li>To calculate route distance, duration and the price of your move.</li>
                <li>To create and manage your account and keep you signed in.</li>
                <li>
                    To schedule and carry out your booking, including sharing the job details with the crew assigned to
                    it.
                </li>
                <li>To contact you about your booking, for example by email or text message about your crew’s arrival.</li>
                <li>To take payment and keep records required for accounting and tax purposes.</li>
                <li>To handle questions, complaints and damage claims.</li>
                <li>To protect the service against fraud, abuse and security incidents.</li>
                <li>To comply with legal obligations and respond to lawful requests from authorities.</li>
            </ul>
        </section>

        <section id="legal-bases">
            <h2>4. Legal bases (EEA & UK users)</h2>
            <p>If data protection laws such as the GDPR apply to you, we rely on the following legal bases:</p>
            <ul>
                <li>
                    <strong>Performance of a contract:</strong> to provide your account, price and carry out your
                    booking, and take payment.
                </li>
                <li>
                    <strong>Legal obligation:</strong> to keep accounting and tax records and answer lawful requests.
                </li>
                <li>
                    <strong>Legitimate interests:</strong> to secure and improve the service, prevent fraud and handle
                    claims. We balance these interests against your rights.
                </li>
                <li>
                    <strong>Consent:</strong> where we ask for it, for example for optional marketing. You can withdraw
                    consent at any time.
                </li>
            </ul>
        </section>

        <section id="sharing">
            <h2>5. Who we share it with</h2>
            <p>We share personal information only as needed to run the service:</p>
            <ul>
                <li>
                    <strong>Moving crews</strong> assigned to your booking receive your name, phone number, addresses,
                    time slot and item description.
                </li>
                <li>
                    <strong>Stripe</strong> (payment processing) receives your payment details and email address for
                    receipts.
                </li>
                <li>
                    <strong>Hostinger</strong> hosts our website, application and database.
                </li>
                <li>
                    <strong>OpenStreetMap services</strong>: the address text you type is sent to the Nominatim search
                    service to suggest matching addresses, and map tiles are loaded from OpenStreetMap servers.
                    Route distance and duration are calculated by sending pickup and drop-off coordinates to the OSRM
                    routing service.
                </li>
                <li>
                    <strong>Authorities and advisers</strong> where required by law, to enforce our{' '}
                    <Link to="/terms">Terms of Service</Link> or to protect the rights and safety of our customers,
                    crews or the public.
                </li>
                <li>
                    <strong>A buyer or successor</strong> if our business is sold or reorganized, under the same
                    protections described here.
                </li>
            </ul>
        </section>

        <section id="cookies">
            <h2>6. Cookies and local storage</h2>
            <p>
                We use one strictly necessary cookie, <code>reloq_session</code>, which keeps you signed in for up to 7
                days. It is marked HttpOnly and Secure, so it cannot be read by scripts on the page and is only sent
                over encrypted connections. Because it is essential for the service to work, it does not require
                consent. We do not use analytics or advertising cookies. If we add any in the future, we will ask for
                your consent first where the law requires it.
            </p>
        </section>

        <section id="retention">
            <h2>7. How long we keep it</h2>
            <ul>
                <li>Account information is kept while your account is active.</li>
                <li>
                    Booking and payment records are kept for as long as needed for accounting, tax and legal purposes,
                    usually up to the period required by applicable law, and are then deleted or anonymized.
                </li>
                <li>Server logs are kept for a limited period for security and troubleshooting.</li>
            </ul>
            <p>
                You can ask us to close your account and delete your information at any time (see section 9). We may
                keep some records where the law requires us to.
            </p>
        </section>

        <section id="security">
            <h2>8. Security</h2>
            <p>
                We protect your information with encrypted connections (HTTPS), hashed passwords, secure session cookies,
                access controls that limit booking data to you and authorized dispatchers, and limits on repeated login
                attempts. No system is completely secure, so please use a strong, unique password and tell us right away
                if you think your account has been compromised.
            </p>
        </section>

        <section id="your-rights">
            <h2>9. Your rights</h2>
            <p>Depending on where you live, you may have the right to:</p>
            <ul>
                <li>access the personal information we hold about you and receive a copy;</li>
                <li>correct inaccurate information;</li>
                <li>ask us to delete your information;</li>
                <li>object to or restrict certain processing;</li>
                <li>receive your information in a portable format;</li>
                <li>withdraw consent where processing is based on consent.</li>
            </ul>
            <p>
                Residents of California and other US states with privacy laws may also have the right to know what
                information we collect and to request its deletion. We do not sell or share personal information for
                cross-context behavioral advertising, and we will not treat you differently for exercising your rights.
            </p>
            <p>
                To make a request, email <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>. We may
                need to verify your identity first. If you are in the EEA or UK, you can also complain to your local
                data protection authority.
            </p>
        </section>

        <section id="transfers">
            <h2>10. International transfers</h2>
            <p>
                Some of our service providers process information in other countries. Where we transfer personal
                information from the EEA or UK, we rely on appropriate safeguards such as the European Commission’s
                Standard Contractual Clauses or an adequacy decision.
            </p>
        </section>

        <section id="children">
            <h2>11. Children</h2>
            <p>
                Our service is intended for adults. You must be at least 18 years old to create an account or book a
                move, and we do not knowingly collect information from children.
            </p>
        </section>

        <section id="changes">
            <h2>12. Changes to this policy</h2>
            <p>
                We may update this policy from time to time. We will post the new version on this page with a new
                effective date and, for significant changes, notify you by email or in the app.
            </p>
        </section>

        <section id="contact">
            <h2>13. Contact us</h2>
            <p>
                <CompanyName />
                <br />
                <Field value={COMPANY.address} label="Registered address" />
                <br />
                Phone: <a href={`tel:${COMPANY.phone.replace(/\D/g, '')}`}>{COMPANY.phone}</a>
                <br />
                Privacy questions: <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>
                <br />
                General support: <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
            </p>
        </section>
    </LegalLayout>
);

export default PrivacyPolicy;
