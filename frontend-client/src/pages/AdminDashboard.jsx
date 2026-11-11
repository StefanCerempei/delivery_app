import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { formatPrice } from '../utils/formatters';
import { api } from '../api/client';
import './Admin.css';

export const STATUS_LABELS = {
    pending_payment: 'De plată',
    paid: 'Plătită',
    en_route: 'Pe drum',
    completed: 'Finalizată',
    cancelled: 'Anulată'
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
            // 401/403: sesiune lipsă sau cont fără drepturi → la login
            if (err.status === 401 || err.status === 403) return navigate('/admin/login', { replace: true });
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        load();
        const timer = setInterval(load, 30000); // reîmprospătare automată la 30s
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
                    <span className="brand-dot" />
                    <h2>RELOQ DISPECERAT</h2>
                </div>
                <button onClick={handleLogout} className="change-account-btn">
                    Deconectare
                </button>
            </header>

            <main className="admin-content">
                <div className="admin-content-header">
                    <h1>Comenzi recente</h1>
                    <span className="order-count">{orders.length} comenzi</span>
                </div>

                {error && <p className="form-inline-error">{error}</p>}

                <div className="admin-table-container">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>ID comandă</th>
                                <th>Client</th>
                                <th>Vehicul</th>
                                <th>Programare</th>
                                <th>Total</th>
                                <th>Status</th>
                                <th>Acțiune</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="empty-state">Se încarcă…</td>
                                </tr>
                            ) : orders.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="empty-state">Nu există comenzi încă.</td>
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
                                                <small>creată {new Date(order.createdAt).toLocaleString('ro-RO')}</small>
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
                                                Detalii
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
