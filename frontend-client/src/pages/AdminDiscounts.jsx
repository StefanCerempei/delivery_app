import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatMoney } from '../utils/formatters';
import { PageLoader } from '../components/Spinner';

/** Codurile de discount: dispecerul le creează și le pornește / oprește. Fiecare client poate folosi un cod o dată. */
const AdminDiscounts = () => {
    const [discounts, setDiscounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [form, setForm] = useState({ code: '', percent: 10, note: '' });
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState(null);

    useEffect(() => {
        api.adminDiscounts()
            .then(({ discounts }) => setDiscounts(discounts))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    const create = async (e) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            const { discounts } = await api.adminCreateDiscount({
                code: form.code.trim(),
                percent: Number(form.percent),
                note: form.note.trim()
            });
            setDiscounts(discounts);
            setForm({ code: '', percent: 10, note: '' });
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (d) => {
        setError('');
        setBusyId(d.id);
        try {
            const { discounts } = await api.adminToggleDiscount(d.id, !d.active);
            setDiscounts(discounts);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusyId(null);
        }
    };

    return (
        <>
            <form className="admin-card driver-form" onSubmit={create}>
                <h3>New discount code</h3>
                <p className="discount-admin-hint">
                    Takes the percent off the price paid at booking (labor is not discounted). Each customer can use a code once.
                </p>
                <div className="driver-form-grid">
                    <label className="crm-field">
                        <span>Code</span>
                        <input
                            name="code"
                            value={form.code}
                            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                            placeholder="e.g. WELCOME10"
                            maxLength={40}
                            required
                        />
                    </label>
                    <label className="crm-field">
                        <span>Percent off</span>
                        <input
                            name="percent"
                            type="number"
                            min={1}
                            max={100}
                            value={form.percent}
                            onChange={(e) => setForm({ ...form, percent: e.target.value })}
                            required
                        />
                    </label>
                    <label className="crm-field">
                        <span>Note (optional)</span>
                        <input
                            name="note"
                            value={form.note}
                            onChange={(e) => setForm({ ...form, note: e.target.value })}
                            placeholder="e.g. Instagram promo"
                            maxLength={200}
                        />
                    </label>
                </div>
                {error && <p className="form-inline-error">{error}</p>}
                <div className="driver-form-actions">
                    <button type="submit" className="crm-primary-btn" disabled={saving || form.code.length < 3}>
                        {saving ? 'Creating…' : 'Create code'}
                    </button>
                </div>
            </form>

            {loading ? (
                <PageLoader label="Loading discount codes…" compact />
            ) : (
                <div className="admin-table-container">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Off</th>
                                <th>Used</th>
                                <th>Total discounted</th>
                                <th>Note</th>
                                <th>Status</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {discounts.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="empty-cell">No discount codes yet.</td>
                                </tr>
                            )}
                            {discounts.map((d) => (
                                <tr key={d.id}>
                                    <td>
                                        <strong className="discount-code-cell">{d.code}</strong>
                                    </td>
                                    <td>{d.percent}%</td>
                                    <td>{d.uses}</td>
                                    <td>{formatMoney(d.discountTotal)}</td>
                                    <td>{d.note || '—'}</td>
                                    <td>
                                        <span className={`discount-status ${d.active ? 'on' : 'off'}`}>{d.active ? 'Active' : 'Off'}</span>
                                    </td>
                                    <td>
                                        <button type="button" className="crm-ghost-btn" onClick={() => toggle(d)} disabled={busyId === d.id}>
                                            {d.active ? 'Turn off' : 'Turn on'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
};

export default AdminDiscounts;
