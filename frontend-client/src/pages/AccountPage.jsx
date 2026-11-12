import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import { useAuth, initials } from '../context/AuthContext';
import { api } from '../api/client';
import { formatPrice } from '../utils/formatters';
import { CUSTOMER_STATUS_LABELS } from '../utils/orderStatus';
import './Account.css';

const ACTIVE = ['pending_payment', 'paid', 'en_route'];

const AccountPage = () => {
    const navigate = useNavigate();
    const { user, authChecked, logoutUser } = useAuth();
    const [orders, setOrders] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        document.title = 'My account — RELOQ';
    }, []);

    useEffect(() => {
        if (!authChecked) return;
        if (!user || (user.role !== 'admin' && !user.emailVerified)) {
            // Fără cont sau cu emailul neverificat → pagina de login arată pasul de verificare
            navigate('/login?next=/account', { replace: true });
            return;
        }
        api.myOrders()
            .then(({ orders }) => setOrders(orders))
            .catch((err) => {
                if (err.status === 401) return navigate('/login?next=/account', { replace: true });
                setError(err.message);
                setOrders([]);
            });
    }, [authChecked, user, navigate]);

    const handleLogout = async () => {
        await logoutUser();
        navigate('/', { replace: true });
    };

    if (!authChecked || !user) {
        return <div className="account-layout account-loading">Loading…</div>;
    }

    const active = (orders || []).filter((o) => ACTIVE.includes(o.status));
    const past = (orders || []).filter((o) => !ACTIVE.includes(o.status));

    return (
        <div className="account-layout">
            <header className="account-header">
                <Link to="/" aria-label="RELOQ home">
                    <Logo height={26} />
                </Link>
                <div className="account-header-actions">
                    <Link to="/" className="lugg-btn lugg-btn-primary account-book-btn">
                        Book a move
                    </Link>
                    <button type="button" className="change-account-btn" onClick={handleLogout}>
                        Log out
                    </button>
                </div>
            </header>

            <main className="account-main">
                <section className="account-profile">
                    <span className="account-avatar" aria-hidden="true">
                        {initials(user.fullName)}
                    </span>
                    <div>
                        <h1>Hi, {user.fullName?.split(' ')[0] || 'there'}</h1>
                        <p>
                            {user.email}
                            {user.phone ? ` • ${user.phone}` : ''}
                        </p>
                    </div>
                </section>

                {error && <p className="form-inline-error">{error}</p>}

                {orders === null ? (
                    <p className="account-muted">Loading your orders…</p>
                ) : orders.length === 0 ? (
                    <div className="account-empty">
                        <h2>No bookings yet</h2>
                        <p>Get an instant price for your first move. It takes about a minute.</p>
                        <Link to="/" className="lugg-btn lugg-btn-primary">
                            Book a move
                        </Link>
                    </div>
                ) : (
                    <>
                        {active.length > 0 && <OrderSection title="Upcoming & active" orders={active} />}
                        {past.length > 0 && <OrderSection title="Past orders" orders={past} />}
                    </>
                )}

                <p className="account-help">
                    Need to change or cancel a booking? Call us or email{' '}
                    <a href="mailto:info@reloqmove.com">info@reloqmove.com</a> with your order number.
                </p>
            </main>
        </div>
    );
};

const OrderSection = ({ title, orders }) => (
    <section className="account-orders">
        <h2>{title}</h2>
        <div className="order-card-list">
            {orders.map((order) => (
                <article key={order.id} className="order-card">
                    <div className="order-card-top">
                        <div>
                            <span className="order-card-code">#{order.id}</span>
                            <strong className="order-card-vehicle">{order.vehicle?.name}</strong>
                            <span className="order-card-when">{order.scheduleText}</span>
                        </div>
                        <div className="order-card-right">
                            <span className={`status-badge ${order.status}`}>
                                {CUSTOMER_STATUS_LABELS[order.status] || order.status}
                            </span>
                            <span className="order-card-total">{formatPrice(order.totalAmount)}</span>
                        </div>
                    </div>
                    <div className="order-card-route">
                        <div className="recap-addr-line">
                            <span className="mini-dot blue" />
                            <span>{order.pickup?.address}</span>
                        </div>
                        <div className="recap-addr-line">
                            <span className="mini-dot green" />
                            <span>{order.dropoff?.address}</span>
                        </div>
                    </div>
                </article>
            ))}
        </div>
    </section>
);

export default AccountPage;
