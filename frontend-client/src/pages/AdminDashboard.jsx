import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { formatPrice } from '../utils/formatters';
import { api } from '../api/client';
import Logo from '../components/Logo';
import './Admin.css';

export const STATUS_LABELS = {
    pending_payment: 'Awaiting payment',
    paid: 'Paid',
    en_route: 'En route',
    completed: 'Completed',
    cancelled: 'Cancelled'
};

const AdminDashboard = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const load = useCallback(async () => {
        setError('');
        try {
            const { orders } = await api.adminOrders();
            setOrders(orders);
        } catch (err) {
            // 401/403: no session or no dispatcher rights → back to login
            if (err.status === 401 || err.status === 403) return navigate('/admin/login', { replace: true });
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        load();
        const timer = setInterval(load, 30000); // auto-refresh every 30s
        return () => clearInterval(timer);
    }, [load]);

    const handleLogout = async () => {
        await api.logout().catch(() => {});
        navigate('/admin/login');
    };

    return (
        <div className="admin-layout">
            <header className="admin-header">
                <div className="admin-brand">
                    <Logo height={24} />
                    <span className="admin-brand-label">Dispatch</span>
                </div>
                <button onClick={handleLogout} className="change-account-btn">
                    Log out
                </button>
            </header>

            <main className="admin-content">
                <div className="admin-content-header">
                    <h1>Recent orders</h1>
                    <span className="order-count">{orders.length} orders</span>
                </div>

                {error && <p className="form-inline-error">{error}</p>}

                <div className="admin-table-container">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Order ID</th>
                                <th>Customer</th>
                                <th>Vehicle</th>
                                <th>Schedule</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="empty-state">Loading…</td>
                                </tr>
                            ) : orders.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="empty-state">No orders yet.</td>
                                </tr>
                            ) : (
                                orders.map((order) => (
                                    <tr key={order.id}>
                                        <td>
                                            <strong>#{order.id}</strong>
                                        </td>
                                        <td>
                                            <div className="client-info">
                                                <span>{order.customer?.fullName || order.customer?.email || 'N/A'}</span>
                                                <small>{order.customer?.phone || order.customer?.email || ''}</small>
                                            </div>
                                        </td>
                                        <td>{order.vehicle?.name}</td>
                                        <td>
                                            <div className="client-info">
                                                <span>{order.scheduleText}</span>
                                                <small>created {new Date(order.createdAt).toLocaleString('en-US')}</small>
                                            </div>
                                        </td>
                                        <td>
                                            <strong>{formatPrice(order.totalAmount)}</strong>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${order.status}`}>
                                                {STATUS_LABELS[order.status] || order.status}
                                            </span>
                                        </td>
                                        <td>
                                            <Link to={`/admin/order/${order.id}`} className="change-account-btn">
                                                Details
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;
