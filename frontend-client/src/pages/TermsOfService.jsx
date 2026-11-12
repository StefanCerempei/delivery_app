import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout, { CompanyName, Field } from './LegalLayout';
import { COMPANY, LICENSE_LINE } from '../data/company';

const SECTIONS = [
    ['agreement', 'Agreement to these terms'],
    ['service', 'Our service'],
    ['eligibility', 'Eligibility and accounts'],
    ['bookings', 'Bookings'],
    ['pricing', 'Pricing and payment'],
    ['cancellations', 'Changes and cancellations'],
    ['your-responsibilities', 'Your responsibilities'],
    ['prohibited-items', 'Items we cannot move'],
    ['damage', 'Liability for your belongings and claims'],
    ['liability', 'Limitation of liability'],
    ['indemnity', 'Indemnity'],
    ['acceptable-use', 'Acceptable use of the website'],
    ['ip', 'Intellectual property'],
    ['termination', 'Suspension and termination'],
    ['law', 'Governing law and disputes'],
    ['changes', 'Changes to these terms'],
    ['contact', 'Contact us']
];

const TermsOfService = () => (
    <LegalLayout title="Terms of Service" sections={SECTIONS}>
        <p className="legal-lead">
            These terms explain how booking a move with {COMPANY.brand} works: what we do, what we need from you, how
            pricing and cancellations work, and what happens if something goes wrong. Please read them before you book.
        </p>

        <section id="agreement">
            <h2>1. Agreement to these terms</h2>
            <p>
                These Terms of Service (“Terms”) are an agreement between you and <CompanyName /> (“Reloq”, “we”, “us”).
                By creating an account or making a booking on {COMPANY.website}, you agree to these Terms and to our{' '}
                <Link to="/privacy">Privacy Policy</Link>. If you do not agree, please do not use the service.
            </p>
        </section>

        <section id="service">
            <h2>2. Our service</h2>
            <p>
                Reloq provides on-demand moving and delivery services: picking up items at one address, transporting
                them and delivering them to another, with loading and unloading by our own crews. We are a licensed,
                bonded and insured mover ({LICENSE_LINE}) and currently operate in{' '}
                <Field value={COMPANY.serviceArea} label="Service area" />. Vehicle types, crew sizes and the items each
                vehicle is suited for are described when you book.
            </p>
        </section>

        <section id="eligibility">
            <h2>3. Eligibility and accounts</h2>
            <ul>
                <li>
                    You must be at least 18 years old and able to enter into a binding contract. We ask for your date
                    of birth when you create an account to confirm this.
                </li>
                <li>
                    The information you give us (name, phone, email, addresses) must be accurate and kept up to date, so
                    our crew can reach you.
                </li>
                <li>
                    You are responsible for keeping your password confidential and for activity under your account.
                    Tell us immediately at <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> if you
                    suspect unauthorized use.
                </li>
            </ul>
        </section>

        <section id="bookings">
            <h2>4. Bookings</h2>
            <p>
                A booking is confirmed when you receive a booking confirmation with an order number. Bookings are
                scheduled in advance, from the next day onward, for the one-hour arrival window you select. Same-day
                bookings are not available through the app; please call us for urgent requests. We may decline or cancel a booking if no suitable crew or
                vehicle is available, if the addresses are outside our service area, or if the job does not match what
                was described. In that case we will refund any amount you paid for that booking.
            </p>
        </section>

        <section id="pricing">
            <h2>5. Pricing and payment</h2>
            <ul>
                <li>
                    The price shown at booking is calculated from the vehicle you choose, the route distance and the
                    estimated driving time, and is the price for the items you described.
                </li>
                <li>
                    If the job differs materially from your booking (for example significantly more or larger items,
                    extra stops, long carries, stairs without elevator access that were not mentioned, or waiting time
                    caused by you), the crew will explain the additional charge before continuing. You may accept it or
                    cancel the remaining work, subject to section 6.
                </li>
                <li>
                    Where online payment is offered, you pay by card through Stripe when you book. Otherwise, payment is
                    due when the job is completed. Prices are shown in US dollars and include applicable taxes unless
                    stated otherwise.
                </li>
                <li>Tips for the crew are optional.</li>
            </ul>
        </section>

        <section id="cancellations">
            <h2>6. Changes and cancellations</h2>
            <ul>
                <li>
                    You can cancel a scheduled booking free of charge up to {COMPANY.freeCancellationHours} hours before
                    the start of your arrival window.
                </li>
                <li>
                    Cancellations made later than that, or after a crew has been dispatched, may be charged{' '}
                    {COMPANY.lateCancellationFeePercent}% of the booking price to cover the crew’s time.
                </li>
                <li>
                    If the crew arrives and cannot start because you or your items are not available, or access is not
                    possible, the booking may be treated as a late cancellation.
                </li>
                <li>
                    To change or cancel a booking, contact us at{' '}
                    <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> with your order number.
                </li>
            </ul>
        </section>

        <section id="your-responsibilities">
            <h2>7. Your responsibilities</h2>
            <ul>
                <li>Describe your items accurately, including anything unusually heavy, large or fragile.</li>
                <li>
                    Make sure you, or someone you authorize, are present at pickup and drop-off, and that parking,
                    elevators and building permissions are arranged where needed.
                </li>
                <li>
                    Pack and prepare your items: boxes closed, drawers emptied or secured, appliances disconnected and
                    drained, and furniture that must be disassembled pointed out in advance.
                </li>
                <li>You must have the right to move the items you book us to move.</li>
            </ul>
        </section>

        <section id="prohibited-items">
            <h2>8. Items we cannot move</h2>
            <p>Our crews will not transport:</p>
            <ul>
                <li>hazardous materials, such as fuel, gas cylinders, explosives, chemicals or flammable items;</li>
                <li>weapons, ammunition, illegal goods or anything you are not legally allowed to possess;</li>
                <li>live animals or plants that require special handling;</li>
                <li>
                    cash, jewelry, important documents, and other items of exceptional value: please keep these with
                    you;
                </li>
                <li>perishable food that requires refrigeration during transport.</li>
            </ul>
            <p>The crew may refuse any item they reasonably believe is unsafe to move.</p>
        </section>

        <section id="damage">
            <h2>9. Liability for your belongings and claims</h2>
            <p>
                Our liability for loss of or damage to your belongings depends on the valuation coverage that applies
                to your move:
            </p>
            <ul>
                <li>
                    <strong>Moves within Massachusetts</strong> are covered under the valuation options in our tariff
                    on file with the Massachusetts Department of Public Utilities, which we will provide on request.
                </li>
                <li>
                    <strong>Moves between states</strong> are covered under federal rules. Unless you waive it in writing,
                    your move is carried with <strong>Full Value Protection</strong>, under which we repair, replace or
                    pay the current market value of lost or damaged items. You may instead choose{' '}
                    <strong>Released Value</strong> at no extra charge, which limits our liability to 60 cents per pound
                    per article. Items worth more than $100 per pound must be declared in writing before the move.
                </li>
            </ul>
            <p>
                Please check your items at delivery and note any visible damage to the crew before they leave. Then
                send a written claim to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> with your
                order number, a description and photos. For interstate moves, written claims must be filed within 9
                months of delivery. We will acknowledge and resolve claims within the time limits set by law.
            </p>
            <p>
                We are not responsible for loss or damage caused by items you packed yourself (unless the damage results
                from our handling), by the internal workings of appliances or electronics, for items listed in section
                8, or for damage that existed before the move.
            </p>
            <p>
                Before an interstate move, please read the FMCSA publications{' '}
                <a href={COMPANY.fmcsaRightsAndResponsibilities} target="_blank" rel="noopener noreferrer">
                    Your Rights and Responsibilities When You Move
                </a>{' '}
                and{' '}
                <a href={COMPANY.fmcsaReadyToMove} target="_blank" rel="noopener noreferrer">
                    Ready to Move?
                </a>
                .
            </p>
        </section>

        <section id="liability">
            <h2>10. Limitation of liability</h2>
            <p>
                Except for our liability for your belongings described in section 9, and to the extent permitted by law,
                we are not liable for indirect or consequential losses, such as lost profits or missed appointments, and
                our total liability for any other claim relating to a booking is limited to the amount you paid for that
                booking. Nothing in these Terms limits liability that cannot be limited by law, including liability for
                death or personal injury caused by negligence, for fraud, or your rights as a consumer.
            </p>
        </section>

        <section id="indemnity">
            <h2>11. Indemnity</h2>
            <p>
                You agree to compensate us for losses and reasonable costs we incur because you broke these Terms, for
                example by booking us to move items you did not have the right to move or prohibited items you did not
                disclose.
            </p>
        </section>

        <section id="acceptable-use">
            <h2>12. Acceptable use of the website</h2>
            <p>
                Do not misuse the website: no false bookings, no attempts to access other customers’ data or our
                systems without authorization, no interference with the service, and no automated scraping or abuse.
            </p>
        </section>

        <section id="ip">
            <h2>13. Intellectual property</h2>
            <p>
                The Reloq name, logo, website and its content belong to us or our licensors. You may use the website
                only to book and manage your moves. Map data © OpenStreetMap contributors.
            </p>
        </section>

        <section id="termination">
            <h2>14. Suspension and termination</h2>
            <p>
                You can stop using the service and ask us to close your account at any time. We may suspend or close
                accounts that break these Terms, are used fraudulently, or behave abusively toward our crews.
            </p>
        </section>

        <section id="law">
            <h2>15. Governing law and disputes</h2>
            <p>
                These Terms are governed by the laws of <Field value={COMPANY.governingLaw} label="Governing law" />.
                Please contact us first so we can try to resolve any issue informally. If you are a consumer, you also
                keep any mandatory protections and rights to bring proceedings provided by the law of the place where
                you live.
            </p>
        </section>

        <section id="changes">
            <h2>16. Changes to these terms</h2>
            <p>
                We may update these Terms from time to time. The version in effect when you make a booking applies to
                that booking. We will post changes on this page with a new effective date.
            </p>
        </section>

        <section id="contact">
            <h2>17. Contact us</h2>
            <p>
                <CompanyName />
                <br />
                <Field value={COMPANY.address} label="Registered address" />
                <br />
                Phone: <a href={`tel:${COMPANY.phone.replace(/\D/g, '')}`}>{COMPANY.phone}</a>
                <br />
                <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
            </p>
        </section>
    </LegalLayout>
);

export default TermsOfService;
