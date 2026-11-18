import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatPrice } from '../utils/formatters';
import { api } from '../api/client';
import Logo from '../components/Logo';
import { useAuth, initials } from '../context/AuthContext';
import './Admin.css';

export const STATUS_LABELS = {
    pending_payment: 'New',
    paid: 'Paid • to confirm',
    confirmed: 'Confirmed',
    en_route: 'En route',
    completed: 'Completed',
    cancelled: 'Cancelled'
};

// „paid” = transportul plătit online, așteaptă confirmarea dispecerului.
const STATUS_ORDER = ['pending_payment', 'paid', 'confirmed', 'en_route', 'completed', 'cancelled'];
// Comenzile care contează ca venit confirmat (nu cele neplătite sau anulate).
const REVENUE_STATUSES = ['confirmed', 'paid', 'en_route', 'completed'];

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const StatusBadge = ({ status }) => (
    <span className={`status-badge ${status}`}>{STATUS_LABELS[status] || status}</span>
);

const AdminDashboard = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [view, setView] = useState('overview'); // overview | orders | customers
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const navigate = useNavigate();
    const { user, logoutUser } = useAuth();

    const load = useCallback(async () => {
        setError('');
        try {
            const { orders } = await api.adminOrders();
            setOrders(orders);
        } catch (err) {
            if (err.status === 401 || err.status === 403) return navigate('/admin/login', { replace: true });
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        load();
        const timer = setInterval(load, 30000);
        return () => clearInterval(timer);
    }, [load]);

    const handleLogout = async () => {
        await logoutUser().catch(() => {});
        navigate('/admin/login');
    };

    const counts = useMemo(() => {
        const c = { all: orders.length };
        for (const s of STATUS_ORDER) c[s] = 0;
        for (const o of orders) c[o.status] = (c[o.status] || 0) + 1;
        return c;
    }, [orders]);

    const revenue = useMemo(
        () => orders.filter((o) => REVENUE_STATUSES.includes(o.status)).reduce((sum, o) => sum + (o.totalAmount || 0), 0),
        [orders]
    );

    const matchesSearch = useCallback(
        (o) => {
            const q = search.trim().toLowerCase();
            if (!q) return true;
            return [
                o.id,
                o.customer?.fullName,
                o.customer?.email,
                o.customer?.phone,
                o.pickup?.address,
                o.dropoff?.address,
                o.vehicle?.name
            ]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q));
        },
        [search]
    );

    const filteredOrders = useMemo(
        () => orders.filter((o) => (statusFilter === 'all' || o.status === statusFilter) && matchesSearch(o)),
        [orders, statusFilter, matchesSearch]
    );

    // Clienți derivați din comenzi (grupați pe email).
    const customers = useMemo(() => {
        const map = new Map();
        for (const o of orders) {
            const key = o.customer?.email || o.customer?.phone || o.id;
            const prev = map.get(key) || {
                name: o.customer?.fullName || '—',
                email: o.customer?.email || '',
                phone: o.customer?.phone || '',
                orders: 0,
                value: 0,
                last: o.createdAt
            };
            prev.orders += 1;
            if (REVENUE_STATUSES.includes(o.status)) prev.value += o.totalAmount || 0;
            if (new Date(o.createdAt) > new Date(prev.last)) prev.last = o.createdAt;
            map.set(key, prev);
        }
        const q = search.trim().toLowerCase();
        return [...map.values()]
            .filter((c) => !q || [c.name, c.email, c.phone].some((v) => String(v).toLowerCase().includes(q)))
            .sort((a, b) => new Date(b.last) - new Date(a.last));
    }, [orders, search]);

    const openOrder = (id) => navigate(`/admin/order/${id}`);

    const exportCsv = () => {
        const cols = ['Order', 'Status', 'Customer', 'Email', 'Phone', 'Vehicle', 'Pickup', 'Drop-off', 'Schedule', 'Distance (mi)', 'Total', 'Created'];
        const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [cols.join(',')];
        for (const o of filteredOrders) {
            lines.push([
                o.id, STATUS_LABELS[o.status] || o.status, o.customer?.fullName, o.customer?.email, o.customer?.phone,
                o.vehicle?.name, o.pickup?.address, o.dropoff?.address, o.scheduleText, o.routeInfo?.distanceMiles,
                o.totalAmount, new Date(o.createdAt).toISOString()
            ].map(cell).join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reloq-orders-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const NAV = [
        { id: 'overview', label: 'Overview', icon: '▚' },
        { id: 'orders', label: 'Orders', icon: '☰' },
        { id: 'customers', label: 'Customers', icon: '◎' }
    ];

    const KPIS = [
        { label: 'Total orders', value: counts.all, tone: '' },
        { label: 'To confirm', value: (counts.pending_payment || 0) + (counts.paid || 0), tone: 'pending_payment' },
        { label: 'Active jobs', value: (counts.confirmed || 0) + (counts.en_route || 0), tone: 'en_route' },
        { label: 'Completed', value: counts.completed, tone: 'completed' },
        { label: 'Booked revenue', value: formatPrice(revenue), tone: 'accent' }
    ];

    return (
        <div className="crm-shell">
            <aside className="crm-sidebar">
                <div className="crm-brand">
                    <Logo height={24} />
                    <span className="crm-brand-tag">Dispatch</span>
                </div>

                <nav className="crm-nav">
                    {NAV.map((item) => (
                        <button
                            key={item.id}
                            className={`crm-nav-item ${view === item.id ? 'active' : ''}`}
                            onClick={() => setView(item.id)}
                        >
                            <span className="crm-nav-icon" aria-hidden="true">{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="crm-sidebar-foot">
                    <div className="crm-user">
                        <span className="crm-user-avatar">{initials(user?.fullName || 'Dispatch')}</span>
                        <div className="crm-user-meta">
                            <strong>{user?.fullName || 'Dispatcher'}</strong>
                            <small>{user?.email}</small>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="crm-logout">Log out</button>
                </div>
            </aside>

            <main className="crm-main">
                <header className="crm-topbar">
                    <h1>{view === 'overview' ? 'Overview' : view === 'orders' ? 'Orders' : 'Customers'}</h1>
                    <div className="crm-topbar-right">
                        <div className="crm-search">
                            <span aria-hidden="true">⌕</span>
                            <input
                                type="search"
                                placeholder="Search orders, customers, addresses…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <button className="crm-refresh" onClick={load} title="Refresh" aria-label="Refresh">⟳</button>
                    </div>
                </header>

                <div className="crm-body">
                    {error && <p className="form-inline-error">{error}</p>}

                    {/* ---------- OVERVIEW ---------- */}
                    {view === 'overview' && (
                        <>
                            <div className="kpi-row">
                                {KPIS.map((k) => (
                                    <div key={k.label} className={`kpi-card ${k.tone}`}>
                                        <span className="kpi-label">{k.label}</span>
                                        <span className="kpi-value">{loading ? '—' : k.value}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="crm-section-head">
                                <h2>Recent orders</h2>
                                <button className="crm-link-btn" onClick={() => setView('orders')}>View all →</button>
                            </div>
                            <OrdersTable
                                orders={orders.slice(0, 6)}
                                loading={loading}
                                onOpen={openOrder}
                            />
                        </>
                    )}

                    {/* ---------- ORDERS ---------- */}
                    {view === 'orders' && (
                        <>
                            <div className="orders-toolbar">
                                <div className="filter-chips">
                                    {['all', ...STATUS_ORDER].map((s) => (
                                        <button
                                            key={s}
                                            className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
                                            onClick={() => setStatusFilter(s)}
                                        >
                                            {s === 'all' ? 'All' : STATUS_LABELS[s]}
                                            <span className="filter-count">{counts[s] || 0}</span>
                                        </button>
                                    ))}
                                </div>
                                <button className="crm-export" onClick={exportCsv} disabled={filteredOrders.length === 0}>
                                    ↓ Export CSV
                                </button>
                            </div>
                            <OrdersTable orders={filteredOrders} loading={loading} onOpen={openOrder} full />
                        </>
                    )}

                    {/* ---------- CUSTOMERS ---------- */}
                    {view === 'customers' && (
                        <div className="admin-table-container">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th>Contact</th>
                                        <th>Orders</th>
                                        <th>Booked value</th>
                                        <th>Last order</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="5" className="empty-state">Loading…</td></tr>
                                    ) : customers.length === 0 ? (
                                        <tr><td colSpan="5" className="empty-state">No customers yet.</td></tr>
                                    ) : (
                                        customers.map((c) => (
                                            <tr key={c.email || c.phone || c.name}>
                                                <td>
                                                    <div className="cell-user">
                                                        <span className="cell-avatar">{initials(c.name)}</span>
                                                        <strong>{c.name}</strong>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="client-info">
                                                        <span>{c.email || '—'}</span>
                                                        <small>{c.phone || ''}</small>
                                                    </div>
                                                </td>
                                                <td>{c.orders}</td>
                                                <td><strong>{formatPrice(c.value)}</strong></td>
                                                <td>{fmtDate(c.last)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

/** Tabelul de comenzi, reutilizat în Overview și Orders. */
const OrdersTable = ({ orders, loading, onOpen, full }) => (
    <div className="admin-table-container">
        <table className="admin-table">
            <thead>
                <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    {full && <th className="col-route">Route</th>}
                    <th>Vehicle</th>
                    <th>Schedule</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th aria-label="Open" />
                </tr>
            </thead>
            <tbody>
                {loading ? (
                    <tr><td colSpan={full ? 8 : 7} className="empty-state">Loading…</td></tr>
                ) : orders.length === 0 ? (
                    <tr><td colSpan={full ? 8 : 7} className="empty-state">No orders found.</td></tr>
                ) : (
                    orders.map((order) => (
                        <tr key={order.id} className="row-click" onClick={() => onOpen(order.id)}>
                            <td><strong>{order.id}</strong></td>
                            <td>
                                <div className="client-info">
                                    <span>{order.customer?.fullName || order.customer?.email || 'N/A'}</span>
                                    <small>{order.customer?.phone || order.customer?.email || ''}</small>
                                </div>
                            </td>
                            {full && (
                                <td className="col-route">
                                    <div className="client-info route-cell">
                                        <span>{order.pickup?.address}</span>
                                        <small>→ {order.dropoff?.address}</small>
                                    </div>
                                </td>
                            )}
                            <td>{order.vehicle?.name}</td>
                            <td>
                                <div className="client-info">
                                    <span>{order.scheduleText}</span>
                                    <small>{fmtDateTime(order.createdAt)}</small>
                                </div>
                            </td>
                            <td><strong>{formatPrice(order.totalAmount)}</strong></td>
                            <td><StatusBadge status={order.status} /></td>
                            <td className="cell-chevron">›</td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
    </div>
);

export default AdminDashboard;
