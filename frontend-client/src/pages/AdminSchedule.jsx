import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { STATUS_LABELS } from './AdminDashboard';
import { PageLoader } from '../components/Spinner';

// Aceleași ferestre ca la rezervare (ora firmei, Massachusetts)
const SLOTS = [
    { id: '07:00', label: '7–9 AM' },
    { id: '09:00', label: '9–11 AM' },
    { id: '11:00', label: '11 AM–1 PM' },
    { id: '13:00', label: '1–3 PM' },
    { id: '15:00', label: '3–5 PM' }
];
const DAYS = 7;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Azi în fusul firmei, ca dată UTC la miezul nopții. */
function businessToday() {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
            .formatToParts(new Date())
            .map((p) => [p.type, p.value])
    );
    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

// scheduled_for e ora locală a firmei salvată fără fus: o citim cu getUTC*.
const slotKey = (scheduledFor) => {
    const d = new Date(scheduledFor);
    return `${iso(d)} ${d.toISOString().slice(11, 16)}`;
};

/** Calendarul dispeceratului: 7 zile × ferestrele de sosire, cu comanda și șoferul din fiecare. */
const AdminSchedule = ({ drivers, onOpen, refreshKey }) => {
    const today = useMemo(businessToday, []);
    const [start, setStart] = useState(today);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [driverFilter, setDriverFilter] = useState('all');
    const [showCancelled, setShowCancelled] = useState(false);

    const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(start, i)), [start]);

    // Ore / zile blocate de dispecer: { 'YYYY-MM-DD': { '09:00': '', '*': '' } }
    const [blocks, setBlocks] = useState({});
    const [busyKey, setBusyKey] = useState(null);
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        setError('');
        try {
            const [{ orders }, { blocks }] = await Promise.all([
                api.adminSchedule(iso(days[0]), iso(days[DAYS - 1])),
                api.adminBlocks(iso(days[0]), iso(days[DAYS - 1]))
            ]);
            setOrders(orders);
            setBlocks(blocks || {});
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => {
        load();
    }, [load, refreshKey]);

    const bySlot = useMemo(() => {
        const map = new Map();
        for (const o of orders) {
            if (!o.schedule?.scheduledFor) continue;
            if (!showCancelled && o.status === 'cancelled') continue;
            if (driverFilter === 'none' && o.driver) continue;
            if (driverFilter !== 'all' && driverFilter !== 'none' && String(o.driver?.id) !== driverFilter) continue;
            const key = slotKey(o.schedule.scheduledFor);
            map.set(key, [...(map.get(key) || []), o]);
        }
        return map;
    }, [orders, driverFilter, showCancelled]);

    /** Blochează / deblochează o fereastră (slot '*' = toată ziua). */
    const toggleBlock = async (dayIso, slot, block) => {
        setError('');
        setNotice('');
        setBusyKey(`${dayIso} ${slot}`);
        try {
            if (block) {
                const res = await api.adminBlock(dayIso, slot);
                if (res.existingOrders?.length) {
                    setNotice(
                        `Blocked. Already booked: ${res.existingOrders.join(', ')} — those orders stay; cancel or move them if needed.`
                    );
                }
            } else {
                await api.adminUnblock(dayIso, slot);
            }
            const { blocks } = await api.adminBlocks(iso(days[0]), iso(days[DAYS - 1]));
            setBlocks(blocks || {});
        } catch (err) {
            setError(err.message);
        } finally {
            setBusyKey(null);
        }
    };

    const active = orders.filter((o) => o.status !== 'cancelled');
    const blockedCount = Object.values(blocks).reduce((n, b) => n + ('*' in b ? SLOTS.length : Object.keys(b).length), 0);
    const unassigned = active.filter((o) => !o.driver && o.status !== 'completed').length;
    const capacity = DAYS * SLOTS.length;

    const rangeLabel = `${MONTHS[days[0].getUTCMonth()]} ${days[0].getUTCDate()} – ${MONTHS[days[DAYS - 1].getUTCMonth()]} ${days[DAYS - 1].getUTCDate()}`;

    return (
        <>
            <div className="schedule-toolbar">
                <div className="schedule-nav">
                    <button className="crm-ghost-btn" onClick={() => setStart(addDays(start, -DAYS))} aria-label="Previous week">
                        ←
                    </button>
                    <button className="crm-ghost-btn" onClick={() => setStart(today)} disabled={iso(start) === iso(today)}>
                        Today
                    </button>
                    <button className="crm-ghost-btn" onClick={() => setStart(addDays(start, DAYS))} aria-label="Next week">
                        →
                    </button>
                    <strong className="schedule-range">{rangeLabel}</strong>
                </div>
                <div className="schedule-filters">
                    <select className="crm-select" name="driverFilter" value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
                        <option value="all">All drivers</option>
                        <option value="none">Unassigned only</option>
                        {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.fullName}
                            </option>
                        ))}
                    </select>
                    <label className="schedule-check">
                        <input type="checkbox" name="showCancelled" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
                        Cancelled
                    </label>
                </div>
            </div>

            <div className="schedule-stats">
                <span>
                    <strong>{active.length}</strong> / {capacity} windows booked
                </span>
                {blockedCount > 0 && (
                    <span>
                        <strong>{blockedCount}</strong> blocked
                    </span>
                )}
                {unassigned > 0 && (
                    <span className="schedule-warn">
                        <strong>{unassigned}</strong> without a driver
                    </span>
                )}
            </div>

            {error && <p className="form-inline-error">{error}</p>}
            {notice && <p className="schedule-notice">{notice}</p>}

            {loading && orders.length === 0 && <PageLoader label="Loading schedule…" compact />}
            <div className={`schedule-grid ${loading ? 'is-loading' : ''}`}>
                {days.map((day) => {
                    const dayIso = iso(day);
                    const isToday = dayIso === iso(today);
                    const isPast = day < today;
                    const dayBlocked = '*' in (blocks[dayIso] || {});
                    return (
                        <section key={dayIso} className={`schedule-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}`}>
                            <header>
                                <span>{isToday ? 'Today' : WEEKDAYS[day.getUTCDay()]}</span>
                                <strong>
                                    {MONTHS[day.getUTCMonth()]} {day.getUTCDate()}
                                </strong>
                            </header>
                            {!isPast && (
                                <button
                                    type="button"
                                    className={`schedule-day-block ${dayBlocked ? 'on' : ''}`}
                                    disabled={busyKey !== null}
                                    onClick={() => toggleBlock(dayIso, '*', !dayBlocked)}
                                >
                                    {dayBlocked ? '🔓 Unblock whole day' : '⛔ Block whole day'}
                                </button>
                            )}
                            {SLOTS.map((slot) => {
                                const items = bySlot.get(`${dayIso} ${slot.id}`) || [];
                                const slotBlocked = dayBlocked || slot.id in (blocks[dayIso] || {});
                                return (
                                    <div key={slot.id} className={`schedule-slot ${slotBlocked ? 'blocked' : ''}`}>
                                        <span className="schedule-time">
                                            {slot.label}
                                            {!isPast && !dayBlocked && (
                                                <button
                                                    type="button"
                                                    className="schedule-slot-toggle"
                                                    disabled={busyKey !== null}
                                                    onClick={() => toggleBlock(dayIso, slot.id, !slotBlocked)}
                                                    title={slotBlocked ? 'Make this window bookable again' : 'Customers can’t book this window'}
                                                >
                                                    {slotBlocked ? 'Unblock' : 'Block'}
                                                </button>
                                            )}
                                        </span>
                                        {slotBlocked && <span className="schedule-blocked">⛔ Blocked — not bookable</span>}
                                        {items.length === 0 ? (
                                            !slotBlocked && <span className="schedule-free">Free</span>
                                        ) : (
                                            items.map((o) => (
                                                <button
                                                    key={o.id}
                                                    type="button"
                                                    className={`schedule-job ${o.status} ${o.driver ? '' : 'no-driver'}`}
                                                    onClick={() => onOpen(o.id)}
                                                    title={`${o.pickup?.address} → ${o.dropoff?.address}`}
                                                >
                                                    <strong>{o.customer?.fullName || o.id}</strong>
                                                    <small>{o.vehicle?.name} · {STATUS_LABELS[o.status] || o.status}</small>
                                                    <small className="schedule-driver">{o.driver ? `🚚 ${o.driver.fullName}` : '⚠ No driver'}</small>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                );
                            })}
                        </section>
                    );
                })}
            </div>
        </>
    );
};

export default AdminSchedule;
