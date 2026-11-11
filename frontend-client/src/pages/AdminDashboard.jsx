import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { formatPrice } from '../utils/formatters';
import './Admin.css';

const AdminDashboard = () => {
    const [orders, setOrders] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        // Verifică autentificarea
        const isAuth = localStorage.getItem('reloq_admin_auth');
        if (!isAuth) {
            navigate('/admin/login');
            return;
        }

        // Încarcă comenzile
        const savedOrders = JSON.parse(localStorage.getItem('reloq_orders') || '[]');
        setOrders(savedOrders);
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('reloq_admin_auth');
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
                    <h1>Comenzi Recente</h1>
                    <span className="order-count">{orders.length} comenzi totale</span>
                </div>

                <div className="admin-table-container">
                    <table className="admin-table">
                        <thead>
                        <tr>
                            <th>ID Comandă</th>
                            <th>Client</th>
                            <th>Vehicul</th>
                            <th>Dată & Ora</th>
                            <th>Total</th>
                            <th>Status</th>
                            <th>Acțiune</th>
                        </tr>
                        </thead>
                        <tbody>
                        {orders.length === 0 ? (
                            <tr>
                                <td colSpan="7" className="empty-state">Nu există comenzi încă.</td>
                            </tr>
                        ) : (
                            orders.map(order => (
                                <tr key={order.id}>
                                    <td><strong>#{order.id}</strong></td>
                                    <td>
                                        <div className="client-info">
                                            <span>{order.customer?.email || 'N/A'}</span>
                                            <small>{order.customer?.phone || 'N/A'}</small>
                                        </div>
                                    </td>
                                    <td>{order.vehicle?.name}</td>
                                    <td>{new Date(order.createdAt).toLocaleString()}</td>
                                    <td><strong>{formatPrice(order.totalAmount)}</strong></td>
                                    <td>
                      <span className={`status-badge ${order.status}`}>
                        {order.status}
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