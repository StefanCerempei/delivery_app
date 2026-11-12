import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const COOLDOWN = 60;

/** Cere codul de 6 cifre trimis pe email. Apare cât timp contul nu are emailul verificat. */
const EmailVerifyCard = ({ onVerified, stepNumber }) => {
    const { user, codeSentAt, sendVerificationCode, verifyEmail } = useAuth();
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [sending, setSending] = useState(false);
    const [wait, setWait] = useState(0);
    const autoSent = useRef(false);
    const inputRef = useRef(null);

    // Numărătoarea până se poate cere un cod nou
    useEffect(() => {
        if (wait <= 0) return undefined;
        const t = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(t);
    }, [wait]);

    const send = async () => {
        setError('');
        setNotice('');
        setSending(true);
        try {
            await sendVerificationCode();
            setNotice(`We sent a new code to ${user.email}.`);
            setWait(COOLDOWN);
        } catch (err) {
            if (err.data?.retryAfter) setWait(err.data.retryAfter);
            else setError(err.message);
        } finally {
            setSending(false);
        }
    };

    // Codul pleacă automat la înregistrare; altfel (ex. cont vechi) îl trimitem acum.
    useEffect(() => {
        if (autoSent.current) return;
        autoSent.current = true;
        const since = Math.floor((Date.now() - codeSentAt) / 1000);
        if (codeSentAt && since < COOLDOWN) {
            setWait(COOLDOWN - since);
        } else {
            send();
        }
        inputRef.current?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const submit = async (value = code) => {
        if (!/^\d{6}$/.test(value)) return setError('Enter the 6-digit code from your email.');
        setError('');
        setBusy(true);
        try {
            const verified = await verifyEmail(value);
            onVerified?.(verified);
        } catch (err) {
            setError(err.message);
            setCode('');
            inputRef.current?.focus();
        } finally {
            setBusy(false);
        }
    };

    const handleChange = (e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
        setCode(digits);
        if (digits.length === 6 && !busy) submit(digits);
    };

    return (
        <form
            className="account-gate-card verify-email-card"
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
            noValidate
        >
            <div className="account-gate-header">
                {stepNumber != null && <span className="step-badge-num">{stepNumber}</span>}
                <div>
                    <strong>Verify your email</strong>
                    <small>
                        Enter the 6-digit code we sent to <b>{user.email}</b>
                    </small>
                </div>
            </div>

            <label className="sr-only" htmlFor="verify-code">
                Verification code
            </label>
            <input
                ref={inputRef}
                id="verify-code"
                name="verificationCode"
                className="reloq-input verify-code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={handleChange}
                disabled={busy}
            />

            {error && <p className="form-inline-error">{error}</p>}
            {!error && notice && <p className="verify-notice">{notice}</p>}

            <button type="submit" className="create-account-btn" disabled={busy || code.length !== 6}>
                {busy ? 'Verifying…' : 'Verify email →'}
            </button>

            <p className="trust-note verify-resend">
                Didn’t get it? Check your Spam folder or{' '}
                <button type="button" className="link-btn" onClick={send} disabled={sending || wait > 0}>
                    {sending ? 'sending…' : wait > 0 ? `resend in ${wait}s` : 'send a new code'}
                </button>
                .
            </p>
        </form>
    );
};

export default EmailVerifyCard;
