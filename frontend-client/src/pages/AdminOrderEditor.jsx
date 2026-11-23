import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import AddressInput from '../components/AddressInput';
import LocationDetails, { detailsComplete, EMPTY_DETAILS } from '../components/LocationDetails';
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

// scheduled_for e ora firmei salvată fără fus: o citim cu getUTC*
const dateOf = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const slotOf = (iso) => (iso ? new Date(iso).toISOString().slice(11, 16) : '09:00');
const toLoc = (l) => ({ address: l.address, lat: Number(l.lat), lng: Number(l.lng) });

/**
 * Editarea comenzii din dispecerat: adrese (+ etaj / lift / acces), data și ora, vehiculul, obiectele.
 * Prețul se recalculează doar la comenzile neplătite online; la cele plătite arătăm estimarea nouă.
 */
const AdminOrderEditor = ({ order, onSaved, onCancel }) => {
    const [pickup, setPickup] = useState(order.pickup);
    const [dropoff, setDropoff] = useState(order.dropoff);
    const [pickupDetails, setPickupDetails] = useState(order.pickup?.details || EMPTY_DETAILS);
    const [dropoffDetails, setDropoffDetails] = useState(order.dropoff?.details || EMPTY_DETAILS);
    const [date, setDate] = useState(dateOf(order.schedule?.scheduledFor));
    const [slot, setSlot] = useState(slotOf(order.schedule?.scheduledFor));
    const [vehicle, setVehicle] = useState(order.vehicle?.id);
    const [items, setItems] = useState(order.itemsDescription || '');
    const [notify, setNotify] = useState(true);
    const [estimate, setEstimate] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const routeChanged =
        pickup?.lat !== order.pickup?.lat || pickup?.lng !== order.pickup?.lng || dropoff?.lat !== order.dropoff?.lat || dropoff?.lng !== order.dropoff?.lng;
    const priceRelevant = routeChanged || vehicle !== order.vehicle?.id;
    const outside = [pickup, dropoff].some((l) => l?.lat && !inServiceArea(l.lat, l.lng));

    // Estimarea nouă (aceeași formulă ca la rezervare) când se schimbă adresele sau vehiculul
    useEffect(() => {
        if (!priceRelevant || !pickup?.lat || !dropoff?.lat) {
            setEstimate(null);
            return undefined;
        }
        let cancelled = false;
        api.estimate(toLoc(pickup), toLoc(dropoff))
            .then((res) => !cancelled && setEstimate(res.estimates?.[vehicle]?.total ?? null))
            .catch(() => !cancelled && setEstimate(null));
        return () => {
            cancelled = true;
        };
    }, [priceRelevant, pickup, dropoff, vehicle]);

    const paidOnline = order.paidOnline;
    const valid = pickup?.lat && dropoff?.lat && date && slot && items.trim().length >= 2;
    const detailsOk = (d) => !d?.floor || detailsComplete(d);
    const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

    const save = async () => {
        setError('');
        if (!detailsOk(pickupDetails) || !detailsOk(dropoffDetails)) return setError('Tell us whether there is an elevator for each floor above ground.');
        setSaving(true);
        try {
            const clean = (d) => (d?.floor ? { unit: d.unit || '', floor: d.floor, elevator: d.floor === 'ground' ? null : d.elevator, notes: d.notes || '' } : null);
            const res = await api.adminUpdateOrder(order.id, {
                pickup: toLoc(pickup),
                dropoff: toLoc(dropoff),
                pickupDetails: clean(pickupDetails),
                dropoffDetails: clean(dropoffDetails),
                schedule: { date, slot },
                vehicle,
                itemsDescription: items.trim(),
                notify
            });
            onSaved(res);
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    return (
        <div className="admin-card order-edit">
            <h3>Edit order</h3>

            <div className="order-edit-grid">
                {[
                    ['pickup', 'Pickup', pickup, setPickup, pickupDetails, setPickupDetails],
                    ['dropoff', 'Drop-off', dropoff, setDropoff, dropoffDetails, setDropoffDetails]
                ].map(([key, label, loc, setLoc, details, setDetails]) => (
                    <div key={key} className="order-edit-stop">
                        <span className="crm-field-label">{label} address</span>
                        <div className="order-edit-address">
                            <AddressInput
                                name={`edit-${key}`}
                                label={`${label} address`}
                                placeholder={`${label} address…`}
                                value={loc}
                                onSelect={(l) => l && setLoc({ ...l })}
                            />
                        </div>
                        {loc?.lat && !inServiceArea(loc.lat, loc.lng) && (
                            <p className="form-inline-error">Outside the service area (Massachusetts, from Worcester east).</p>
                        )}
                        <LocationDetails prefix={`edit-${key}`} value={details} onChange={setDetails} />
                    </div>
                ))}
            </div>

            <div className="order-edit-row">
                <label className="crm-field">
                    <span>Date</span>
                    <input type="date" name="editDate" className="crm-select" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="crm-field">
                    <span>Arrival window</span>
                    <select className="crm-select" name="editSlot" value={slot} onChange={(e) => setSlot(e.target.value)}>
                        {SLOTS.map(([id, label]) => (
                            <option key={id} value={id}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="crm-field">
                    <span>Vehicle</span>
                    <select className="crm-select" name="editVehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                        {VEHICLES.map((v) => (
                            <option key={v.id} value={v.id}>
                                {v.name} — {v.crewLabel}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <label className="crm-field">
                <span>Items</span>
                <textarea className="crm-textarea" name="editItems" rows={3} maxLength={2000} value={items} onChange={(e) => setItems(e.target.value)} />
            </label>

            {priceRelevant && (
                <p className="order-edit-price">
                    {estimate == null
                        ? 'Calculating the new price…'
                        : paidOnline
                          ? `New price for these details: ${formatMoney(estimate)} (customer paid ${formatMoney(order.totalAmount)}). The paid amount stays as is — settle any difference manually.`
                          : `New price: ${formatMoney(estimate)} (was ${formatMoney(order.totalAmount)}) — it will be updated on save.`}
                    {' '}The labor rate follows the vehicle’s crew size.
                </p>
            )}
            {outside && <p className="order-edit-price warn">One of the addresses is outside the service area. You can still save it.</p>}

            <label className="schedule-check order-edit-notify">
                <input type="checkbox" name="notify" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                Email the customer {order.driver?.notifiedAt ? 'and the driver ' : ''}about the changes
            </label>

            {error && <p className="form-inline-error">{error}</p>}
            <div className="record-actions-row">
                <button className="crm-primary-btn" disabled={!valid || saving} onClick={save}>
                    {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button className="crm-ghost-btn" disabled={saving} onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default AdminOrderEditor;
