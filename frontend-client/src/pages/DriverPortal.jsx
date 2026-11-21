import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';
import Button from '../components/Button';
import { PageLoader } from '../components/Spinner';
import './DriverJob.css';

/** Ziua jobului (ora firmei salvată fără fus → citită cu getUTC*). */
const dayKey = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
function businessToday() {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
            .formatToParts(new Date())
            .map((p) => [p.type, p.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
}

const LABOR_BADGE = {
    pending_review: 'Labor: waiting for dispatch',
    requested: 'Labor: payment requested',
    paid: 'Labor: paid online',
    paid_cash: 'Labor: paid in cash',
    waived: 'Labor: waived'
};

const JobCard = ({ job }) => (
    <Link to={job.jobPath} className={`portal-job ${job.timerRunning ? 'running' : ''}`}>
        <div className="portal-job-top">
            <strong>{job.scheduleText?.split(' • ')[1] || job.scheduleText}</strong>
            <span className="portal-job-code">{job.id}</span>
        </div>
        <span className="portal-job-customer">
            {job.customer || 'Customer'} · {job.vehicle}
        </span>
        <div className="portal-job-stop">
            <span className="job-dot pickup" />
            <div>
                <span>{job.pickup.address}</span>
                {job.pickup.summary && <small>{job.pickup.summary}</small>}
            </div>
        </div>
        <div className="portal-job-stop">
            <span className="job-dot dropoff" />
            <div>
                <span>{job.dropoff.address}</span>
                {job.dropoff.summary && <small>{job.dropoff.summary}</small>}
            </div>
        </div>
        <div className="portal-job-badges">
            {job.timerRunning && <span className="badge live">● Timer running</span>}
            {job.status === 'en_route' && !job.timerRunning && <span className="badge">On the way</span>}
            {job.photos > 0 && <span className="badge">📷 {job.photos}</span>}
            {job.labor && <span className="badge">{job.labor.minutes} min labor</span>}
            {LABOR_BADGE[job.laborStatus] && <span className="badge">{LABOR_BADGE[job.laborStatus]}</span>}
        </div>
    </Link>
);

/** Autentificare: email + parola setată de dispecer; rezervă: link pe email. */
const DriverLogin = ({ error: initialError, onLoggedIn }) => {
    const [mode, setMode] = useState('password'); // password | link
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(initialError || '');

    const login = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            await api.driverLogin(email, password);
            onLoggedIn();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    const sendLink = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            await api.driverLoginLink(email);
            setSent(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="job-card portal-login">
            <h1>Driver panel</h1>
            {mode === 'password' ? (
                <form onSubmit={login} className="portal-login-form">
                    <p className="job-muted">Log in with the email and password you got from dispatch.</p>
                    <input
                        type="email"
                        name="email"
                        autoComplete="username"
                        required
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <div className="portal-password">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            autoComplete="current-password"
                            required
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <button type="button" onClick={() => setShowPassword((v) => !v)}>
                            {showPassword ? 'Hide' : 'Show'}
                        </button>
                    </div>
                    <Button type="submit" loading={busy}>
                        Log in
                    </Button>
                    <button type="button" className="portal-link-btn" onClick={() => (setMode('link'), setError(''))}>
                        Forgot your password? Email me a login link
                    </button>
                </form>
            ) : sent ? (
                <>
                    <p className="job-text">
                        If <strong>{email}</strong> belongs to a RELOQ driver, we just emailed you a login link. Open it on this phone.
                    </p>
                    <button type="button" className="portal-link-btn" onClick={() => (setMode('password'), setSent(false))}>
                        ← Back to log in
                    </button>
                </>
            ) : (
                <form onSubmit={sendLink} className="portal-login-form">
                    <p className="job-muted">We’ll email you a one-time login link. To get a new password, ask dispatch.</p>
                    <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        required
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <Button type="submit" loading={busy}>
                        Email me a login link
                    </Button>
                    <button type="button" className="portal-link-btn" onClick={() => setMode('password')}>
                        ← Back to log in with password
                    </button>
                </form>
            )}
            {error && <p className="job-error">{error}</p>}
        </div>
    );
};

/** /driver — lista joburilor șoferului; /driver/login?token=… deschide sesiunea din email. */
const DriverPortal = () => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [state, setState] = useState({ loading: true, driver: null, active: [], done: [], loginError: '' });

    const load = useCallback(async (quiet = false) => {
        try {
            const data = await api.driverJobs({ quiet });
            setState({ loading: false, driver: data.driver, active: data.active, done: data.done, loginError: '' });
        } catch (err) {
            setState((s) => ({ ...s, loading: false, driver: err.status === 401 ? null : s.driver, error: err.status === 401 ? '' : err.message }));
        }
    }, []);

    useEffect(() => {
        const token = params.get('token');
        if (token) {
            api.driverSession(token)
                .then(() => navigate('/driver', { replace: true }))
                .catch((err) => {
                    navigate('/driver', { replace: true });
                    setState({ loading: false, driver: null, active: [], done: [], loginError: err.message });
                });
            return undefined;
        }
        load();
        // reîmprospătare la revenirea în aplicație și la fiecare 2 minute
        const onVisible = () => document.visibilityState === 'visible' && load(true);
        document.addEventListener('visibilitychange', onVisible);
        const timer = setInterval(() => load(true), 120000);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            clearInterval(timer);
        };
    }, [params, navigate, load]);

    const logout = async () => {
        await api.driverLogout().catch(() => {});
        setState({ loading: false, driver: null, active: [], done: [], loginError: '' });
    };

    const today = businessToday();
    const todays = state.active.filter((j) => dayKey(j.scheduledFor) <= today);
    const upcoming = state.active.filter((j) => dayKey(j.scheduledFor) > today);

    return (
        <div className="job-page">
            <header className="job-header">
                <Logo height={22} />
                {state.driver && (
                    <button type="button" className="portal-logout" onClick={logout}>
                        Log out
                    </button>
                )}
            </header>

            {state.loading ? (
                <PageLoader label="Loading your jobs…" />
            ) : !state.driver ? (
                <DriverLogin error={state.loginError} onLoggedIn={() => load()} />
            ) : (
                <>
                    <div className="portal-hello">
                        <span className="job-label">Driver panel</span>
                        <strong>Hi {state.driver.fullName?.split(' ')[0]}</strong>
                    </div>
                    {state.error && <p className="job-error">{state.error}</p>}

                    <section className="portal-section">
                        <h2>Today</h2>
                        {todays.length ? todays.map((j) => <JobCard key={j.id} job={j} />) : <p className="job-muted">No jobs today.</p>}
                    </section>

                    <section className="portal-section">
                        <h2>Upcoming</h2>
                        {upcoming.length ? (
                            upcoming.map((j) => (
                                <React.Fragment key={j.id}>
                                    <span className="portal-day">{j.scheduleText?.split(' • ')[0]}</span>
                                    <JobCard job={j} />
                                </React.Fragment>
                            ))
                        ) : (
                            <p className="job-muted">No upcoming jobs yet.</p>
                        )}
                    </section>

                    {state.done.length > 0 && (
                        <section className="portal-section">
                            <h2>Completed (last 14 days)</h2>
                            {state.done.map((j) => (
                                <JobCard key={j.id} job={j} />
                            ))}
                        </section>
                    )}
                    <p className="job-footer">Questions about a job? Call dispatch: (508) 816-7230</p>
                </>
            )}
        </div>
    );
};

export default DriverPortal;
