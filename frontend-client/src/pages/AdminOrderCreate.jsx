import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import AddressInput from '../components/AddressInput';
import LocationDetails, { detailsComplete, needsAccess, EMPTY_DETAILS } from '../components/LocationDetails';
import { VEHICLES } from '../data/vehicles';
import { inServiceArea } from '../data/serviceArea';
import { formatMoney } from '../utils/formatters';

const SLOTS = [
    ['07:00', '7:00 AM – 9:00 AM'],
    ['09:00', '9:00 AM – 11:00 AM'],
    ['11:00', '11:00 AM – 1:00 PM'],
    ['13:00', '1:00 PM – 3:00 PM'],
    ['15:00', '3:00 PM – 5:00 PM']
];

const PAYMENTS = [
    ['link', 'Email a payment link', 'The customer pays the booking price online (card, Apple Pay, Google Pay). The order is confirmed when paid.'],
    ['paid', 'Already paid', 'Paid by cash, check or over the phone. The order is confirmed now.'],
    ['later', 'Collect later', 'The order is confirmed now; the booking price is collected before the move.']
];

const toLoc = (l) => ({ address: l.address, lat: Number(l.lat), lng: Number(l.lng) });
const clean = (d) => ({ unit: d.unit || '', floor: d.floor, elevator: needsAccess(d.floor) ? d.elevator : null, notes: d.notes || '' });

/** Zi de azi în fusul firmei (YYYY-MM-DD). */
const businessToday = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Comandă nouă din dispecerat (client la telefon). Prețul îl calculează serverul, ca pe site. */
const AdminOrderCreate = ({ onCreated, onCancel }) => {
    // Clientul
    const [mode, setMode] = useState('existing');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [customer, setCustomer] = useState(null);
    const [newCustomer, setNewCustomer] = useState({ fullName: '', email: '', phone: '' });

    // Mutarea
    const [pickup, setPickup] = useState(null);
    const [dropoff, setDropoff] = useState(null);
    const [pickupDetails, setPickupDetails] = useState(EMPTY_DETAILS);
    const [dropoffDetails, setDropoffDetails] = useState(EMPTY_DETAILS);
    const today = useMemo(businessToday, []);
    const [date, setDate] = useState('');
    const [slot, setSlot] = useState('09:00');
    const [vehicle, setVehicle] = useState('van_team');
    const [items, setItems] = useState('');
    const [estimates, setEstimates] = useState(null);
    const [estimateError, setEstimateError] = useState('');

    // Plata și restul
    const [payment, setPayment] = useState('link');
    const [discountCode, setDiscountCode] = useState('');
    const [notes, setNotes] = useState('');
    const [notify, setNotify] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (mode !== 'existing') return undefined;
        let alive = true;
        const t = setTimeout(() => {
            api.adminCustomers(query.trim())
                .then(({ customers }) => alive && setResults(customers))
                .catch(() => alive && setResults([]));
        }, 250);
        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [query, mode]);

    useEffect(() => {
        setEstimates(null);
        setEstimateError('');
        if (!pickup?.lat || !dropoff?.lat) return undefined;
        let alive = true;
        api.estimate(toLoc(pickup), toLoc(dropoff))
            .then((res) => alive && setEstimates(res.estimates || null))
            .catch((err) => alive && setEstimateError(err.message));
        return () => {
            alive = false;
        };
    }, [pickup, dropoff]);

    const outside = [pickup, dropoff].some((l) => l?.lat && !inServiceArea(l.lat, l.lng));
    const customerOk =
        mode === 'existing'
            ? Boolean(customer)
            : newCustomer.fullName.trim().length >= 2 && /\S+@\S+\.\S+/.test(newCustomer.email.trim());
    const valid =
        customerOk &&
        pickup?.lat &&
        dropoff?.lat &&
        !outside &&
        detailsComplete(pickupDetails) &&
        detailsComplete(dropoffDetails) &&
        date &&
        items.trim().length >= 2;

    const submit = async () => {
        setError('');
        setSaving(true);
        try {
            const res = await api.adminCreateOrder({
                ...(mode === 'existing'
                    ? { customerId: customer.id }
                    : {
                          newCustomer: {
                              fullName: newCustomer.fullName.trim(),
                              email: newCustomer.email.trim(),
                              phone: newCustomer.phone.trim()
                          }
                      }),
                pickup: toLoc(pickup),
                dropoff: toLoc(dropoff),
                pickupDetails: clean(pickupDetails),
                dropoffDetails: clean(dropoffDetails),
                vehicle,
                schedule: { date, slot },
                itemsDescription: items.trim(),
                payment,
                ...(discountCode.trim() ? { discountCode: discountCode.trim() } : {}),
                ...(notes.trim() ? { dispatchNotes: notes.trim() } : {}),
                notify
            });
            onCreated(res);
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    const price = estimates?.[vehicle];

    return (
        <div className="admin-card order-edit order-create">
            <h3>New order (phone booking)</h3>

            {/* 1. Clientul */}
            <section className="order-create-section">
                <div className="order-create-head">
                    <strong>1. Customer</strong>
                    <div className="seg-toggle">
                        <button type="button" className={mode === 'existing' ? 'on' : ''} onClick={() => setMode('existing')}>
                            Existing
                        </button>
                        <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>
                            New customer
                        </button>
                    </div>
                </div>
                {mode === 'existing' ? (
                    customer ? (
                        <div className="order-create-picked">
                            <span>
                                <strong>{customer.fullName}</strong> · {customer.email}
                                {customer.phone ? ` · ${customer.phone}` : ''}
                            </span>
                            <button type="button" className="crm-link-btn" onClick={() => setCustomer(null)}>
                                Change
                            </button>
                        </div>
                    ) : (
                        <>
                            <input
                                className="crm-select"
                                name="customerSearch"
                                placeholder="Search by name, email or phone…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                            <ul className="order-create-results">
                                {results.map((c) => (
                                    <li key={c.id}>
                                        <button type="button" onClick={() => setCustomer(c)}>
                                            <strong>{c.fullName}</strong>
                                            <span>
                                                {c.email}
                                                {c.phone ? ` · ${c.phone}` : ''}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                                {results.length === 0 && <li className="job-muted">No customers found — add a new one.</li>}
                            </ul>
                        </>
                    )
                ) : (
                    <div className="order-edit-row">
                        <label className="crm-field">
                            <span>Full name</span>
                            <input
                                className="crm-select"
                                name="newName"
                                value={newCustomer.fullName}
                                onChange={(e) => setNewCustomer({ ...newCustomer, fullName: e.target.value })}
                            />
                        </label>
                        <label className="crm-field">
                            <span>Email (for the confirmation{payment === 'link' ? ' and payment link' : ''})</span>
                            <input
                                className="crm-select"
                                type="email"
                                name="newEmail"
                                value={newCustomer.email}
                                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                            />
                        </label>
                        <label className="crm-field">
                            <span>Phone</span>
                            <input
                                className="crm-select"
                                type="tel"
                                name="newPhone"
                                placeholder="(508) 555-0192"
                                value={newCustomer.phone}
                                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                            />
                        </label>
                    </div>
                )}
            </section>

            {/* 2. Mutarea */}
            <section className="order-create-section">
                <strong>2. Move details</strong>
                <div className="order-edit-grid">
                    {[
                        ['pickup', 'Pickup', pickup, setPickup, pickupDetails, setPickupDetails],
                        ['dropoff', 'Drop-off', dropoff, setDropoff, dropoffDetails, setDropoffDetails]
                    ].map(([key, label, loc, setLoc, details, setDetails]) => (
                        <div key={key} className="order-edit-stop">
                            <span className="crm-field-label">{label} address</span>
                            <div className="order-edit-address">
                                <AddressInput
                                    name={`new-${key}`}
                                    label={`${label} address`}
                                    placeholder={`${label} address…`}
                                    value={loc}
                                    onSelect={(l) => setLoc(l ? { ...l } : null)}
                                />
                            </div>
                            {loc?.lat && !inServiceArea(loc.lat, loc.lng) && (
                                <p className="form-inline-error">Outside the service area (Massachusetts, from Worcester east).</p>
                            )}
                            <LocationDetails prefix={`new-${key}`} value={details} onChange={setDetails} />
                        </div>
                    ))}
                </div>

                <div className="order-edit-row">
                    <label className="crm-field">
                        <span>Date</span>
                        <input type="date" name="newDate" className="crm-select" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
                    </label>
                    <label className="crm-field">
                        <span>Arrival window</span>
                        <select className="crm-select" name="newSlot" value={slot} onChange={(e) => setSlot(e.target.value)}>
                            {SLOTS.map(([id, label]) => (
                                <option key={id} value={id}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="crm-field">
                        <span>Vehicle</span>
                        <select className="crm-select" name="newVehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                            {VEHICLES.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name} — {v.crewLabel}
                                    {estimates?.[v.id] ? ` — ${formatMoney(estimates[v.id].total)}` : ''}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <label className="crm-field">
                    <span>Items</span>
                    <textarea
                        className="crm-textarea"
                        name="newItems"
                        rows={3}
                        maxLength={2000}
                        placeholder="e.g. 3-seat sofa, queen bed, 10 medium boxes"
                        value={items}
                        onChange={(e) => setItems(e.target.value)}
                    />
                </label>

                {estimateError && <p className="form-inline-error">{estimateError}</p>}
                {price && (
                    <p className="order-edit-price">
                        Booking price: <strong>{formatMoney(price.total)}</strong>
                        {price.labor ? ` · labor after the job: ${price.labor.label}` : ''}
                        {discountCode.trim() ? ' · the discount code is applied when saving' : ''}
                    </p>
                )}
            </section>

            {/* 3. Plata */}
            <section className="order-create-section">
                <strong>3. Payment</strong>
                <div className="order-create-payments">
                    {PAYMENTS.map(([id, label, hint]) => (
                        <label key={id} className={`order-create-pay ${payment === id ? 'on' : ''}`}>
                            <input type="radio" name="payment" value={id} checked={payment === id} onChange={() => setPayment(id)} />
                            <span>
                                <strong>{label}</strong>
                                <small>{hint}</small>
                            </span>
                        </label>
                    ))}
                </div>
                <div className="order-edit-row">
                    <label className="crm-field">
                        <span>Discount code (optional)</span>
                        <input
                            className="crm-select"
                            name="newDiscount"
                            value={discountCode}
                            onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                        />
                    </label>
                </div>
                <label className="crm-field">
                    <span>Dispatch notes (optional, never shown to the customer)</span>
                    <textarea className="crm-textarea" name="newNotes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
                <label className="schedule-check order-edit-notify">
                    <input type="checkbox" name="notify" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                    {payment === 'link' ? 'Email the payment link to the customer' : 'Email the booking confirmation to the customer'}
                </label>
            </section>

            {error && <p className="form-inline-error">{error}</p>}
            <div className="record-actions-row">
                <button className="crm-primary-btn" disabled={!valid || saving} onClick={submit}>
                    {saving ? 'Creating…' : payment === 'link' ? 'Create order & send payment link' : 'Create order'}
                </button>
                <button className="crm-ghost-btn" disabled={saving} onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default AdminOrderCreate;
