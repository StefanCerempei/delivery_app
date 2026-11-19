import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { formatMoney } from '../utils/formatters';
import { api } from '../api/client';
import { STATUS_LABELS } from './AdminDashboard';
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

    const applyOrder = (updated) => {
        setOrder(updated);
        setDriverChoice(updated.driver ? String(updated.driver.id) : '');
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
            applyOrder(updated);
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
            applyOrder(updated);
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

    if (!order) return <div className="crm-record"><p className="empty-state">Loading…</p></div>;

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
                <span className={`status-badge ${order.status}`}>{STATUS_LABELS[order.status] || order.status}</span>
            </div>

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
                    {driverMsg && <p className="driver-msg">{driverMsg}</p>}
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
                        <div className="route-point pickup"><span />{order.pickup?.address}</div>
                        <div className="route-point dropoff"><span />{order.dropoff?.address}</div>
                    </div>
                </div>

                <div className="admin-card">
                    <h3>Vehicle &amp; items</h3>
                    <Row label="Vehicle">{order.vehicle?.name} ({order.vehicle?.crewLabel})</Row>
                    <Row label="Items">{order.itemsDescription || '—'}</Row>
                    <Row label="Photos">{order.photosCount}</Row>
                    <Row label="Payment">{payment}</Row>
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
