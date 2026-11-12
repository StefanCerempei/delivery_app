import React, { useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Link } from 'react-router-dom';
import { useBooking } from '../../context/BookingContext';
import { VEHICLES } from '../../data/vehicles';
import { formatPrice } from '../../utils/formatters';
import { isValidEmail, isValidPhone, birthDateError, maxBirthDate } from '../../utils/validators';
import { api, toLocation } from '../../api/client';
import Button from '../../components/Button';
import EmailVerifyCard from '../../components/EmailVerifyCard';
import { useAuth } from '../../context/AuthContext';

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

// Formularul Stripe preia aspectul aplicației.
const stripeAppearance = {
    theme: 'night',
    variables: {
        colorPrimary: '#ff3f34',
        colorBackground: '#141c2a',
        colorText: '#f1f4f8',
        colorTextSecondary: '#8a949e',
        colorDanger: '#ff7a7a',
        borderRadius: '12px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        spacingUnit: '4px'
    },
    rules: {
        '.Input': { border: '1px solid rgba(255,255,255,0.13)', boxShadow: 'none' },
        '.Input:focus': { border: '1px solid #ff3f34', boxShadow: '0 0 0 4px rgba(255,63,52,0.14)' }
    }
};

function schedulePayload(scheduledTime) {
    if (!scheduledTime || typeof scheduledTime !== 'object') return null;
    return {
        type: 'scheduled',
        date: scheduledTime.dateStr,
        slot: scheduledTime.slotId,
        label: `${scheduledTime.dateLabel} • ${scheduledTime.slotLabel}`
    };
}

/** Formularul de card Stripe (afișat după ce comanda a fost creată pe server). */
const StripePaymentForm = ({ order, onPaid }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [error, setError] = useState('');
    const [isPaying, setIsPaying] = useState(false);

    const handlePay = async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setError('');
        setIsPaying(true);

        const { error: stripeError } = await stripe.confirmPayment({
            elements,
            redirect: 'if_required',
            confirmParams: { return_url: window.location.origin }
        });

        if (stripeError) {
            setError(stripeError.message || 'Your payment could not be processed.');
            setIsPaying(false);
            return;
        }

        try {
            // Serverul verifică la Stripe că plata chiar a intrat, abia apoi marchează comanda ca plătită.
            const { order: updated } = await api.confirmPayment(order.id);
            onPaid(updated);
        } catch (err) {
            setError(err.message);
            setIsPaying(false);
        }
    };

    return (
        <form onSubmit={handlePay}>
            <PaymentElement options={{ layout: 'tabs' }} />
            {error && <p className="form-inline-error">{error}</p>}
            <div className="step-footer">
                <Button type="submit" disabled={!stripe || isPaying}>
                    {isPaying ? 'Processing payment…' : `Pay ${formatPrice(order.totalAmount)}`}
                </Button>
                <p className="trust-note">Card details are handled securely by Stripe and never touch Reloq servers.</p>
            </div>
        </form>
    );
};

const Step5Pay = () => {
    const { bookingData, user, authChecked, registerUser, loginUser, logoutUser, setCompletedOrder } = useBooking();

    const [authMode, setAuthMode] = useState('register');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const [authBusy, setAuthBusy] = useState(false);

    const [paymentsEnabled, setPaymentsEnabled] = useState(false);
    const [order, setOrder] = useState(null);
    const [clientSecret, setClientSecret] = useState(null);
    const [orderError, setOrderError] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const { refresh } = useAuth();
    const verified = Boolean(user?.emailVerified);

    useEffect(() => {
        api.config()
            .then((cfg) => setPaymentsEnabled(Boolean(cfg.paymentsEnabled)))
            .catch(() => setPaymentsEnabled(false));
    }, []);

    const selectedVehicle = VEHICLES.find((v) => v.id === bookingData.vehicle);
    const totalAmount = order?.totalAmount ?? bookingData.priceEstimate?.total ?? null;

    const scheduleText =
        bookingData.scheduledTime && typeof bookingData.scheduledTime === 'object'
            ? `${bookingData.scheduledTime.dateLabel} • ${bookingData.scheduledTime.slotLabel}`
            : 'Arrival window not selected';

    const elementsOptions = useMemo(
        () => (clientSecret ? { clientSecret, appearance: stripeAppearance } : null),
        [clientSecret]
    );

    const handleAccountSubmit = async (e) => {
        e.preventDefault();
        setAuthError('');

        if (authMode === 'register' && fullName.trim().length < 2) return setAuthError('Please enter your full name.');
        if (authMode === 'register' && !isValidPhone(phone))
            return setAuthError('Please enter a valid mobile number (e.g., (415) 555-0192).');
        if (authMode === 'register') {
            const dobError = birthDateError(dateOfBirth);
            if (dobError) return setAuthError(dobError);
        }
        if (!isValidEmail(email)) return setAuthError('Please enter a valid email address.');
        if (authMode === 'register' && password.length < 8)
            return setAuthError('Password must be at least 8 characters.');
        if (!password) return setAuthError('Please enter your password.');

        setAuthBusy(true);
        try {
            if (authMode === 'register') {
                await registerUser({ fullName: fullName.trim(), phone: phone.trim(), dateOfBirth, email: email.trim(), password });
            } else {
                await loginUser(email.trim(), password);
            }
            setPassword('');
        } catch (err) {
            setAuthError(err.message);
        } finally {
            setAuthBusy(false);
        }
    };

    const handleCreateOrder = async () => {
        setOrderError('');
        if (!user) return setOrderError('Please create your Reloq account first to continue.');
        if (!verified) return setOrderError('Please verify your email first.');
        const schedule = schedulePayload(bookingData.scheduledTime);
        if (!schedule) return setOrderError('Please go back and pick a date and arrival window.');
        if (paymentsEnabled && !stripePromise)
            return setOrderError('Online payments are not fully configured yet. Please try again later.');

        setIsCreating(true);
        try {
            const res = await api.createOrder({
                pickup: toLocation(bookingData.pickup),
                dropoff: toLocation(bookingData.dropoff),
                vehicle: bookingData.vehicle,
                schedule,
                itemsDescription: bookingData.itemsDescription,
                photosCount: bookingData.photos?.length || 0
            });
            setOrder(res.order);
            if (res.clientSecret) {
                setClientSecret(res.clientSecret);
            } else {
                setCompletedOrder(res.order); // fără plată online: comanda rămâne „pending_payment”
            }
        } catch (err) {
            if (err.data?.code === 'EMAIL_NOT_VERIFIED') refresh();
            setOrderError(err.message);
        } finally {
            setIsCreating(false);
        }
    };

    const handleSwitchAccount = async () => {
        setOrder(null);
        setClientSecret(null);
        await logoutUser();
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>Account & Payment</h1>
                <p className="subtitle">Create your Reloq account for live crew tracking and complete your booking.</p>
            </div>

            {/* 1. Rezumat comandă */}
            <div className="checkout-recap-card">
                <div className="recap-top-row">
                    <div>
                        <span className="recap-vehicle">{selectedVehicle?.name || 'Reloq'}</span>
                        <span className="recap-sub">{scheduleText}</span>
                    </div>
                    <span className="recap-price">{formatPrice(totalAmount)}</span>
                </div>
                <div className="recap-addresses">
                    <div className="recap-addr-line">
                        <span className="mini-dot blue" />
                        <span>{bookingData.pickup?.address}</span>
                    </div>
                    <div className="recap-addr-line">
                        <span className="mini-dot green" />
                        <span>{bookingData.dropoff?.address}</span>
                    </div>
                </div>
            </div>

            {/* 2. Cont */}
            {!authChecked ? (
                <div className="account-gate-card is-loading">Checking your session…</div>
            ) : !user ? (
                <form className="account-gate-card" onSubmit={handleAccountSubmit} noValidate>
                    <div className="account-gate-header">
                        <span className="step-badge-num">1</span>
                        <div>
                            <strong>{authMode === 'register' ? 'Create your Reloq account' : 'Welcome back'}</strong>
                            <small>Required for SMS updates and live map tracking</small>
                        </div>
                    </div>

                    <div className="auth-tabs">
                        {['register', 'login'].map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                className={`auth-tab ${authMode === mode ? 'active' : ''}`}
                                onClick={() => {
                                    setAuthMode(mode);
                                    setAuthError('');
                                }}
                            >
                                {mode === 'register' ? 'Sign up' : 'Log in'}
                            </button>
                        ))}
                    </div>

                    <div className="auth-fields-grid">
                        {authMode === 'register' && (
                            <>
                                <input
                                    id="checkout-fullName"
                                    name="fullName"
                                    type="text"
                                    className="reloq-input"
                                    placeholder="Full name (e.g., Alex Morgan)"
                                    autoComplete="name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                />
                                <input
                                    id="checkout-phone"
                                    name="phone"
                                    type="tel"
                                    className="reloq-input"
                                    placeholder="Mobile phone (e.g., (415) 555-0192)"
                                    autoComplete="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                />
                                <label className="dob-field">
                                    <span>Date of birth (you must be 18+)</span>
                                    <input
                                        id="checkout-dateOfBirth"
                                        name="dateOfBirth"
                                        type="date"
                                        className="reloq-input"
                                        autoComplete="bday"
                                        max={maxBirthDate()}
                                        min="1900-01-01"
                                        value={dateOfBirth}
                                        onChange={(e) => setDateOfBirth(e.target.value)}
                                    />
                                </label>
                            </>
                        )}
                        <input
                            id="checkout-email"
                            name="email"
                            type="email"
                            className="reloq-input"
                            placeholder="Email address"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <input
                            id="checkout-password"
                            name="password"
                            type="password"
                            className="reloq-input"
                            placeholder={authMode === 'register' ? 'Password (min. 8 characters)' : 'Password'}
                            autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {authMode === 'login' && (
                        <Link to="/forgot-password" target="_blank" rel="noopener" className="auth-forgot">
                            Forgot password?
                        </Link>
                    )}

                    {authError && <p className="form-inline-error">{authError}</p>}

                    <button type="submit" className="create-account-btn" disabled={authBusy}>
                        {authBusy
                            ? 'Please wait…'
                            : authMode === 'register'
                              ? 'Create Reloq account & continue →'
                              : 'Log in & continue →'}
                    </button>

                    <p className="trust-note legal-inline-links auth-consent">
                        By continuing you agree to Reloq’s{' '}
                        <Link to="/terms" target="_blank" rel="noopener">Terms of Service</Link> and{' '}
                        <Link to="/privacy" target="_blank" rel="noopener">Privacy Policy</Link>.
                    </p>
                </form>
            ) : (
                <div className="account-verified-card">
                    <div className="verified-left">
                        <span className="verified-check">✓</span>
                        <div>
                            <strong>{user.fullName}</strong>
                            <small>
                                {user.email}
                                {user.phone ? ` • ${user.phone}` : ''}
                            </small>
                        </div>
                    </div>
                    <button type="button" className="change-account-btn" onClick={handleSwitchAccount}>
                        Switch
                    </button>
                </div>
            )}

            {user && !verified && <EmailVerifyCard stepNumber={2} onVerified={() => setOrderError('')} />}

            {/* 3. Plată */}
            <div className={`payment-card-box ${!user || !verified ? 'locked' : ''}`}>
                <div className="account-gate-header">
                    <span className="step-badge-num">{user && !verified ? 3 : 2}</span>
                    <div>
                        <strong>{paymentsEnabled ? 'Payment details' : 'Confirm booking'}</strong>
                        <small>
                            {!user
                                ? 'Complete step 1 (Reloq account) to unlock payment'
                                : !verified
                                  ? 'Verify your email to unlock booking'
                                : paymentsEnabled
                                  ? 'Secure checkout powered by Stripe'
                                  : 'Pay the crew after the job is done'}
                        </small>
                    </div>
                </div>

                {clientSecret && elementsOptions && stripePromise ? (
                    <Elements stripe={stripePromise} options={elementsOptions}>
                        <StripePaymentForm order={order} onPaid={setCompletedOrder} />
                    </Elements>
                ) : (
                    <>
                        {orderError && <p className="form-inline-error">{orderError}</p>}
                        <div className="step-footer">
                            <Button onClick={handleCreateOrder} disabled={!user || !verified || isCreating || totalAmount == null}>
                                {isCreating
                                    ? 'Creating your booking…'
                                    : paymentsEnabled
                                      ? `Continue to payment • ${formatPrice(totalAmount)}`
                                      : `Book Reloq • ${formatPrice(totalAmount)}`}
                            </Button>
                            <p className="trust-note">
                                Receipt and live tracking link will be sent to {user?.email || 'your email'}
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default Step5Pay;
