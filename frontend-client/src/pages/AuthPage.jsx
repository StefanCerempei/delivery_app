import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Logo from '../components/Logo';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';
import EmailVerifyCard from '../components/EmailVerifyCard';
import { isValidEmail, isValidPhone, birthDateError, maxBirthDate, MIN_AGE } from '../utils/validators';
import './Account.css';

/** Doar adrese interne (ex. „/account”), ca un link extern să nu poată redirecționa după login. */
function safeNext(value) {
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

const AuthPage = ({ mode }) => {
    const isSignup = mode === 'signup';
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const next = safeNext(params.get('next'));
    const { user, authChecked, registerUser, loginUser, logoutUser } = useAuth();
    // Contul nou (sau unul vechi neverificat) trebuie confirmat cu codul din email înainte de a merge mai departe.
    const needsVerification = Boolean(user && user.role !== 'admin' && !user.emailVerified);

    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        document.title = `${isSignup ? 'Create account' : 'Log in'} — RELOQ`;
        setError('');
    }, [isSignup]);

    const goAfterAuth = (u) => navigate(u?.role === 'admin' ? '/admin/dashboard' : next || '/account', { replace: true });

    // Deja autentificat → nu are rost formularul
    useEffect(() => {
        if (authChecked && user && !needsVerification) goAfterAuth(user);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authChecked, user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (isSignup && fullName.trim().length < 2) return setError('Please enter your full name.');
        if (isSignup && !isValidPhone(phone)) return setError('Please enter a valid mobile number, e.g. (508) 555-0192.');
        if (isSignup) {
            const dobError = birthDateError(dateOfBirth);
            if (dobError) return setError(dobError);
        }
        if (!isValidEmail(email)) return setError('Please enter a valid email address.');
        if (isSignup && password.length < 8) return setError('Password must be at least 8 characters.');
        if (!password) return setError('Please enter your password.');

        setBusy(true);
        try {
            if (isSignup) {
                await registerUser({ fullName: fullName.trim(), phone: phone.trim(), dateOfBirth, email: email.trim(), password });
            } else {
                await loginUser(email.trim(), password);
            }
            setPassword('');
            setBusy(false);
            // Redirecționarea o face efectul de mai sus, după verificarea emailului.
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    const switchTo = isSignup ? '/login' : '/signup';
    const switchHref = next ? `${switchTo}?next=${encodeURIComponent(next)}` : switchTo;

    if (needsVerification) {
        return (
            <div className="auth-layout">
                <div className="auth-card">
                    <Link to="/" className="auth-logo" aria-label="RELOQ home">
                        <Logo variant="full" height={52} />
                    </Link>
                    <div className="auth-heading">
                        <h1>Check your email</h1>
                        <p>One last step to activate your account.</p>
                    </div>
                    <EmailVerifyCard />
                    <p className="auth-switch">
                        Wrong email?{' '}
                        <button type="button" className="link-btn" onClick={logoutUser}>
                            Use a different account
                        </button>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-layout">
            <div className="auth-card">
                <Link to="/" className="auth-logo" aria-label="RELOQ home">
                    <Logo variant="full" height={52} />
                </Link>

                <div className="auth-heading">
                    <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
                    <p>
                        {isSignup
                            ? 'Book moves faster and track every order in one place.'
                            : 'Log in to manage your bookings.'}
                    </p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                    {isSignup && (
                        <>
                            <label className="auth-field">
                                <span>Full name</span>
                                <input
                                    id="auth-fullName"
                                    name="fullName"
                                    className="reloq-input"
                                    autoComplete="name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Alex Morgan"
                                />
                            </label>
                            <label className="auth-field">
                                <span>Mobile phone</span>
                                <input
                                    id="auth-phone"
                                    name="phone"
                                    className="reloq-input"
                                    type="tel"
                                    autoComplete="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="(508) 555-0192"
                                />
                            </label>
                            <label className="auth-field">
                                <span>Date of birth</span>
                                <input
                                    id="auth-dateOfBirth"
                                    name="dateOfBirth"
                                    className="reloq-input"
                                    type="date"
                                    autoComplete="bday"
                                    max={maxBirthDate()}
                                    min="1900-01-01"
                                    value={dateOfBirth}
                                    onChange={(e) => setDateOfBirth(e.target.value)}
                                />
                                <small className="auth-hint">You must be at least {MIN_AGE} years old to book with RELOQ.</small>
                            </label>
                        </>
                    )}

                    <label className="auth-field">
                        <span>Email</span>
                        <input
                            id="auth-email"
                            name="email"
                            className="reloq-input"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                        />
                    </label>

                    <label className="auth-field">
                        <span>Password</span>
                        <div className="password-wrap">
                            <input
                                id="auth-password"
                                name="password"
                                className="reloq-input"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete={isSignup ? 'new-password' : 'current-password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                    </label>

                    {error && <p className="form-inline-error">{error}</p>}

                    <Button type="submit" disabled={busy}>
                        {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Log in'}
                    </Button>

                    {isSignup && (
                        <p className="auth-fineprint legal-inline-links">
                            By creating an account you agree to RELOQ’s{' '}
                            <Link to="/terms" target="_blank" rel="noopener">Terms of Service</Link> and{' '}
                            <Link to="/privacy" target="_blank" rel="noopener">Privacy Policy</Link>.
                        </p>
                    )}
                </form>

                <p className="auth-switch">
                    {isSignup ? 'Already have an account?' : 'New to RELOQ?'}{' '}
                    <Link to={switchHref}>{isSignup ? 'Log in' : 'Create an account'}</Link>
                </p>
            </div>

            <Link to="/" className="auth-back">← Back to booking</Link>
        </div>
    );
};

export default AuthPage;
