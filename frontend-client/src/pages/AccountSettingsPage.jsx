import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import Button from '../components/Button';
import PasswordField from '../components/PasswordField';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isValidPhone } from '../utils/validators';
import './Account.css';

const AccountSettingsPage = () => {
    const navigate = useNavigate();
    const { user, authChecked, updateProfile, logoutUser } = useAuth();

    useEffect(() => {
        document.title = 'Account settings — RELOQ';
    }, []);

    useEffect(() => {
        if (!authChecked) return;
        if (!user || (user.role !== 'admin' && !user.emailVerified)) {
            navigate('/login?next=/account/settings', { replace: true });
        }
    }, [authChecked, user, navigate]);

    if (!authChecked || !user) {
        return <div className="account-layout account-loading">Loading…</div>;
    }

    return (
        <div className="account-layout">
            <header className="account-header">
                <Link to="/" aria-label="RELOQ home">
                    <Logo height={26} />
                </Link>
                <div className="account-header-actions">
                    <Link to="/account" className="change-account-btn">
                        ← My orders
                    </Link>
                    <button
                        type="button"
                        className="change-account-btn"
                        onClick={async () => {
                            await logoutUser();
                            navigate('/', { replace: true });
                        }}
                    >
                        Log out
                    </button>
                </div>
            </header>

            <main className="account-main settings-main">
                <h1 className="settings-title">Account settings</h1>
                <ProfileForm user={user} updateProfile={updateProfile} />
                <PasswordForm />
                <section className="settings-card">
                    <h2>Email</h2>
                    <p className="settings-readonly">{user.email}</p>
                    <p className="settings-note">
                        To change the email on your account, contact us at{' '}
                        <a href="mailto:info@reloqmove.com">info@reloqmove.com</a>.
                    </p>
                </section>
            </main>
        </div>
    );
};

const ProfileForm = ({ user, updateProfile }) => {
    const [fullName, setFullName] = useState(user.fullName || '');
    const [phone, setPhone] = useState(user.phone || '');
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);

    const dirty = fullName.trim() !== (user.fullName || '') || phone.trim() !== (user.phone || '');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSaved(false);
        if (fullName.trim().length < 2) return setError('Please enter your full name.');
        if (!isValidPhone(phone)) return setError('Please enter a valid mobile number, e.g. (508) 555-0192.');
        setBusy(true);
        try {
            await updateProfile({ fullName: fullName.trim(), phone: phone.trim() });
            setSaved(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="settings-card auth-form" onSubmit={handleSubmit} noValidate>
            <h2>Personal details</h2>
            <label className="auth-field">
                <span>Full name</span>
                <input
                    id="settings-fullName"
                    name="fullName"
                    className="reloq-input"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => {
                        setFullName(e.target.value);
                        setSaved(false);
                    }}
                />
            </label>
            <label className="auth-field">
                <span>Mobile phone</span>
                <input
                    id="settings-phone"
                    name="phone"
                    className="reloq-input"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => {
                        setPhone(e.target.value);
                        setSaved(false);
                    }}
                />
            </label>
            {error && <p className="form-inline-error">{error}</p>}
            {saved && <p className="settings-success">Your details were saved.</p>}
            <Button type="submit" disabled={busy || !dirty}>
                {busy ? 'Saving…' : 'Save changes'}
            </Button>
        </form>
    );
};

const PasswordForm = () => {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSaved(false);
        if (!current) return setError('Please enter your current password.');
        if (next.length < 8) return setError('New password must be at least 8 characters.');
        if (next !== confirm) return setError('The new passwords don’t match.');
        setBusy(true);
        try {
            await api.changePassword(current, next);
            setCurrent('');
            setNext('');
            setConfirm('');
            setSaved(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className="settings-card auth-form" onSubmit={handleSubmit} noValidate>
            <h2>Password</h2>
            {/* câmp ascuns pentru managerele de parole */}
            <input type="text" name="username" autoComplete="username" hidden readOnly />
            <PasswordField
                id="settings-currentPassword"
                name="currentPassword"
                label="Current password"
                autoComplete="current-password"
                value={current}
                onChange={setCurrent}
            />
            <PasswordField
                id="settings-newPassword"
                name="newPassword"
                label="New password"
                value={next}
                onChange={setNext}
                placeholder="At least 8 characters"
            />
            <PasswordField
                id="settings-confirmPassword"
                name="confirmPassword"
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
            />
            {error && <p className="form-inline-error">{error}</p>}
            {saved && <p className="settings-success">Password updated. Other devices were signed out.</p>}
            <Button type="submit" disabled={busy}>
                {busy ? 'Updating…' : 'Update password'}
            </Button>
            <p className="settings-note">
                Forgot your current password? <Link to="/forgot-password">Reset it by email</Link>.
            </p>
        </form>
    );
};

export default AccountSettingsPage;
