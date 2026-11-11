import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import './Admin.css'; // Vom crea acest fișier ulterior

const AdminLogin = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = (e) => {
        e.preventDefault();
        // Validare simplă (hardcodată momentan)
        if (email === 'admin@reloq.com' && password === 'admin123') {
            localStorage.setItem('reloq_admin_auth', 'true');
            navigate('/admin/dashboard');
        } else {
            setError('Email sau parolă incorectă.');
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
                        <label>Email Dispecer</label>
                        <input
                            type="email"
                            className="reloq-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@reloq.com"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Parolă</label>
                        <input
                            type="password"
                            className="reloq-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && <p className="form-inline-error">{error}</p>}

                    <Button type="submit">Autentificare</Button>
                </form>
            </div>
        </div>
    );
};

export default AdminLogin;