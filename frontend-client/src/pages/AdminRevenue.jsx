import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { formatMoney } from '../utils/formatters';
import { PageLoader } from '../components/Spinner';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const parse = (s) => new Date(`${s}T00:00:00Z`);

/** Azi în fusul firmei (Massachusetts), ca dată UTC la miezul nopții. */
function businessToday() {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
            .formatToParts(new Date())
            .map((p) => [p.type, p.value])
    );
    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

function presetRange(id, today) {
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    switch (id) {
        case 'week': {
            const mondayOffset = (today.getUTCDay() + 6) % 7;
            const start = addDays(today, -mondayOffset);
            return [start, addDays(start, 6)];
        }
        case 'month':
            return [new Date(Date.UTC(y, m, 1)), new Date(Date.UTC(y, m + 1, 0))];
        case 'last_month':
            return [new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 0))];
        case '30d':
            return [addDays(today, -29), today];
        case 'year':
            return [new Date(Date.UTC(y, 0, 1)), new Date(Date.UTC(y, 11, 31))];
        default:
            return null;
    }
}

const PRESETS = [
    { id: 'week', label: 'This week' },
    { id: 'month', label: 'This month' },
    { id: 'last_month', label: 'Last month' },
    { id: '30d', label: 'Last 30 days' },
    { id: 'year', label: 'This year' },
    { id: 'custom', label: 'Custom' }
];

const shortDate = (s) => {
    const d = parse(s);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** Zilele grupate pe zi / săptămână / lună, după lungimea perioadei. */
function groupSeries(series) {
    if (series.length <= 35) return series.map((d) => ({ ...d, label: shortDate(d.date), title: shortDate(d.date) }));
    const byMonth = series.length > 120;
    const groups = new Map();
    for (const d of series) {
        const date = parse(d.date);
        let key;
        let label;
        if (byMonth) {
            key = d.date.slice(0, 7);
            label = MONTHS[date.getUTCMonth()];
        } else {
            const monday = addDays(date, -((date.getUTCDay() + 6) % 7));
            key = iso(monday);
            label = shortDate(key);
        }
        const g = groups.get(key) || { date: key, label, title: byMonth ? `${label} ${date.getUTCFullYear()}` : `Week of ${label}`, booking: 0, labor: 0, jobs: 0 };
        g.booking += d.booking;
        g.labor += d.labor;
        g.jobs += d.jobs;
        groups.set(key, g);
    }
    return [...groups.values()];
}

/** Rotunjire „frumoasă” pentru axa Y. */
function niceMax(v) {
    if (v <= 0) return 100;
    const exp = 10 ** Math.floor(Math.log10(v));
    const n = v / exp;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * exp;
}

const compactMoney = (v) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`);

/** Bare stivuite: plăți la rezervare + manoperă, pe zi / săptămână / lună. */
const RevenueChart = ({ data }) => {
    const wrapRef = useRef(null);
    const [width, setWidth] = useState(700);
    const [hover, setHover] = useState(null);

    useLayoutEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const H = 240;
    const pad = { top: 12, right: 8, bottom: 26, left: 48 };
    const innerW = width - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;
    const max = niceMax(Math.max(...data.map((d) => d.booking + d.labor), 0));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
    const slot = innerW / Math.max(data.length, 1);
    const barW = Math.max(3, Math.min(36, slot * 0.62));
    const y = (v) => pad.top + innerH - (v / max) * innerH;
    const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 56)));

    // Bară cu colțurile de sus rotunjite (4px), baza dreaptă pe axă
    const topRounded = (x, yTop, w, h, r) => {
        const rr = Math.min(r, w / 2, h);
        return `M${x},${yTop + h}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${yTop + h}Z`;
    };

    const hovered = hover !== null ? data[hover] : null;

    return (
        <div className="rev-chart" ref={wrapRef}>
            <svg width={width} height={H} role="img" aria-label="Gross revenue over time: booking payments and labor">
                {ticks.map((t) => (
                    <g key={t}>
                        <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'rev-axis' : 'rev-grid'} />
                        <text x={pad.left - 8} y={y(t)} className="rev-tick" textAnchor="end" dominantBaseline="middle">
                            {compactMoney(t)}
                        </text>
                    </g>
                ))}
                {data.map((d, i) => {
                    const cx = pad.left + slot * i + slot / 2;
                    const x = cx - barW / 2;
                    const total = d.booking + d.labor;
                    const hb = (d.booking / max) * innerH;
                    const hl = (d.labor / max) * innerH;
                    const gap = d.booking > 0 && d.labor > 0 ? 2 : 0;
                    return (
                        <g key={d.date} className={hover !== null && hover !== i ? 'rev-dim' : ''}>
                            {d.booking > 0 && (
                                <path
                                    d={d.labor > 0 ? `M${x},${y(0)}V${y(d.booking)}H${x + barW}V${y(0)}Z` : topRounded(x, y(d.booking), barW, hb, 4)}
                                    className="rev-bar booking"
                                />
                            )}
                            {d.labor > 0 && <path d={topRounded(x, y(total), barW, Math.max(0, hl - gap), 4)} className="rev-bar labor" />}
                            {i % labelEvery === 0 && (
                                <text x={cx} y={H - 8} className="rev-tick" textAnchor="middle">
                                    {d.label}
                                </text>
                            )}
                            {/* Zonă de hover mai mare decât bara */}
                            <rect
                                x={pad.left + slot * i}
                                y={pad.top}
                                width={slot}
                                height={innerH}
                                fill="transparent"
                                onMouseEnter={() => setHover(i)}
                                onMouseLeave={() => setHover(null)}
                                onTouchStart={() => setHover(i)}
                            />
                        </g>
                    );
                })}
            </svg>
            {hovered && (
                <div
                    className="rev-tooltip"
                    style={{
                        left: Math.min(Math.max(pad.left + slot * hover + slot / 2, 90), width - 90),
                        top: Math.max(0, y(hovered.booking + hovered.labor) - 8)
                    }}
                >
                    <strong>{hovered.title}</strong>
                    <span>
                        <i className="rev-swatch booking" /> Booking {formatMoney(hovered.booking)}
                    </span>
                    <span>
                        <i className="rev-swatch labor" /> Labor {formatMoney(hovered.labor)}
                    </span>
                    <span className="rev-tooltip-total">
                        Gross {formatMoney(hovered.booking + hovered.labor)} · {hovered.jobs} job{hovered.jobs === 1 ? '' : 's'}
                    </span>
                </div>
            )}
        </div>
    );
};

/** Pagina „Revenue”: venitul brut (înainte de taxe, plata șoferilor și alte costuri). */
const AdminRevenue = ({ refreshKey }) => {
    const today = useMemo(businessToday, []);
    const [preset, setPreset] = useState('month');
    const [range, setRange] = useState(() => presetRange('month', today).map(iso));
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [showTable, setShowTable] = useState(false);

    const choosePreset = (id) => {
        setPreset(id);
        const r = presetRange(id, today);
        if (r) setRange(r.map(iso));
    };

    const load = useCallback(async () => {
        if (!range[0] || !range[1] || range[1] < range[0]) return;
        setLoading(true);
        setError('');
        try {
            setData(await api.adminRevenue(range[0], range[1]));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [range]);

    useEffect(() => {
        load();
    }, [load, refreshKey]);

    const grouped = useMemo(() => (data ? groupSeries(data.series) : []), [data]);
    const t = data?.totals;

    const exportCsv = () => {
        const cols = ['Order', 'Job date', 'Status', 'Customer', 'Vehicle', 'Driver', 'Payment', 'Booking', 'Labor min', 'Labor', 'Gross'];
        const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [cols.join(',')];
        for (const o of data.orders) {
            lines.push(
                [o.id, o.date, o.status, o.customer, o.vehicle, o.driver, o.paymentMethod, o.booking.toFixed(2), o.laborMinutes ?? '', o.labor.toFixed(2), o.gross.toFixed(2)]
                    .map(cell)
                    .join(',')
            );
        }
        lines.push(['TOTAL', '', '', '', '', '', '', t.booking.toFixed(2), t.laborMinutes, t.labor.toFixed(2), t.gross.toFixed(2)].map(cell).join(','));
        const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `reloq-revenue-${range[0]}_${range[1]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const BREAKDOWN = t
        ? [
              ['Reservation fees', t.reservation],
              ['Service fees', t.service],
              ['Transportation', t.transportation],
              ...(t.other ? [['Older pricing (not split)', t.other]] : []),
              ['Booking payments', t.booking, 'sub'],
              ['Labor (Arrived → Completed)', t.labor],
              ['Gross revenue', t.gross, 'total']
          ]
        : [];

    return (
        <>
            <div className="rev-toolbar">
                <div className="filter-chips">
                    {PRESETS.map((p) => (
                        <button key={p.id} className={`filter-chip ${preset === p.id ? 'active' : ''}`} onClick={() => choosePreset(p.id)}>
                            {p.label}
                        </button>
                    ))}
                </div>
                <div className="rev-dates">
                    <input
                        type="date"
                        name="revenueFrom"
                        className="crm-select"
                        value={range[0]}
                        max={range[1]}
                        onChange={(e) => {
                            setPreset('custom');
                            setRange([e.target.value, range[1]]);
                        }}
                    />
                    <span>→</span>
                    <input
                        type="date"
                        name="revenueTo"
                        className="crm-select"
                        value={range[1]}
                        min={range[0]}
                        onChange={(e) => {
                            setPreset('custom');
                            setRange([range[0], e.target.value]);
                        }}
                    />
                    <button className="crm-export" onClick={exportCsv} disabled={!data?.orders?.length}>
                        ↓ CSV
                    </button>
                </div>
            </div>

            {error && <p className="form-inline-error">{error}</p>}

            {t && (
                <div className={loading ? 'rev-loading' : ''}>
                    <div className="kpi-row rev-kpis">
                        <div className="kpi-card accent rev-hero">
                            <span className="kpi-label">Gross revenue</span>
                            <span className="kpi-value">{formatMoney(t.gross)}</span>
                            <small className="rev-kpi-sub">Before taxes, driver pay &amp; costs</small>
                        </div>
                        <div className="kpi-card">
                            <span className="kpi-label">Booking payments</span>
                            <span className="kpi-value">{formatMoney(t.booking)}</span>
                        </div>
                        <div className="kpi-card">
                            <span className="kpi-label">Labor</span>
                            <span className="kpi-value">{formatMoney(t.labor)}</span>
                            <small className="rev-kpi-sub">{t.laborMinutes} min billed</small>
                        </div>
                        <div className="kpi-card">
                            <span className="kpi-label">Jobs</span>
                            <span className="kpi-value">{t.jobs}</span>
                            <small className="rev-kpi-sub">{t.completedJobs} completed</small>
                        </div>
                        <div className="kpi-card">
                            <span className="kpi-label">Avg per job</span>
                            <span className="kpi-value">{formatMoney(t.avgPerJob)}</span>
                        </div>
                    </div>

                    <div className="admin-card rev-chart-card">
                        <div className="rev-chart-head">
                            <h3>Gross revenue by {data.series.length > 120 ? 'month' : data.series.length > 35 ? 'week' : 'day'}</h3>
                            <div className="rev-legend">
                                <span>
                                    <i className="rev-swatch booking" /> Booking payments
                                </span>
                                <span>
                                    <i className="rev-swatch labor" /> Labor
                                </span>
                                <button className="crm-link-btn" onClick={() => setShowTable((v) => !v)}>
                                    {showTable ? 'Show chart' : 'Show table'}
                                </button>
                            </div>
                        </div>
                        {t.jobs === 0 ? (
                            <p className="empty-state">No paid or confirmed jobs in this period.</p>
                        ) : showTable ? (
                            <div className="admin-table-container">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Period</th>
                                            <th>Jobs</th>
                                            <th>Booking</th>
                                            <th>Labor</th>
                                            <th>Gross</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {grouped
                                            .filter((g) => g.jobs > 0)
                                            .map((g) => (
                                                <tr key={g.date}>
                                                    <td>{g.title}</td>
                                                    <td>{g.jobs}</td>
                                                    <td>{formatMoney(g.booking)}</td>
                                                    <td>{formatMoney(g.labor)}</td>
                                                    <td>
                                                        <strong>{formatMoney(g.booking + g.labor)}</strong>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <RevenueChart data={grouped} />
                        )}
                    </div>

                    <div className="record-grid rev-grid-3">
                        <div className="admin-card">
                            <h3>Breakdown</h3>
                            {BREAKDOWN.map(([label, value, kind]) => (
                                <div key={label} className={`record-row ${kind ? `rev-${kind}` : ''}`}>
                                    <span className="record-label">{label}</span>
                                    <span className="record-value">{formatMoney(value)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="admin-card">
                            <h3>By vehicle</h3>
                            {data.byVehicle.length === 0 && <p className="record-sub">—</p>}
                            {data.byVehicle.map((v) => (
                                <div key={v.id} className="record-row">
                                    <span className="record-label">
                                        {v.name} <small>· {v.jobs} job{v.jobs === 1 ? '' : 's'}</small>
                                    </span>
                                    <span className="record-value">{formatMoney(v.gross)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="admin-card">
                            <h3>By driver</h3>
                            {data.byDriver.length === 0 && <p className="record-sub">—</p>}
                            {data.byDriver.map((d) => (
                                <div key={d.id ?? 'none'} className="record-row">
                                    <span className="record-label">
                                        {d.name}{' '}
                                        <small>
                                            · {d.jobs} job{d.jobs === 1 ? '' : 's'}
                                            {d.laborMinutes ? ` · ${d.laborMinutes} min` : ''}
                                        </small>
                                    </span>
                                    <span className="record-value">{formatMoney(d.gross)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {(t.laborMissing > 0 || t.cancelledPaid.count > 0) && (
                        <div className="rev-notes">
                            {t.laborMissing > 0 && (
                                <p>
                                    ⚠ {t.laborMissing} completed job{t.laborMissing === 1 ? ' has' : 's have'} no Arrived/Completed times, so
                                    their labor isn’t counted.
                                </p>
                            )}
                            {t.cancelledPaid.count > 0 && (
                                <p>
                                    ⚠ {t.cancelledPaid.count} paid order{t.cancelledPaid.count === 1 ? ' was' : 's were'} cancelled (
                                    {formatMoney(t.cancelledPaid.amount)}) — not counted. Check whether they were refunded in Stripe / PayPal.
                                </p>
                            )}
                        </div>
                    )}
                    <p className="record-sub rev-footnote">
                        Gross revenue = everything customers pay: booking payments (reservation + service + transportation) plus labor,
                        by job date. Taxes, driver pay, card fees and other costs are not deducted.
                    </p>
                </div>
            )}
            {!t && loading && <PageLoader label="Calculating revenue…" />}
        </>
    );
};

export default AdminRevenue;
