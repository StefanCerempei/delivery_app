import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, jobPhotoUrl } from '../api/client';
import PhotoGallery from '../components/PhotoGallery';
import { PageLoader } from '../components/Spinner';
import Logo from '../components/Logo';
import SignaturePad from '../components/SignaturePad';
import './DriverJob.css';

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null);

/** Faza jobului pentru șofer: before → on the way → timer (running / paused) → done. */
function phase(job) {
    if (job.status === 'cancelled') return 'cancelled';
    if (job.status === 'completed') return 'done';
    if (!job.timeline.enRouteAt) return 'before';
    if (!job.timeline.arrivedAt) return 'on_the_way';
    return job.timeline.pausedAt ? 'paused' : 'running';
}

/** Secundele de lucru (fără pauze) până acum. */
function workedSeconds(job, now) {
    const t = job.timeline;
    if (!t.arrivedAt) return 0;
    const end = t.completedAt ? new Date(t.completedAt).getTime() : now;
    const openPause = t.pausedAt && !t.completedAt ? now - new Date(t.pausedAt).getTime() : 0;
    return Math.max(0, Math.floor((end - new Date(t.arrivedAt).getTime() - openPause) / 1000) - (t.pausedSecs || 0));
}

const clock = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const sec = secs % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const LABOR_TEXT = {
    pending_review: 'Dispatch will review the time and send the customer a payment request.',
    requested: 'Payment request sent to the customer (email + their account).',
    paid: '✓ Customer paid online.',
    paid_cash: '✓ Marked as paid in cash.',
    waived: 'No labor charge for this job.'
};

const CONFIRM = {
    on_my_way: 'Leaving for the pickup now?',
    arrived: 'Arrived at the pickup? The labor timer starts now.',
    completed: 'Job finished? The labor timer stops and can’t be restarted.',
    cash: 'Customer paid the labor in cash?'
};

const SIGN_KIND = { arrived: 'start', completed: 'end' };

/**
 * Ecranul pentru client, pe telefonul șoferului: semnătura la începutul jobului (cu acceptarea termenilor)
 * și la final. Timpul pornește / se oprește doar după semnătură.
 */
const SignatureSheet = ({ action, job, busy, error, onSubmit, onCancel }) => {
    const kind = SIGN_KIND[action];
    const padRef = React.useRef(null);
    const [name, setName] = useState(job.customer?.fullName || '');
    const [terms, setTerms] = useState(false);
    const [signed, setSigned] = useState(false);
    const ready = name.trim().length >= 2 && signed && (kind === 'end' || terms);

    const submit = () => {
        const signature = padRef.current?.toDataURL();
        if (!signature) return;
        onSubmit({ signature, signerName: name.trim(), termsAccepted: kind === 'start' ? terms : undefined });
    };

    return (
        <div className="job-card sig-sheet">
            <span className="job-label">{kind === 'start' ? 'Customer — start of job' : 'Customer — job completed'}</span>
            <h2 className="sig-title">{kind === 'start' ? 'Please sign to start the job' : 'Please sign to confirm the job is complete'}</h2>
            {kind === 'start' ? (
                <div className="sig-terms">
                    <p>
                        <strong>Labor{job.laborRate ? ` (${job.laborRate})` : ''}</strong> is billed from now — crew arrival at pickup — until the
                        job is completed at the destination, in 5-minute increments (rounded up). Waiting time and access delays during this
                        period are included; crew breaks are not billed.
                    </p>
                    <label className="sig-check">
                        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                        <span>
                            I have read and agree to the{' '}
                            <a href="/terms" target="_blank" rel="noopener noreferrer">
                                RELOQ Terms of Service
                            </a>{' '}
                            and authorize the crew to start the job.
                        </span>
                    </label>
                </div>
            ) : (
                <div className="sig-terms">
                    <p>
                        By signing, I confirm that the move{job.timeline?.arrivedAt ? ' that started at the pickup' : ''} is complete and the
                        labor timer can be stopped now. The final labor charge is based on the recorded time, in 5-minute increments.
                    </p>
                </div>
            )}
            <label className="sig-name">
                <span>Customer name</span>
                <input name="signerName" value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} />
            </label>
            <SignaturePad ref={padRef} onChange={setSigned} />
            {error && <p className="job-error">{error}</p>}
            <div className="job-action-row">
                <button className="job-btn primary" disabled={!ready || busy} onClick={submit}>
                    {busy ? 'Saving…' : kind === 'start' ? 'Sign & start timer' : 'Sign & stop timer'}
                </button>
                <button className="job-btn" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
};

/** Pagina de job a șoferului: /job/<token> (fără cont; linkul vine prin email). */
const DriverJobPage = () => {
    const { token } = useParams();
    const [job, setJob] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(null); // acțiunea care așteaptă „Yes”
    const [now, setNow] = useState(Date.now());
    const [hasDriverSession, setHasDriverSession] = useState(false);

    useEffect(() => {
        api.driverMe()
            .then(({ driver }) => setHasDriverSession(Boolean(driver)))
            .catch(() => {});
    }, []);

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

    // Cronometrul afișat (timpul real vine de la server; pagina doar numără între reîmprospătări)
    useEffect(() => {
        if (!job?.timeline.arrivedAt || job.timeline.completedAt || job.timeline.pausedAt) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [job]);

    // Telefonul a stat blocat / aplicația în fundal: reîncărcăm starea reală la revenire
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                setNow(Date.now());
                load();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [load]);

    const act = async (action, body) => {
        setBusy(true);
        setError('');
        try {
            const { job } = await api.jobAction(token, action, body);
            setJob(job);
            setNow(Date.now());
            setConfirming(null);
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

    const stage = phase(job);
    const secs = workedSeconds(job, now);
    const billing = job.laborBilling || { status: 'none' };
    // o acțiune cu confirmare: butonul mare → „Yes / Not yet”
    const ask = (id) => setConfirming(id);
    const phoneHref = job.customer.phone ? `tel:${job.customer.phone.replace(/[^\d+]/g, '')}` : null;

    return (
        <div className="job-page">
            <header className="job-header">
                {hasDriverSession ? (
                    <Link to="/driver" className="job-back">
                        ← My jobs
                    </Link>
                ) : (
                    <Logo height={22} />
                )}
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

            {confirming && SIGN_KIND[confirming] && !job.signatures?.[SIGN_KIND[confirming]] ? (
                <SignatureSheet
                    action={confirming}
                    job={job}
                    busy={busy}
                    error={error}
                    onSubmit={(body) => act(confirming, body)}
                    onCancel={() => {
                        setConfirming(null);
                        setError('');
                    }}
                />
            ) : confirming ? (
                <div className="job-card job-action">
                    <p className="job-confirm-q">{CONFIRM[confirming]}</p>
                    <div className="job-action-row">
                        <button className="job-btn primary" disabled={busy} onClick={() => act(confirming)}>
                            {busy ? 'Saving…' : 'Yes'}
                        </button>
                        <button className="job-btn" disabled={busy} onClick={() => setConfirming(null)}>
                            Not yet
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {stage === 'before' && (
                        <div className="job-card job-action">
                            <button className="job-btn primary big" onClick={() => ask('on_my_way')}>
                                On my way
                            </button>
                            <p className="job-muted">Tap when you leave for the pickup. The customer gets a “crew on the way” email.</p>
                        </div>
                    )}
                    {stage === 'on_the_way' && (
                        <div className="job-card job-action">
                            <button className="job-btn primary big" onClick={() => ask('arrived')}>
                                ▶ Arrived — start labor timer
                            </button>
                            <p className="job-muted">Tap when you reach the pickup address. Labor time starts now.</p>
                        </div>
                    )}
                    {(stage === 'running' || stage === 'paused') && (
                        <div className={`job-card job-action timer-card ${stage}`}>
                            <span className="job-label">{stage === 'paused' ? 'Timer paused' : 'Labor timer'}</span>
                            <span className="timer-clock" aria-live="off">
                                {clock(secs)}
                            </span>
                            {job.laborRate && <span className="job-muted">{job.laborRate}</span>}
                            <div className="job-action-row">
                                {stage === 'running' ? (
                                    <button className="job-btn" disabled={busy} onClick={() => act('pause')}>
                                        ⏸ Pause
                                    </button>
                                ) : (
                                    <button className="job-btn resume" disabled={busy} onClick={() => act('resume')}>
                                        ▶ Resume
                                    </button>
                                )}
                                <button className="job-btn primary" disabled={busy} onClick={() => ask('completed')}>
                                    ■ Stop — done
                                </button>
                            </div>
                            <p className="job-muted">Pause for breaks — paused time isn’t billed. Stop when everything is delivered.</p>
                        </div>
                    )}
                    {stage === 'done' && (
                        <div className="job-card labor-card">
                            <span className="job-label">Labor</span>
                            <span className="timer-clock done">{job.laborActual ? `${job.laborActual.minutes} min` : clock(secs)}</span>
                            {job.laborActual && <strong className="labor-amount">${job.laborActual.amount.toFixed(2)} labor</strong>}
                            {LABOR_TEXT[billing.status] && <p className="labor-status">{LABOR_TEXT[billing.status]}</p>}
                            {['pending_review', 'requested'].includes(billing.status) && (
                                <button className="job-btn" disabled={busy} onClick={() => ask('cash')}>
                                    💵 Customer paid in cash
                                </button>
                            )}
                        </div>
                    )}
                </>
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
                {(job.signatures?.start || job.signatures?.end) && (
                    <p className="job-muted">
                        {job.signatures.start && `✍ Start signed by ${job.signatures.start.signerName} · ${fmtTime(job.signatures.start.signedAt)}`}
                        {job.signatures.start && job.signatures.end && <br />}
                        {job.signatures.end && `✍ End signed by ${job.signatures.end.signerName} · ${fmtTime(job.signatures.end.signedAt)}`}
                    </p>
                )}
                {job.laborActual && (
                    <p className="job-muted">
                        Labor time: <strong>{job.laborActual.elapsedMinutes ?? job.laborActual.minutes} min</strong> → billed{' '}
                        <strong>{job.laborActual.minutes} min</strong> (rounded up to 5 min)
                    </p>
                )}
                {job.laborRate && <p className="job-muted">Labor rate: {job.laborRate}</p>}
            </div>

            <p className="job-footer">Wrong tap or a problem on site? Call dispatch: (508) 816-7230</p>
        </div>
    );
};

export default DriverJobPage;
