import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, jobPhotoUrl } from '../api/client';
import PhotoGallery from '../components/PhotoGallery';
import { PageLoader } from '../components/Spinner';
import Logo from '../components/Logo';
import './DriverJob.css';

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null);

/** Pasul următor al șoferului, după ce s-a raportat deja. */
function nextAction(job) {
    if (job.status === 'cancelled') return null;
    if (job.status === 'completed') return null;
    if (!job.timeline.enRouteAt) return { id: 'on_my_way', label: 'On my way', hint: 'Tap when you leave for the pickup. The customer gets a “crew on the way” email.' };
    if (!job.timeline.arrivedAt) return { id: 'arrived', label: 'Arrived at pickup', hint: 'Tap when you reach the pickup address. Labor time starts now.' };
    return { id: 'completed', label: 'Job completed', hint: 'Tap when everything is delivered at the destination. Labor time stops now.' };
}

/** Pagina de job a șoferului: /job/<token> (fără cont; linkul vine prin email). */
const DriverJobPage = () => {
    const { token } = useParams();
    const [job, setJob] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [now, setNow] = useState(Date.now());

    const load = useCallback(async () => {
        try {
            const { job } = await api.job(token);
            setJob(job);
            setError('');
        } catch (err) {
            setError(err.message);
        }
    }, [token]);

    useEffect(() => {
        load();
    }, [load]);

    // Cronometrul manoperei cât timp jobul e în lucru
    useEffect(() => {
        if (!job?.timeline.arrivedAt || job.timeline.completedAt) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 15000);
        return () => clearInterval(timer);
    }, [job]);

    const act = async (action) => {
        setBusy(true);
        setError('');
        try {
            const { job } = await api.jobAction(token, action);
            setJob(job);
            setConfirming(false);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    if (!job) {
        return (
            <div className="job-page">
                <header className="job-header">
                    <Logo height={22} />
                </header>
                <div className="job-card">
                    {error ? <p className="job-error">{error}</p> : <PageLoader label="Loading job…" compact />}
                </div>
            </div>
        );
    }

    const action = nextAction(job);
    const runningMins =
        job.timeline.arrivedAt && !job.timeline.completedAt ? Math.max(0, Math.ceil((now - new Date(job.timeline.arrivedAt)) / 60000)) : null;
    const phoneHref = job.customer.phone ? `tel:${job.customer.phone.replace(/[^\d+]/g, '')}` : null;

    return (
        <div className="job-page">
            <header className="job-header">
                <Logo height={22} />
                <span className="job-code">{job.id}</span>
            </header>

            <div className="job-card job-when">
                <span className="job-label">Arrival window</span>
                <strong>{job.scheduleText}</strong>
                <span className="job-muted">
                    {job.vehicle?.name}
                    {job.vehicle?.crewLabel ? ` · ${job.vehicle.crewLabel}` : ''}
                </span>
                {job.status === 'cancelled' && <p className="job-banner cancelled">This job was cancelled. You don’t need to go.</p>}
                {job.status === 'completed' && <p className="job-banner done">Job completed — thank you!</p>}
            </div>

            {action && (
                <div className="job-card job-action">
                    {confirming ? (
                        <>
                            <p className="job-confirm-q">{action.label}?</p>
                            <div className="job-action-row">
                                <button className="job-btn primary" disabled={busy} onClick={() => act(action.id)}>
                                    {busy ? 'Saving…' : 'Yes'}
                                </button>
                                <button className="job-btn" disabled={busy} onClick={() => setConfirming(false)}>
                                    Not yet
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <button className="job-btn primary big" onClick={() => setConfirming(true)}>
                                {action.label}
                            </button>
                            <p className="job-muted">{action.hint}</p>
                        </>
                    )}
                    {runningMins !== null && <p className="job-timer">Labor time so far: {runningMins} min</p>}
                </div>
            )}

            {error && <p className="job-error">{error}</p>}

            <div className="job-card">
                <span className="job-label">Customer</span>
                <strong>{job.customer.fullName || '—'}</strong>
                {phoneHref && (
                    <a className="job-btn" href={phoneHref}>
                        📞 Call {job.customer.phone}
                    </a>
                )}
                <span className="job-muted">Call about 45 minutes before you arrive.</span>
            </div>

            <div className="job-card">
                <div className="job-stop">
                    <span className="job-dot pickup" />
                    <div>
                        <span className="job-label">Pickup</span>
                        <strong>{job.pickup.address}</strong>
                        {job.pickup.summary && <span className="job-stop-details">{job.pickup.summary}</span>}
                        {job.pickup.details?.notes && <span className="job-stop-notes">Access: {job.pickup.details.notes}</span>}
                    </div>
                </div>
                <div className="job-stop">
                    <span className="job-dot dropoff" />
                    <div>
                        <span className="job-label">Drop-off</span>
                        <strong>{job.dropoff.address}</strong>
                        {job.dropoff.summary && <span className="job-stop-details">{job.dropoff.summary}</span>}
                        {job.dropoff.details?.notes && <span className="job-stop-notes">Access: {job.dropoff.details.notes}</span>}
                    </div>
                </div>
                {job.routeInfo && (
                    <span className="job-muted">
                        {job.routeInfo.distanceMiles} mi · ~{job.routeInfo.durationMins} min drive
                    </span>
                )}
                <a className="job-btn" href={job.directionsUrl} target="_blank" rel="noreferrer">
                    🗺 Open route in Google Maps
                </a>
            </div>

            <div className="job-card">
                <span className="job-label">Items</span>
                <p className="job-text">{job.itemsDescription || '—'}</p>
                {job.photoIds?.length > 0 && (
                    <>
                        <span className="job-label">Photos ({job.photoIds.length})</span>
                        <PhotoGallery urls={job.photoIds.map((pid) => jobPhotoUrl(token, pid))} />
                    </>
                )}
                {job.dispatchNotes && (
                    <>
                        <span className="job-label">Notes from dispatch</span>
                        <p className="job-text job-notes">{job.dispatchNotes}</p>
                    </>
                )}
            </div>

            <div className="job-card">
                <span className="job-label">Progress</span>
                <ul className="job-timeline">
                    <li className={job.timeline.enRouteAt ? 'done' : ''}>
                        On my way <span>{fmtTime(job.timeline.enRouteAt) || '—'}</span>
                    </li>
                    <li className={job.timeline.arrivedAt ? 'done' : ''}>
                        Arrived <span>{fmtTime(job.timeline.arrivedAt) || '—'}</span>
                    </li>
                    <li className={job.timeline.completedAt ? 'done' : ''}>
                        Completed <span>{fmtTime(job.timeline.completedAt) || '—'}</span>
                    </li>
                </ul>
                {job.laborActual && (
                    <p className="job-muted">
                        Labor time: <strong>{job.laborActual.minutes} min</strong>
                    </p>
                )}
                {job.laborRate && <p className="job-muted">Labor rate: {job.laborRate}</p>}
            </div>

            <p className="job-footer">Wrong tap or a problem on site? Call dispatch: (508) 816-7230</p>
        </div>
    );
};

export default DriverJobPage;
