import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
import Button from '../components/Button';
import PasswordField from '../components/PasswordField';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isValidEmail } from '../utils/validators';
import './Account.css';

const AuthShell = ({ title, subtitle, children }) => (
    <div className="auth-layout">
        <div className="auth-card">
            <Link to="/" className="auth-logo" aria-label="RELOQ home">
                <Logo variant="full" height={52} />
            </Link>
            <div className="auth-heading">
                <h1>{title}</h1>
                {subtitle && <p>{subtitle}</p>}
            </div>
            {children}
        </div>
        <Link to="/login" className="auth-back">← Back to log in</Link>
    </div>
);

/** /forgot-password — clientul își introduce emailul și primește un link. */
export const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [sentTo, setSentTo] = useState('');

    useEffect(() => {
        document.title = 'Reset password — RELOQ';
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!isValidEmail(email)) return setError('Please enter a valid email address.');
        setBusy(true);
        try {
            await api.forgotPassword(email.trim());
            setSentTo(email.trim());
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    if (sentTo) {
        return (
            <AuthShell title="Check your email">
                <p className="auth-message">
                    If an account exists for <strong>{sentTo}</strong>, we’ve sent a link to reset your password. The link
                    expires in 60 minutes.
                </p>
                <p className="auth-message auth-message-muted">Don’t see it? Check your Spam or Junk folder.</p>
                <button type="button" className="link-btn" onClick={() => setSentTo('')}>
                    Use a different email
                </button>
            </AuthShell>
        );
    }

    return (
        <AuthShell title="Forgot your password?" subtitle="Enter your account email and we’ll send you a reset link.">
            <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <label className="auth-field">
                    <span>Email</span>
                    <input
                        id="forgot-email"
                        name="email"
                        className="reloq-input"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                    />
                </label>
                {error && <p className="form-inline-error">{error}</p>}
                <Button type="submit" disabled={busy}>
                    {busy ? 'Sending…' : 'Send reset link'}
                </Button>
            </form>
        </AuthShell>
    );
};

/** /reset-password?token=… — parola nouă; la final clientul e logat. */
export const ResetPasswordPage = () => {
    const [params] = useSearchParams();
    const token = params.get('token') || '';
    const navigate = useNavigate();
    const { resetPassword } = useAuth();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        document.title = 'Choose a new password — RELOQ';
    }, []);

    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
        return (
            <AuthShell title="Link not valid">
                <p className="auth-message">This reset link is incomplete or invalid. Please request a new one.</p>
                <Link to="/forgot-password" className="lugg-btn lugg-btn-primary">
                    Request a new link
                </Link>
            </AuthShell>
        );
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < 8) return setError('Password must be at least 8 characters.');
        if (password !== confirm) return setError('The passwords don’t match.');
        setBusy(true);
        try {
            const user = await resetPassword(token, password);
            navigate(user.role === 'admin' ? '/admin/dashboard' : '/account', { replace: true });
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <AuthShell title="Choose a new password" subtitle="You’ll be logged in right after. Other devices will be signed out.">
            <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <PasswordField
                    id="reset-password"
                    name="newPassword"
                    label="New password"
                    value={password}
                    onChange={setPassword}
                    placeholder="At least 8 characters"
                />
                <PasswordField
                    id="reset-password-confirm"
                    name="confirmPassword"
                    label="Confirm new password"
                    value={confirm}
                    onChange={setConfirm}
                />
                {error && (
                    <p className="form-inline-error">
                        {error}{' '}
                        {error.includes('expired') && <Link to="/forgot-password">Request a new link</Link>}
                    </p>
                )}
                <Button type="submit" disabled={busy}>
                    {busy ? 'Saving…' : 'Save new password'}
                </Button>
            </form>
        </AuthShell>
    );
};
