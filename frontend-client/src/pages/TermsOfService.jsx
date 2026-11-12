import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout, { CompanyName, Field } from './LegalLayout';
import { COMPANY } from '../data/company';

const SECTIONS = [
    ['agreement', 'Agreement to these terms'],
    ['service', 'Our service'],
    ['eligibility', 'Eligibility and accounts'],
    ['bookings', 'Bookings'],
    ['pricing', 'Pricing and payment'],
    ['cancellations', 'Changes and cancellations'],
    ['your-responsibilities', 'Your responsibilities'],
    ['prohibited-items', 'Items we cannot move'],
    ['damage', 'Damage, loss and claims'],
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
                them and delivering them to another, with loading and unloading by our crew. We currently operate in{' '}
                <Field value={COMPANY.serviceArea} label="Service area" />. Vehicle types, crew sizes and the items each
                vehicle is suited for are described when you book.
            </p>
        </section>

        <section id="eligibility">
            <h2>3. Eligibility and accounts</h2>
            <ul>
                <li>You must be at least 18 years old and able to enter into a binding contract.</li>
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
                A booking is confirmed when you receive a booking confirmation with an order number. “Now” bookings
                are dispatched to the nearest available crew; arrival times shown are estimates. Scheduled bookings
                are for the selected one-hour arrival window. We may decline or cancel a booking if no suitable crew or
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
            <h2>9. Damage, loss and claims</h2>
            <p>
                Our crews handle your belongings with care. If something is damaged or lost while in our care, please:
            </p>
            <ul>
                <li>note it to the crew before they leave, if possible;</li>
                <li>
                    report it to <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> within{' '}
                    {COMPANY.damageClaimHours} hours of delivery, with your order number, a description and photos.
                </li>
            </ul>
            <p>
                We will review every claim in good faith and, where we are responsible, repair the item, pay a fair
                amount toward its repair or replacement, or refund the booking. We are not responsible for damage
                caused by poor packing by you, for the internal workings of appliances or electronics, for items
                listed in section 8, or for pre-existing damage.
            </p>
        </section>

        <section id="liability">
            <h2>10. Limitation of liability</h2>
            <p>
                To the extent permitted by law, our total liability for any claim relating to a booking is limited to
                the greater of the amount you paid for that booking or the amount required by applicable law, and we
                are not liable for indirect or consequential losses, such as lost profits or missed appointments.
                Nothing in these Terms limits liability that cannot be limited by law, including liability for death or
                personal injury caused by negligence, for fraud, or your statutory rights as a consumer.
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
                <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
            </p>
        </section>
    </LegalLayout>
);

export default TermsOfService;
