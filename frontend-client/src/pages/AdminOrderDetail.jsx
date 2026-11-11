import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { formatPrice } from '../utils/formatters';
import Button from '../components/Button';
import './Admin.css';

const AdminOrderDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState(null);

    useEffect(() => {
        const isAuth = localStorage.getItem('reloq_admin_auth');
        if (!isAuth) {
            navigate('/admin/login');
            return;
        }

        const savedOrders = JSON.parse(localStorage.getItem('reloq_orders') || '[]');
        const foundOrder = savedOrders.find(o => o.id === id);
        if (foundOrder) {
            setOrder(foundOrder);
        }
    }, [id, navigate]);

    const handleStatusChange = (newStatus) => {
        const savedOrders = JSON.parse(localStorage.getItem('reloq_orders') || '[]');
        const updatedOrders = savedOrders.map(o =>
            o.id === id ? { ...o, status: newStatus } : o
        );

        localStorage.setItem('reloq_orders', JSON.stringify(updatedOrders));
        setOrder({ ...order, status: newStatus });
    };

    if (!order) return <div className="admin-layout">Se încarcă...</div>;

    return (
        <div className="admin-layout">
            <header className="admin-header">
                <Link to="/admin/dashboard" className="back-btn">← Înapoi la Dashboard</Link>
                <div className="admin-brand">
                    <h2>Comanda #{order.id}</h2>
                </div>
            </header>

            <main className="admin-content detail-grid">
                <div className="detail-column">
                    <div className="admin-card">
                        <h3>Actualizare Status</h3>
                        <div className="status-actions">
                            <Button
                                variant={order.status === 'paid' ? 'primary' : 'secondary'}
                                onClick={() => handleStatusChange('paid')}
                            >
                                Plătită
                            </Button>
                            <Button
                                variant={order.status === 'en_route' ? 'primary' : 'secondary'}
                                onClick={() => handleStatusChange('en_route')}
                            >
                                Echipaj pe drum
                            </Button>
                            <Button
                                variant={order.status === 'completed' ? 'primary' : 'secondary'}
                                onClick={() => handleStatusChange('completed')}
                            >
                                Finalizată
                            </Button>
                        </div>
                    </div>

                    <div className="admin-card">
                        <h3>Detalii Client</h3>
                        <p><strong>Email:</strong> {order.customer?.email}</p>
                        <p><strong>Telefon:</strong> {order.customer?.phone}</p>
                    </div>
                </div>

                <div className="detail-column">
                    <div className="admin-card">
                        <h3>Traseu</h3>
                        <div className="route-timeline admin-timeline">
                            <p><strong>De la:</strong> {order.pickup?.address}</p>
                            <p><strong>La:</strong> {order.dropoff?.address}</p>
                        </div>
                        <p><strong>Distanță:</strong> {order.routeInfo?.distanceMiles} mi</p>
                    </div>

                    <div className="admin-card">
                        <h3>Detalii Vehicul & Obiecte</h3>
                        <p><strong>Vehicul:</strong> {order.vehicle?.name}</p>
                        <p><strong>Obiecte:</strong> {order.itemsDescription}</p>
                        <p className="total-amount"><strong>Total:</strong> {formatPrice(order.totalAmount)}</p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminOrderDetail;