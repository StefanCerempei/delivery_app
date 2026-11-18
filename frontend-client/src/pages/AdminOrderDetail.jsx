import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { formatPrice } from '../utils/formatters';
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

const AdminOrderDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(null);

    useEffect(() => {
        api.adminOrder(id)
            .then(({ order }) => setOrder(order))
            .catch((err) => {
                if (err.status === 401 || err.status === 403) return navigate('/admin/login', { replace: true });
                setError(err.message);
            });
    }, [id, navigate]);

    const handleStatusChange = async (newStatus) => {
        setError('');
        setSaving(newStatus);
        try {
            const { order: updated } = await api.adminSetStatus(order.id, newStatus);
            setOrder(updated);
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
        ? `Transport paid online${order.cardLast4 ? ` · card •••• ${order.cardLast4}` : ''} · labor collected on site`
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
                            onClick={() => handleStatusChange(status)}
                        >
                            {saving === status ? 'Saving…' : STATUS_LABELS[status]}
                        </button>
                    ))}
                </div>
                {error && <p className="form-inline-error">{error}</p>}
            </div>

            <div className="record-grid">
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
                    <Row label="Base fare">{formatPrice(order.price?.baseFare)}</Row>
                    <Row label="Distance">{formatPrice(order.price?.distanceCost)}</Row>
                    <Row label="Time">{formatPrice(order.price?.timeCost)}</Row>
                    <div className="record-total">
                        <span>Total</span>
                        <strong>{formatPrice(order.totalAmount)}</strong>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminOrderDetail;
