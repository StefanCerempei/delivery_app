import React, { useState } from 'react';
import { api } from '../api/client';
import { initials } from '../context/AuthContext';

const EMPTY_FORM = { fullName: '', email: '', phone: '', notes: '' };

/** Formular pentru adăugare / editare șofer. */
const DriverForm = ({ initial, onSaved, onCancel }) => {
    const [form, setForm] = useState(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const editing = Boolean(initial?.id);

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        const payload = {
            fullName: form.fullName,
            email: form.email,
            phone: form.phone || null,
            notes: form.notes || null
        };
        try {
            const { driver } = editing
                ? await api.adminUpdateDriver(initial.id, payload)
                : await api.adminCreateDriver(payload);
            onSaved(driver);
        } catch (err) {
            setError(err.message);
            setSaving(false);
        }
    };

    return (
        <form className="admin-card driver-form" onSubmit={submit}>
            <h3>{editing ? `Edit ${initial.fullName}` : 'Add a driver'}</h3>
            <div className="driver-form-grid">
                <label className="crm-field">
                    <span>Full name</span>
                    <input name="fullName" value={form.fullName} onChange={set('fullName')} required autoFocus />
                </label>
                <label className="crm-field">
                    <span>Email (job notifications go here)</span>
                    <input name="email" type="email" value={form.email} onChange={set('email')} required />
                </label>
                <label className="crm-field">
                    <span>Phone</span>
                    <input name="phone" type="tel" value={form.phone || ''} onChange={set('phone')} />
                </label>
                <label className="crm-field">
                    <span>Notes (truck, license, availability…)</span>
                    <input name="notes" value={form.notes || ''} onChange={set('notes')} maxLength={500} />
                </label>
            </div>
            {error && <p className="form-inline-error">{error}</p>}
            <div className="driver-form-actions">
                <button type="button" className="crm-ghost-btn" onClick={onCancel} disabled={saving}>
                    Cancel
                </button>
                <button type="submit" className="crm-primary-btn" disabled={saving}>
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Add driver'}
                </button>
            </div>
        </form>
    );
};

/** Pagina „Drivers” din dispecerat: lista de șoferi / angajați, adăugare, editare, arhivare. */
const AdminDrivers = ({ drivers, setDrivers, loading, search, onError }) => {
    const [editing, setEditing] = useState(null); // null | 'new' | driver
    const [busyId, setBusyId] = useState(null);

    const upsert = (driver) => {
        setDrivers((list) => {
            const exists = list.some((d) => d.id === driver.id);
            return exists ? list.map((d) => (d.id === driver.id ? driver : d)) : [...list, driver];
        });
        setEditing(null);
    };

    const run = async (driver, action) => {
        onError('');
        setBusyId(driver.id);
        try {
            await action();
        } catch (err) {
            onError(err.message);
        } finally {
            setBusyId(null);
        }
    };

    const toggleActive = (driver) =>
        run(driver, async () => {
            const { driver: updated } = await api.adminUpdateDriver(driver.id, { active: !driver.active });
            upsert(updated);
        });

    const remove = (driver) => {
        if (!window.confirm(`Remove ${driver.fullName}? Drivers with past jobs are archived instead of deleted.`)) return;
        run(driver, async () => {
            const result = await api.adminDeleteDriver(driver.id);
            if (result.deleted) setDrivers((list) => list.filter((d) => d.id !== driver.id));
            else if (result.driver) upsert(result.driver);
        });
    };

    const q = search.trim().toLowerCase();
    const visible = drivers.filter(
        (d) => !q || [d.fullName, d.email, d.phone, d.notes].some((v) => String(v || '').toLowerCase().includes(q))
    );

    return (
        <>
            <div className="crm-section-head">
                <h2>
                    Drivers &amp; crew <span className="filter-count">{drivers.filter((d) => d.active).length} active</span>
                </h2>
                {editing === null && (
                    <button className="crm-primary-btn" onClick={() => setEditing('new')}>
                        + Add driver
                    </button>
                )}
            </div>

            {editing !== null && (
                <DriverForm
                    key={editing === 'new' ? 'new' : editing.id}
                    initial={editing === 'new' ? null : editing}
                    onSaved={upsert}
                    onCancel={() => setEditing(null)}
                />
            )}

            <div className="admin-table-container">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Driver</th>
                            <th>Contact</th>
                            <th>Upcoming jobs</th>
                            <th>Completed</th>
                            <th>Status</th>
                            <th aria-label="Actions" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="6" className="empty-state">Loading…</td>
                            </tr>
                        ) : visible.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="empty-state">
                                    {drivers.length === 0
                                        ? 'No drivers yet. Add your first driver to assign them to orders.'
                                        : 'No drivers match your search.'}
                                </td>
                            </tr>
                        ) : (
                            visible.map((d) => (
                                <tr key={d.id} className={d.active ? '' : 'row-muted'}>
                                    <td>
                                        <div className="cell-user">
                                            <span className="cell-avatar">{initials(d.fullName)}</span>
                                            <div className="client-info">
                                                <strong>{d.fullName}</strong>
                                                {d.notes && <small>{d.notes}</small>}
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="client-info">
                                            <span>{d.email}</span>
                                            <small>{d.phone || ''}</small>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="client-info">
                                            <span>{d.upcomingJobs}</span>
                                            {d.nextJob && <small>Next: {d.nextJob}</small>}
                                        </div>
                                    </td>
                                    <td>{d.completedJobs}</td>
                                    <td>
                                        <span className={`status-badge ${d.active ? 'completed' : 'cancelled'}`}>
                                            {d.active ? 'Active' : 'Archived'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="driver-actions">
                                            <button className="crm-ghost-btn" disabled={busyId === d.id} onClick={() => setEditing(d)}>
                                                Edit
                                            </button>
                                            <button className="crm-ghost-btn" disabled={busyId === d.id} onClick={() => toggleActive(d)}>
                                                {d.active ? 'Archive' : 'Reactivate'}
                                            </button>
                                            <button className="crm-ghost-btn danger" disabled={busyId === d.id} onClick={() => remove(d)}>
                                                Remove
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
};

export default AdminDrivers;
