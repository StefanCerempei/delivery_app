import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { formatMoney } from '../utils/formatters';
import { api, orderPhotoUrl } from '../api/client';
import PhotoGallery from '../components/PhotoGallery';
import AdminOrderEditor from './AdminOrderEditor';
import { PageLoader } from '../components/Spinner';
import { STATUS_LABELS } from './AdminDashboard';
import { describeDetails } from '../components/LocationDetails';
import './Admin.css';

const STATUS_ACTIONS = ['confirmed', 'en_route', 'completed', 'cancelled'];

const Row = ({ label, children }) => (
    <div className="record-row">
        <span className="record-label">{label}</span>
        <span className="record-value">{children}</span>
    </div>
);

// Șoferul primește emailul cu jobul doar când comanda e confirmată / pe drum.
const DRIVER_NOTIFY_STATUSES = ['confirmed', 'en_route'];

const fmtWhen = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Lista de șoferi activi (+ cel deja alocat, chiar dacă între timp a fost arhivat). */
const DriverSelect = ({ drivers, value, onChange, current, disabled }) => {
    const options = drivers.filter((d) => d.active || d.id === current?.id);
    return (
        <select className="crm-select" name="driverId" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
            <option value="">— No driver —</option>
            {options.map((d) => (
                <option key={d.id} value={d.id}>
                    {d.fullName}
                    {d.upcomingJobs ? ` · ${d.upcomingJobs} upcoming` : ''}
                    {d.active ? '' : ' (archived)'}
                </option>
            ))}
        </select>
    );
};

const LABOR_STATUS = {
    none: 'No labor time yet',
    pending_review: 'Waiting for your review',
    requested: 'Payment requested from the customer',
    paid: 'Paid online',
    paid_cash: 'Paid in cash',
    waived: 'Waived (no charge)'
};

const FIELD_LABELS = {
    status: 'Status',
    driver: 'Driver',
    labor_minutes: 'Labor time',
    labor: 'Labor billing',
    pickup_address: 'Pickup address',
    dropoff_address: 'Drop-off address',
    pickup_details: 'Pickup details',
    dropoff_details: 'Drop-off details',
    scheduled_for: 'Arrival window',
    schedule_label: 'Arrival window (label)',
    vehicle: 'Vehicle',
    items_description: 'Items',
    total_cents: 'Booking price (cents)',
    distance_miles: 'Distance (mi)'
};
// Câmpuri tehnice care se schimbă odată cu altele (nu le mai arătăm separat)
const HIDDEN_FIELDS = ['pickup_lat', 'pickup_lng', 'dropoff_lat', 'dropoff_lng', 'schedule_type', 'pricing_version', 'duration_mins', 'outbound_mins', 'return_mins', 'base_fare_cents', 'distance_cost_cents', 'time_cost_cents', 'labor_cents_per_min', 'discount_cents'];

/** Jurnalul modificărilor comenzii: ce, vechi → nou, cine, motiv, când. */
const OrderHistory = ({ order }) => {
    const [items, setItems] = useState(null);
    useEffect(() => {
        let alive = true;
        api.adminOrderHistory(order.id)
            .then(({ history }) => alive && setItems(history))
            .catch(() => alive && setItems([]));
        return () => {
            alive = false;
        };
    }, [order.id, order.updatedAt, order.status, order.laborBilling?.status, order.laborActual?.minutes, order.driver?.id]);

    const shown = (items || []).filter((h) => !HIDDEN_FIELDS.includes(h.field));
    return (
        <div className="admin-card">
            <h3>History</h3>
            {items === null ? (
                <p className="job-muted">Loading…</p>
            ) : shown.length === 0 ? (
                <p className="job-muted">No changes yet.</p>
            ) : (
                <ul className="order-history">
                    {shown.map((h, i) => (
                        <li key={i}>
                            <div className="order-history-head">
                                <strong>{FIELD_LABELS[h.field] || h.field}</strong>
                                <span>{fmtWhen(h.at)}{h.actor ? ` · ${h.actor}` : ''}</span>
                            </div>
                            <div className="order-history-change">
                                <span className="old">{h.oldValue ?? '—'}</span> → <span className="new">{h.newValue ?? '—'}</span>
                            </div>
                            {h.reason && <div className="order-history-reason">Reason: {h.reason}</div>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

/** Manopera: timpul măsurat, corectarea minutelor, aprobarea cererii de plată, cash / fără taxă. */
const LaborBilling = ({ order, onUpdated }) => {
    const b = order.laborBilling || { status: 'none' };
    const l = order.laborActual;
    const unpaid = ['none', 'pending_review', 'requested'].includes(b.status);
    const [minutes, setMinutes] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(null);
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');

    const call = async (action, extra = {}, done = '') => {
        setErr('');
        setMsg('');
        setBusy(action);
        try {
            const { order: updated } = await api.adminLabor(order.id, action, extra);
            onUpdated(updated);
            setMsg(done);
            setMinutes('');
            setReason('');
        } catch (e) {
            setErr(e.message);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="labor-billing">
            <Row label="Labor time">
                {l ? (
                    <>
                        {l.elapsedMinutes ?? l.minutes} min elapsed → <strong>{l.minutes} min billed</strong>
                        <small className="record-line-detail">Rounded up to the next 5 minutes</small>
                        {l.adjusted && <small className="record-line-detail">Corrected by dispatch (measured: {l.timedMinutes ?? '—'} min) — see History</small>}
                    </>
                ) : order.timeline?.arrivedAt && !order.timeline?.completedAt ? (
                    order.timeline?.pausedAt ? 'Timer paused…' : 'Timer running…'
                ) : (
                    '—'
                )}
            </Row>
            <div className="record-total">
                <span>Labor</span>
                <strong>{b.amount != null && b.status !== 'waived' ? formatMoney(b.amount) : '—'}</strong>
            </div>
            <p className={`labor-state ${b.status}`}>
                {LABOR_STATUS[b.status] || b.status}
                {b.paidAt ? ` · ${fmtWhen(b.paidAt)}` : b.requestedAt && b.status === 'requested' ? ` · sent ${fmtWhen(b.requestedAt)}` : ''}
            </p>

            {unpaid && order.status === 'completed' && (
                <>
                    <div className="labor-minutes">
                        <input
                            type="number"
                            name="laborMinutes"
                            min="0"
                            max="1440"
                            inputMode="numeric"
                            className="crm-select"
                            placeholder={l ? `${l.elapsedMinutes ?? l.minutes}` : 'Minutes'}
                            value={minutes}
                            onChange={(e) => setMinutes(e.target.value)}
                        />
                        <button
                            className="crm-ghost-btn"
                            disabled={busy !== null || minutes === '' || !(Number(minutes) >= 0) || reason.trim().length < 3}
                            title={reason.trim().length < 3 ? 'Write the reason for the correction first' : undefined}
                            onClick={() => call('minutes', { minutes: Math.round(Number(minutes)), reason: reason.trim() }, 'Minutes updated.')}
                        >
                            Set minutes
                        </button>
                        {l?.adjusted && (
                            <button
                                className="crm-link-btn"
                                disabled={busy !== null || reason.trim().length < 3}
                                title={reason.trim().length < 3 ? 'Write the reason first' : undefined}
                                onClick={() => call('minutes', { minutes: null, reason: reason.trim() }, 'Back to the measured time.')}
                            >
                                Use measured time
                            </button>
                        )}
                    </div>
                    <input
                        name="laborReason"
                        className="crm-select labor-reason"
                        maxLength={300}
                        placeholder="Reason for the correction (required, saved in History)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="record-actions-row">
                        {b.amount > 0 && (
                            <button className="crm-primary-btn" disabled={busy !== null} onClick={() => call('request', {}, 'Payment request emailed to the customer.')}>
                                {busy === 'request' ? 'Sending…' : b.status === 'requested' ? 'Resend payment request' : 'Approve & request payment'}
                            </button>
                        )}
                        <button className="crm-ghost-btn" disabled={busy !== null} onClick={() => call('cash', {}, 'Marked as paid in cash.')}>
                            Paid in cash
                        </button>
                        <button className="crm-ghost-btn danger" disabled={busy !== null} onClick={() => call('waive', {}, 'Labor waived.')}>
                            No charge
                        </button>
                    </div>
                </>
            )}
            {['paid_cash', 'waived'].includes(b.status) && (
                <button className="crm-link-btn" disabled={busy !== null} onClick={() => call('reopen', {}, 'Reopened for review.')}>
                    Undo ({b.status === 'paid_cash' ? 'not paid in cash' : 'charge labor'})
                </button>
            )}
            {msg && <p className="driver-msg">{msg}</p>}
            {err && <p className="form-inline-error">{err}</p>}
        </div>
    );
};

const AdminOrderDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(null);
    const [drivers, setDrivers] = useState([]);
    // Panoul „Confirm order”: alegi șoferul înainte de confirmare
    const [confirming, setConfirming] = useState(false);
    const [confirmDriver, setConfirmDriver] = useState('');
    // Cardul „Driver”: schimbarea șoferului după confirmare
    const [driverChoice, setDriverChoice] = useState('');
    const [driverMsg, setDriverMsg] = useState('');

    // Editarea comenzii (adrese, dată / oră, vehicul, obiecte)
    const [editing, setEditing] = useState(false);
    const [editMsg, setEditMsg] = useState('');

    // Note interne
    const [notes, setNotes] = useState('');
    const [notesMsg, setNotesMsg] = useState('');

    const applyOrder = (updated, { keepNotes = false } = {}) => {
        setOrder(updated);
        setDriverChoice(updated.driver ? String(updated.driver.id) : '');
        if (!keepNotes) setNotes(updated.dispatchNotes || '');
    };

    const saveNotes = async () => {
        setError('');
        setNotesMsg('');
        setSaving('notes');
        try {
            const { order: updated } = await api.adminSaveNotes(order.id, notes);
            applyOrder(updated);
            setNotesMsg(updated.driver ? 'Saved. The driver sees them in their job page and reminder email.' : 'Saved.');
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(null);
        }
    };

    const copyJobLink = async () => {
        const url = `${window.location.origin}${order.driver.jobPath}`;
        try {
            await navigator.clipboard.writeText(url);
            setDriverMsg('Job link copied — you can text it to the driver.');
        } catch {
            window.prompt('Copy the job link:', url);
        }
    };

    useEffect(() => {
        api.adminOrder(id)
            .then(({ order }) => applyOrder(order))
            .catch((err) => {
                if (err.status === 401 || err.status === 403) return navigate('/admin/login', { replace: true });
                setError(err.message);
            });
        api.adminDrivers()
            .then(({ drivers }) => setDrivers(drivers))
            .catch(() => {});
    }, [id, navigate]);

    const handleStatusChange = async (newStatus, driverId) => {
        setError('');
        setDriverMsg('');
        setSaving(newStatus);
        try {
            const { order: updated } = await api.adminSetStatus(order.id, newStatus, driverId);
            applyOrder(updated, { keepNotes: true });
            setConfirming(false);
            if (updated.driver && DRIVER_NOTIFY_STATUSES.includes(updated.status) && driverId !== undefined) {
                setDriverMsg(
                    updated.driver.notifiedAt
                        ? `Job emailed to ${updated.driver.fullName}.`
                        : `Couldn’t email ${updated.driver.fullName}. Check the email settings, then use “Resend email”.`
                );
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(null);
        }
    };

    const handleStatusClick = (status) => {
        // „Confirmed”: întâi alegi șoferul (care primește emailul cu jobul)
        if (status === 'confirmed' && order.status !== 'confirmed') {
            setConfirmDriver(order.driver ? String(order.driver.id) : '');
            setConfirming(true);
            return;
        }
        handleStatusChange(status);
    };

    const handleAssign = async ({ resend = false } = {}) => {
        setError('');
        setDriverMsg('');
        setSaving('driver');
        try {
            const driverId = driverChoice ? Number(driverChoice) : null;
            const { order: updated } = await api.adminAssignDriver(order.id, driverId, { resend });
            applyOrder(updated, { keepNotes: true });
            if (!updated.driver) setDriverMsg('Driver removed from this order.');
            else if (!DRIVER_NOTIFY_STATUSES.includes(updated.status))
                setDriverMsg(`${updated.driver.fullName} will be emailed when the order is confirmed.`);
            else if (updated.driver.notifiedAt) setDriverMsg(`Job emailed to ${updated.driver.fullName}.`);
            else setDriverMsg(`Couldn’t email ${updated.driver.fullName}. Check the email settings and try again.`);
            api.adminDrivers()
                .then(({ drivers }) => setDrivers(drivers))
                .catch(() => {});
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(null);
        }
    };

    if (error && !order) {
        return (
            <div className="crm-record">
                <Link to="/admin/dashboard" className="crm-back">← Back to dispatch</Link>
                <p className="form-inline-error">{error}</p>
            </div>
        );
    }

    if (!order) return <div className="crm-record"><PageLoader label="Loading order…" /></div>;

    // Online se plătește doar transportul; încărcarea/descărcarea se încasează la fața locului.
    const payment = order.paidOnline
        ? `Paid online${
              order.paymentMethod === 'paypal' ? ' · PayPal' : order.cardLast4 ? ` · card •••• ${order.cardLast4}` : ''
          } · labor collected after the job`
        : order.status === 'pending_payment'
          ? 'Unpaid'
          : 'Collected on delivery / manually';

    return (
        <div className="crm-record">
            <Link to="/admin/dashboard" className="crm-back">← Back to dispatch</Link>

            <div className="record-header">
                <div>
                    <h1>{order.id}</h1>
                    <span className="record-sub">Created {new Date(order.createdAt).toLocaleString('en-US')}</span>
                </div>
                <div className="record-header-right">
                    <span className={`status-badge ${order.status}`}>{STATUS_LABELS[order.status] || order.status}</span>
                    {!editing && !['completed', 'cancelled'].includes(order.status) && (
                        <button className="crm-ghost-btn" onClick={() => (setEditing(true), setEditMsg(''))}>
                            ✏️ Edit order
                        </button>
                    )}
                </div>
            </div>

            {editing && (
                <AdminOrderEditor
                    order={order}
                    onCancel={() => setEditing(false)}
                    onSaved={({ order: updated, changes, priceChange }) => {
                        applyOrder(updated, { keepNotes: true });
                        setEditing(false);
                        setEditMsg(
                            changes?.length
                                ? `Saved: ${changes.join(', ')}.${
                                      priceChange && !priceChange.applied
                                          ? ` New price estimate ${formatMoney(priceChange.estimated)} vs paid ${formatMoney(priceChange.current)} — settle the difference manually.`
                                          : ''
                                  }`
                                : 'No changes.'
                        );
                    }}
                />
            )}
            {editMsg && <p className="driver-msg edit-msg">{editMsg}</p>}

            <div className="record-actions">
                <span className="record-actions-label">Set status</span>
                <div className="record-actions-row">
                    {STATUS_ACTIONS.map((status) => (
                        <button
                            key={status}
                            className={`status-action ${order.status === status ? 'current' : ''} ${status}`}
                            disabled={saving !== null}
                            onClick={() => handleStatusClick(status)}
                        >
                            {saving === status ? 'Saving…' : STATUS_LABELS[status]}
                        </button>
                    ))}
                </div>
                {confirming && (
                    <div className="confirm-driver-panel">
                        <strong>Confirm order &amp; assign a driver</strong>
                        <p>The customer gets the confirmation email. The driver you pick gets an email with the job details and route.</p>
                        {drivers.some((d) => d.active) ? (
                            <DriverSelect
                                drivers={drivers}
                                value={confirmDriver}
                                onChange={setConfirmDriver}
                                current={order.driver}
                                disabled={saving !== null}
                            />
                        ) : (
                            <p className="record-sub">
                                No drivers yet — add them on the <Link to="/admin/dashboard">Drivers</Link> page. You can still confirm now and assign later.
                            </p>
                        )}
                        <div className="record-actions-row">
                            <button
                                className="crm-primary-btn"
                                disabled={saving !== null}
                                onClick={() => handleStatusChange('confirmed', confirmDriver ? Number(confirmDriver) : null)}
                            >
                                {saving === 'confirmed' ? 'Confirming…' : confirmDriver ? 'Confirm & email driver' : 'Confirm without driver'}
                            </button>
                            <button className="crm-ghost-btn" disabled={saving !== null} onClick={() => setConfirming(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
                {error && <p className="form-inline-error">{error}</p>}
            </div>

            <div className="record-grid">
                <div className="admin-card driver-card">
                    <h3>Driver</h3>
                    {order.driver ? (
                        <>
                            <Row label="Name">{order.driver.fullName}</Row>
                            <Row label="Email">{order.driver.email}</Row>
                            <Row label="Phone">{order.driver.phone || '—'}</Row>
                            <Row label="Job email">
                                {order.driver.notifiedAt
                                    ? `Sent ${fmtWhen(order.driver.notifiedAt)}`
                                    : DRIVER_NOTIFY_STATUSES.includes(order.status)
                                      ? 'Not sent'
                                      : 'Sent when the order is confirmed'}
                            </Row>
                        </>
                    ) : (
                        <p className="record-sub">No driver assigned yet.</p>
                    )}
                    {order.status !== 'cancelled' && order.status !== 'completed' && (
                        <div className="driver-assign">
                            <DriverSelect
                                drivers={drivers}
                                value={driverChoice}
                                onChange={setDriverChoice}
                                current={order.driver}
                                disabled={saving !== null}
                            />
                            <div className="record-actions-row">
                                <button
                                    className="crm-primary-btn"
                                    disabled={saving !== null || driverChoice === (order.driver ? String(order.driver.id) : '')}
                                    onClick={() => handleAssign()}
                                >
                                    {saving === 'driver' ? 'Saving…' : order.driver ? 'Change driver' : 'Assign driver'}
                                </button>
                                {order.driver && DRIVER_NOTIFY_STATUSES.includes(order.status) && (
                                    <button
                                        className="crm-ghost-btn"
                                        disabled={saving !== null || driverChoice !== String(order.driver.id)}
                                        onClick={() => handleAssign({ resend: true })}
                                    >
                                        Resend email
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    {order.driver?.jobPath && (
                        <div className="record-actions-row">
                            <a className="crm-ghost-btn" href={order.driver.jobPath} target="_blank" rel="noreferrer">
                                Open driver’s job page ↗
                            </a>
                            <button className="crm-ghost-btn" onClick={copyJobLink}>
                                Copy job link
                            </button>
                        </div>
                    )}
                    {driverMsg && <p className="driver-msg">{driverMsg}</p>}
                </div>

                <div className="admin-card">
                    <h3>Job progress</h3>
                    <Row label="On the way">{order.timeline?.enRouteAt ? fmtWhen(order.timeline.enRouteAt) : '—'}</Row>
                    <Row label="Arrived at pickup">{order.timeline?.arrivedAt ? fmtWhen(order.timeline.arrivedAt) : '—'}</Row>
                    <Row label="Completed">{order.timeline?.completedAt ? fmtWhen(order.timeline.completedAt) : '—'}</Row>
                    {order.timeline?.pausedSecs > 0 && (
                        <Row label="Breaks (not billed)">{Math.round(order.timeline.pausedSecs / 60)} min</Row>
                    )}
                    <LaborBilling order={order} onUpdated={(o) => applyOrder(o, { keepNotes: true })} />
                </div>

                <OrderHistory order={order} />

                <div className="admin-card">
                    <h3>Dispatch notes</h3>
                    <textarea
                        className="crm-textarea"
                        name="dispatchNotes"
                        rows={5}
                        maxLength={2000}
                        placeholder="Gate code, narrow stairs, call before arriving… Visible to dispatch and the assigned driver, never to the customer."
                        value={notes}
                        onChange={(e) => {
                            setNotes(e.target.value);
                            setNotesMsg('');
                        }}
                    />
                    <div className="record-actions-row">
                        <button
                            className="crm-primary-btn"
                            disabled={saving !== null || notes.trim() === (order.dispatchNotes || '').trim()}
                            onClick={saveNotes}
                        >
                            {saving === 'notes' ? 'Saving…' : 'Save notes'}
                        </button>
                    </div>
                    {notesMsg && <p className="driver-msg">{notesMsg}</p>}
                </div>

                <div className="admin-card">
                    <h3>Customer</h3>
                    <Row label="Name">{order.customer?.fullName || '—'}</Row>
                    <Row label="Email">{order.customer?.email || '—'}</Row>
                    <Row label="Phone">{order.customer?.phone || '—'}</Row>
                </div>

                <div className="admin-card">
                    <h3>Schedule</h3>
                    <Row label="Window">{order.scheduleText}</Row>
                    <Row label="Distance">{order.routeInfo?.distanceMiles} mi · ~{order.routeInfo?.durationMins} min</Row>
                    <Row label="Updated">{new Date(order.updatedAt).toLocaleString('en-US')}</Row>
                </div>

                <div className="admin-card">
                    <h3>Route</h3>
                    <div className="record-route">
                        {[
                            ['pickup', order.pickup],
                            ['dropoff', order.dropoff]
                        ].map(([kind, stop]) => (
                            <div key={kind} className={`route-point ${kind}`}>
                                <span />
                                {stop?.address}
                                {describeDetails(stop?.details) && <strong className="route-details">{describeDetails(stop.details)}</strong>}
                                {stop?.details?.notes && <small className="route-notes">Access: {stop.details.notes}</small>}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="admin-card">
                    <h3>Vehicle &amp; items</h3>
                    <Row label="Vehicle">{order.vehicle?.name} ({order.vehicle?.crewLabel})</Row>
                    <Row label="Items">{order.itemsDescription || '—'}</Row>
                    <Row label="Photos">{order.photosCount}</Row>
                    <Row label="Payment">{payment}</Row>
                </div>

                <div className="admin-card photos-card">
                    <h3>Item photos {order.photoIds?.length ? `(${order.photoIds.length})` : ''}</h3>
                    <PhotoGallery
                        urls={(order.photoIds || []).map((pid) => orderPhotoUrl(order.id, pid))}
                        emptyText="The customer didn’t add photos."
                    />
                </div>

                <div className="admin-card record-total-card">
                    <h3>Charge</h3>
                    {(order.price?.lines || []).map((line) => (
                        <Row key={line.key} label={line.label}>
                            {formatMoney(line.amount)}
                            {line.detail && <small className="record-line-detail">{line.detail}</small>}
                        </Row>
                    ))}
                    <div className="record-total">
                        <span>Paid at booking</span>
                        <strong>{formatMoney(order.totalAmount)}</strong>
                    </div>
                    {order.price?.labor && (
                        <Row label="Labor (after job)">
                            {order.price.labor.label}
                            <small className="record-line-detail">Actual time from crew arrival at pickup to completion — collect on site.</small>
                        </Row>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminOrderDetail;
