import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { formatPrice } from '../utils/formatters';
import Button from '../components/Button';
import { api } from '../api/client';
import { STATUS_LABELS } from './AdminDashboard';
import './Admin.css';

const STATUS_ACTIONS = ['paid', 'en_route', 'completed', 'cancelled'];

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
            <div className="admin-layout">
                <main className="admin-content">
                    <Link to="/admin/dashboard" className="back-btn">← Back to dashboard</Link>
                    <p className="form-inline-error">{error}</p>
                </main>
            </div>
        );
    }

    if (!order) return <div className="admin-layout"><main className="admin-content">Loading…</main></div>;

    return (
        <div className="admin-layout">
            <header className="admin-header">
                <Link to="/admin/dashboard" className="back-btn">← Back to dashboard</Link>
                <div className="admin-brand">
                    <h2>Order #{order.id}</h2>
                    <span className={`status-badge ${order.status}`}>{STATUS_LABELS[order.status] || order.status}</span>
                </div>
            </header>

            <main className="admin-content detail-grid">
                <div className="detail-column">
                    <div className="admin-card">
                        <h3>Update status</h3>
                        <div className="status-actions">
                            {STATUS_ACTIONS.map((status) => (
                                <Button
                                    key={status}
                                    variant={order.status === status ? 'primary' : 'secondary'}
                                    disabled={saving !== null}
                                    onClick={() => handleStatusChange(status)}
                                >
                                    {saving === status ? 'Saving…' : STATUS_LABELS[status]}
                                </Button>
                            ))}
                        </div>
                        {error && <p className="form-inline-error">{error}</p>}
                    </div>

                    <div className="admin-card">
                        <h3>Customer</h3>
                        <p><strong>Name:</strong> {order.customer?.fullName}</p>
                        <p><strong>Email:</strong> {order.customer?.email}</p>
                        <p><strong>Phone:</strong> {order.customer?.phone || '—'}</p>
                    </div>
                </div>

                <div className="detail-column">
                    <div className="admin-card">
                        <h3>Route</h3>
                        <div className="route-timeline admin-timeline">
                            <p><strong>From:</strong> {order.pickup?.address}</p>
                            <p><strong>To:</strong> {order.dropoff?.address}</p>
                        </div>
                        <p>
                            <strong>Distance:</strong> {order.routeInfo?.distanceMiles} mi • ~{order.routeInfo?.durationMins} min
                        </p>
                        <p><strong>Schedule:</strong> {order.scheduleText}</p>
                    </div>

                    <div className="admin-card">
                        <h3>Vehicle & items</h3>
                        <p><strong>Vehicle:</strong> {order.vehicle?.name} ({order.vehicle?.crewLabel})</p>
                        <p><strong>Items:</strong> {order.itemsDescription}</p>
                        <p><strong>Photos:</strong> {order.photosCount}</p>
                        <p>
                            <strong>Payment:</strong>{' '}
                            {order.cardLast4
                                ? `paid online (card •••• ${order.cardLast4})`
                                : order.status === 'pending_payment'
                                  ? 'unpaid'
                                  : 'collected on delivery / manually'}
                        </p>
                        <p className="total-amount">
                            <strong>Total:</strong> {formatPrice(order.totalAmount)}
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminOrderDetail;
