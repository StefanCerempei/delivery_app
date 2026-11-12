import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { api } from '../api/client';
import Logo from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import './Admin.css';

const AdminLogin = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();
    const { loginUser, logoutUser } = useAuth();

    // Dacă dispecerul are deja sesiune activă, mergem direct la dashboard.
    useEffect(() => {
        api.me()
            .then(({ user }) => user?.role === 'admin' && navigate('/admin/dashboard', { replace: true }))
            .catch(() => {});
    }, [navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const user = await loginUser(email.trim(), password);
            if (user.role !== 'admin') {
                await logoutUser();
                setError('This account does not have dispatcher access.');
                return;
            }
            navigate('/admin/dashboard', { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="admin-login-layout">
            <div className="admin-login-card">
                <div className="admin-login-brand">
                    <Link to="/" aria-label="RELOQ home">
                        <Logo variant="full" height={56} />
                    </Link>
                    <span className="admin-brand-label">Dispatch console</span>
                </div>

                <form onSubmit={handleLogin} className="admin-login-form">
                    <div className="form-group">
                        <label htmlFor="admin-email">Dispatcher email</label>
                        <input
                            id="admin-email"
                            type="email"
                            className="reloq-input"
                            autoComplete="username"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="admin-password">Password</label>
                        <input
                            id="admin-password"
                            type="password"
                            className="reloq-input"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && <p className="form-inline-error">{error}</p>}

                    <Button type="submit" disabled={busy}>
                        {busy ? 'Signing in…' : 'Sign in'}
                    </Button>
                </form>
            </div>

            <Link to="/" className="auth-back admin-back-link">
                ← Back to RELOQ
            </Link>
        </div>
    );
};

export default AdminLogin;
