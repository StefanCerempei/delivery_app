import React, { useEffect, useState } from 'react';
import { stripePromise, stripeAppearance } from '../../utils/stripe';
import { Link } from 'react-router-dom';
import { useBooking, PAYMENT_RETURN_PARAM } from '../../context/BookingContext';
import { VEHICLES } from '../../data/vehicles';
import { formatPrice } from '../../utils/formatters';
import { isValidEmail, isValidPhone, formatUsPhone } from '../../utils/validators';
import { api, toLocation, uploadOrderPhoto } from '../../api/client';
import Button from '../../components/Button';
import EmailVerifyCard from '../../components/EmailVerifyCard';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';
import { describeDetails } from '../../components/LocationDetails';
import { useAuth } from '../../context/AuthContext';

// Stripe și aspectul formularului: comune cu plata manoperei (utils/stripe.js)

/** Detaliile locației pentru server (lipsă = draft vechi, fără detalii). */
function cleanDetails(d) {
    if (!d?.floor) return undefined;
    return {
        unit: (d.unit || '').trim(),
        floor: d.floor,
        elevator: d.floor === 'ground' ? null : d.elevator,
        notes: (d.notes || '').trim()
    };
}

function schedulePayload(scheduledTime) {
    if (!scheduledTime || typeof scheduledTime !== 'object') return null;
    return {
        type: 'scheduled',
        date: scheduledTime.dateStr,
        slot: scheduledTime.slotId,
        label: `${scheduledTime.dateLabel} • ${scheduledTime.slotLabel}`
    };
}

const Step5Pay = () => {
    const { bookingData, user, authChecked, registerUser, loginUser, logoutUser, setCompletedOrder, paymentNotice, setPaymentNotice, setCurrentStep } =
        useBooking();

    const [authMode, setAuthMode] = useState('register');
    // Ora aleasă a fost rezervată între timp de alt client → buton înapoi la alegerea orei
    const [slotTaken, setSlotTaken] = useState(false);
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [ageConfirmed, setAgeConfirmed] = useState(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');
    const [authBusy, setAuthBusy] = useState(false);

    const [paymentsEnabled, setPaymentsEnabled] = useState(false);
    const [paypalClientId, setPaypalClientId] = useState(null);
    const [order, setOrder] = useState(null);
    const [clientSecret, setClientSecret] = useState(null);
    const [orderError, setOrderError] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    // Încărcarea pozelor după crearea comenzii: { done, total } sau null
    const [photoUpload, setPhotoUpload] = useState(null);
    const [photoNotice, setPhotoNotice] = useState('');
    const { refresh } = useAuth();
    const verified = Boolean(user?.emailVerified);

    useEffect(() => {
        api.config()
            .then((cfg) => {
                setPaymentsEnabled(Boolean(cfg.paymentsEnabled));
                setPaypalClientId(cfg.paypalClientId || null);
            })
            .catch(() => setPaymentsEnabled(false));
    }, []);

    const selectedVehicle = VEHICLES.find((v) => v.id === bookingData.vehicle);
    const totalAmount = order?.totalAmount ?? bookingData.priceEstimate?.total ?? null;

    const scheduleText =
        bookingData.scheduledTime && typeof bookingData.scheduledTime === 'object'
            ? `${bookingData.scheduledTime.dateLabel} • ${bookingData.scheduledTime.slotLabel}`
            : 'Arrival window not selected';

    const handleAccountSubmit = async (e) => {
        e.preventDefault();
        setAuthError('');

        if (authMode === 'register' && fullName.trim().length < 2) return setAuthError('Please enter your full name.');
        if (authMode === 'register' && !isValidPhone(phone))
            return setAuthError('Please enter a valid US mobile number, e.g. (508) 555-0192.');
        if (authMode === 'register' && ageConfirmed !== true) return setAuthError('Please confirm you are 18 or older to book with RELOQ.');
        if (!isValidEmail(email)) return setAuthError('Please enter a valid email address.');
        if (authMode === 'register' && password.length < 8)
            return setAuthError('Password must be at least 8 characters.');
        if (!password) return setAuthError('Please enter your password.');

        setAuthBusy(true);
        try {
            if (authMode === 'register') {
                await registerUser({ fullName: fullName.trim(), phone: phone.trim(), ageConfirmed: true, email: email.trim(), password });
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
        if (!user) return setOrderError('Please create your RELOQ account first to continue.');
        if (!verified) return setOrderError('Please verify your email first.');
        const schedule = schedulePayload(bookingData.scheduledTime);
        if (!schedule) return setOrderError('Please go back and pick a date and arrival window.');
        if (paymentsEnabled && !stripePromise)
            return setOrderError('Online payments are not fully configured yet. Please try again later.');

        setIsCreating(true);
        setPaymentNotice('');
        setSlotTaken(false);
        try {
            const res = await api.createOrder({
                pickup: toLocation(bookingData.pickup),
                dropoff: toLocation(bookingData.dropoff),
                pickupDetails: cleanDetails(bookingData.pickupDetails),
                dropoffDetails: cleanDetails(bookingData.dropoffDetails),
                vehicle: bookingData.vehicle,
                schedule,
                itemsDescription: bookingData.itemsDescription,
                photosCount: bookingData.photos?.length || 0
            });
            await uploadPhotos(res.order.id);
            setOrder(res.order);
            if (res.clientSecret) {
                setClientSecret(res.clientSecret);
            } else {
                setCompletedOrder(res.order); // fără plată online: comanda rămâne „pending_payment”
            }
        } catch (err) {
            if (err.data?.code === 'EMAIL_NOT_VERIFIED') refresh();
            if (err.data?.code === 'SLOT_TAKEN') setSlotTaken(true);
            setOrderError(err.message);
        } finally {
            setIsCreating(false);
        }
    };

    /** Trimite pozele alese la pasul cu obiectele. O poză eșuată nu oprește rezervarea. */
    const uploadPhotos = async (code) => {
        const photos = (bookingData.photos || []).filter((p) => p.blob || p.file);
        setPhotoNotice('');
        if (!photos.length) return;
        let failed = 0;
        setPhotoUpload({ done: 0, total: photos.length });
        for (const [i, photo] of photos.entries()) {
            try {
                await uploadOrderPhoto(code, photo.blob || photo.file);
            } catch {
                // o a doua încercare (rețea mobilă instabilă)
                try {
                    await uploadOrderPhoto(code, photo.blob || photo.file);
                } catch {
                    failed += 1;
                }
            }
            setPhotoUpload({ done: i + 1, total: photos.length });
        }
        setPhotoUpload(null);
        if (failed) {
            setPhotoNotice(
                `${failed} of ${photos.length} photo${photos.length === 1 ? '' : 's'} couldn’t be uploaded. Your booking is fine — you can reply to the confirmation email with them.`
            );
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
                <p className="subtitle">Create your RELOQ account for live crew tracking and complete your booking.</p>
            </div>

            {/* 1. Rezumat comandă */}
            <div className="checkout-recap-card">
                <div className="recap-top-row">
                    <div>
                        <span className="recap-vehicle">{selectedVehicle?.name || 'RELOQ'}</span>
                        <span className="recap-sub">{scheduleText}</span>
                    </div>
                    <span className="recap-price">
                        {formatPrice(totalAmount)}
                        <small className="recap-price-note">due at booking</small>
                    </span>
                </div>
                <div className="recap-addresses">
                    <div className="recap-addr-line">
                        <span className="mini-dot blue" />
                        <span>
                            {bookingData.pickup?.address}
                            {describeDetails(bookingData.pickupDetails) && <small className="recap-addr-details">{describeDetails(bookingData.pickupDetails)}</small>}
                        </span>
                    </div>
                    <div className="recap-addr-line">
                        <span className="mini-dot green" />
                        <span>
                            {bookingData.dropoff?.address}
                            {describeDetails(bookingData.dropoffDetails) && <small className="recap-addr-details">{describeDetails(bookingData.dropoffDetails)}</small>}
                        </span>
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
                            <strong>{authMode === 'register' ? 'Create your RELOQ account' : 'Welcome back'}</strong>
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
                                    inputMode="tel"
                                    maxLength={14}
                                    placeholder="US mobile phone, e.g. (508) 555-0192"
                                    autoComplete="tel-national"
                                    value={phone}
                                    onChange={(e) => setPhone(formatUsPhone(e.target.value))}
                                />
                                <div className="dob-field">
                                    <span>Are you 18 or older?</span>
                                    <div className="age-toggle" role="group" aria-label="Are you 18 or older?">
                                        <button type="button" className={`age-btn ${ageConfirmed === true ? 'active' : ''}`} onClick={() => setAgeConfirmed(true)}>Yes</button>
                                        <button type="button" className={`age-btn no ${ageConfirmed === false ? 'active' : ''}`} onClick={() => setAgeConfirmed(false)}>No</button>
                                    </div>
                                    {ageConfirmed === false && <small className="field-hint error">You must be at least 18 to book with RELOQ.</small>}
                                </div>
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
                              ? 'Create RELOQ account & continue →'
                              : 'Log in & continue →'}
                    </button>

                    <p className="trust-note legal-inline-links auth-consent">
                        By continuing you agree to RELOQ’s{' '}
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
                            {/* Emailul și telefonul pe rânduri separate, ca să încapă pe telefon lângă „Switch” */}
                            <small>{user.email}</small>
                            {user.phone && <small>{user.phone}</small>}
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
                                ? 'Complete step 1 (RELOQ account) to unlock payment'
                                : !verified
                                  ? 'Verify your email to unlock booking'
                                : paymentsEnabled
                                  ? 'Secure checkout powered by Stripe'
                                  : 'Pay the crew after the job is done'}
                        </small>
                    </div>
                </div>

                {clientSecret && stripePromise ? (
                    <>
                        {photoNotice && <p className="form-inline-error">{photoNotice}</p>}
                        <PaymentMethodPicker
                            stripePromise={stripePromise}
                            appearance={stripeAppearance}
                            order={order}
                            clientSecret={clientSecret}
                            paypalClientId={paypalClientId}
                            onPaid={setCompletedOrder}
                            returnParam={PAYMENT_RETURN_PARAM}
                        />
                        <p className="trust-note">
                            This payment covers the reservation fee, service fee and transportation. Labor is billed after the job
                            {order?.price?.labor ? ` (${order.price.labor.label})` : ''}, based on actual time from crew arrival to completion.
                        </p>
                        <p className="trust-note">Payments are processed securely by Stripe and PayPal — card details never touch RELOQ servers.</p>
                    </>
                ) : (
                    <>
                        {(orderError || paymentNotice) && <p className="form-inline-error">{orderError || paymentNotice}</p>}
                        {slotTaken && (
                            <button type="button" className="slot-taken-back" onClick={() => setCurrentStep(4)}>
                                ← Pick another arrival window
                            </button>
                        )}
                        <div className="step-footer">
                            <Button
                                onClick={handleCreateOrder}
                                loading={isCreating}
                                disabled={!user || !verified || totalAmount == null}
                            >
                                {photoUpload
                                    ? `Uploading photos ${Math.min(photoUpload.done + 1, photoUpload.total)}/${photoUpload.total}…`
                                    : isCreating
                                    ? 'Creating your booking…'
                                    : paymentsEnabled
                                      ? `Continue to payment • ${formatPrice(totalAmount)}`
                                      : `Book RELOQ • ${formatPrice(totalAmount)}`}
                            </Button>
                            <p className="trust-note">
                                {paymentsEnabled
                                    ? 'You pay the reservation fee, service fee and transportation now. '
                                    : ''}
                                Labor is billed after the job
                                {bookingData.priceEstimate?.labor ? ` (${bookingData.priceEstimate.labor.label})` : ''}, based on actual time from crew
                                arrival to completion.
                            </p>
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
