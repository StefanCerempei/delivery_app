import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { api } from '../api/client';
import './Admin.css';

const AdminLogin = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();

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
            const { user } = await api.login(email.trim(), password);
            if (user.role !== 'admin') {
                await api.logout();
                setError('Acest cont nu are acces la dispecerat.');
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
                <div className="admin-brand">
                    <span className="brand-dot" />
                    <h2>RELOQ ADMIN</h2>
                </div>

                <form onSubmit={handleLogin} className="admin-login-form">
                    <div className="form-group">
                        <label htmlFor="admin-email">Email dispecer</label>
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
                        <label htmlFor="admin-password">Parolă</label>
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
                        {busy ? 'Se verifică…' : 'Autentificare'}
                    </Button>
                </form>
            </div>
        </div>
    );
};

export default AdminLogin;
