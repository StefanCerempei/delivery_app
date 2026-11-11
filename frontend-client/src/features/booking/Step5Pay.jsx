import React, { useState } from 'react';
import { useBooking } from '../../context/BookingContext';
import { VEHICLES } from '../../data/vehicles';
import { formatPrice } from '../../utils/formatters';
import {
    isValidEmail,
    isValidPhone,
    formatCardNumber,
    formatCardExpiry
} from '../../utils/validators';
import Button from '../../components/Button';

const Step5Pay = () => {
    const {
        bookingData,
        user,
        saveUserAccount,
        logoutUser,
        setCompletedOrder
    } = useBooking();

    const [authMode, setAuthMode] = useState('register');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');

    const [cardNumber, setCardNumber] = useState('');
    const [cardExpiry, setCardExpiry] = useState('');
    const [cardCvc, setCardCvc] = useState('');
    const [payError, setPayError] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const selectedVehicle = VEHICLES.find((v) => v.id === bookingData.vehicle);
    const totalAmount = bookingData.priceEstimate?.total || 0;

    const scheduleText =
        bookingData.scheduledTime === 'asap'
            ? 'Now (in ~30 min)'
            : `${bookingData.scheduledTime?.dateLabel} • ${bookingData.scheduledTime?.slotLabel}`;

    const handleAccountSubmit = (e) => {
        e.preventDefault();
        setAuthError('');

        if (authMode === 'register' && fullName.trim().length < 2) {
            setAuthError('Please enter your full name.');
            return;
        }
        if (authMode === 'register' && !isValidPhone(phone)) {
            setAuthError('Please enter a valid mobile number (e.g., (415) 555-0192).');
            return;
        }
        if (!isValidEmail(email)) {
            setAuthError('Please enter a valid email address.');
            return;
        }
        if (password.length < 6) {
            setAuthError('Password must be at least 6 characters.');
            return;
        }

        const cleanEmail = email.trim().toLowerCase();
        const accountObj = {
            id: `usr_${Date.now()}`,
            fullName:
                authMode === 'register'
                    ? fullName.trim()
                    : cleanEmail.split('@')[0],
            phone: authMode === 'register' ? phone.trim() : '(415) 555-0199',
            email: cleanEmail,
            createdAt: new Date().toISOString()
        };

        saveUserAccount(accountObj);
    };

    const handlePayAndConfirm = (e) => {
        e.preventDefault();
        setPayError('');

        if (!user) {
            setPayError('Please create your Reloq account first to continue.');
            return;
        }

        const rawDigits = cardNumber.replace(/\s/g, '');
        if (rawDigits.length < 16) {
            setPayError('Please enter all 16 digits of your card.');
            return;
        }
        if (cardExpiry.length < 5) {
            setPayError('Please enter the expiration date in MM/YY format.');
            return;
        }
        if (cardCvc.length < 3) {
            setPayError('Please enter the 3- or 4-digit CVC code.');
            return;
        }

        setIsProcessing(true);

        setTimeout(() => {
            const orderCode = `RLQ-${Math.floor(10000 + Math.random() * 90000)}`;
            const newOrder = {
                id: orderCode,
                status: 'confirmed',
                customer: user,
                pickup: bookingData.pickup,
                dropoff: bookingData.dropoff,
                routeInfo: bookingData.routeInfo,
                vehicle: selectedVehicle,
                scheduledTime: bookingData.scheduledTime,
                scheduleText,
                itemsDescription: bookingData.itemsDescription,
                photosCount: bookingData.photos?.length || 0,
                totalAmount,
                cardLast4: rawDigits.slice(-4),
                createdAt: new Date().toISOString()
            };

            try {
                const existing = JSON.parse(localStorage.getItem('reloq_orders') || '[]');
                localStorage.setItem('reloq_orders', JSON.stringify([newOrder, ...existing]));
            } catch (err) {
                console.warn('Could not save order locally:', err);
            }

            setIsProcessing(false);
            setCompletedOrder(newOrder);
        }, 1100);
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>Account & Payment</h1>
                <p className="subtitle">
                    Create your Reloq account for live crew tracking and complete your booking.
                </p>
            </div>

            {/* 1. Compact order recap */}
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

            {/* 2. Reloq Account Gate */}
            {!user ? (
                <form className="account-gate-card" onSubmit={handleAccountSubmit}>
                    <div className="account-gate-header">
                        <span className="step-badge-num">1</span>
                        <div>
                            <strong>Create your Reloq account</strong>
                            <small>Required for SMS updates and live map tracking</small>
                        </div>
                    </div>

                    <div className="auth-tabs">
                        <button
                            type="button"
                            className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
                            onClick={() => {
                                setAuthMode('register');
                                setAuthError('');
                            }}
                        >
                            Sign up
                        </button>
                        <button
                            type="button"
                            className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
                            onClick={() => {
                                setAuthMode('login');
                                setAuthError('');
                            }}
                        >
                            Log in
                        </button>
                    </div>

                    <div className="auth-fields-grid">
                        {authMode === 'register' && (
                            <>
                                <input
                                    type="text"
                                    className="reloq-input"
                                    placeholder="Full name (e.g., Alex Morgan)"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                />
                                <input
                                    type="tel"
                                    className="reloq-input"
                                    placeholder="Mobile phone (e.g., (415) 555-0192)"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                />
                            </>
                        )}

                        <input
                            type="email"
                            className="reloq-input"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />

                        <input
                            type="password"
                            className="reloq-input"
                            placeholder="Password (min. 6 characters)"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {authError && <p className="form-inline-error">{authError}</p>}

                    <button type="submit" className="create-account-btn">
                        {authMode === 'register'
                            ? 'Create Reloq account & continue →'
                            : 'Log in & continue →'}
                    </button>
                </form>
            ) : (
                <div className="account-verified-card">
                    <div className="verified-left">
                        <span className="verified-check">✓</span>
                        <div>
                            <strong>{user.fullName}</strong>
                            <small>
                                {user.email} • {user.phone}
                            </small>
                        </div>
                    </div>
                    <button type="button" className="change-account-btn" onClick={logoutUser}>
                        Switch
                    </button>
                </div>
            )}

            {/* 3. Card Payment Section */}
            <form
                className={`payment-card-box ${!user ? 'locked' : ''}`}
                onSubmit={handlePayAndConfirm}
            >
                <div className="account-gate-header">
                    <span className="step-badge-num">2</span>
                    <div>
                        <strong>Payment details</strong>
                        <small>
                            {user
                                ? 'Encrypted checkout • You are only charged once delivery is complete'
                                : 'Complete step 1 (Reloq account) to unlock payment'}
                        </small>
                    </div>
                </div>

                <div className="card-inputs-stack">
                    <input
                        type="text"
                        inputMode="numeric"
                        className="reloq-input"
                        placeholder="Card number (e.g., 4242 4242 4242 4242)"
                        disabled={!user || isProcessing}
                        value={cardNumber}
                        onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    />

                    <div className="card-split-row">
                        <input
                            type="text"
                            inputMode="numeric"
                            className="reloq-input"
                            placeholder="MM/YY"
                            disabled={!user || isProcessing}
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(formatCardExpiry(e.target.value))}
                        />
                        <input
                            type="text"
                            inputMode="numeric"
                            className="reloq-input"
                            placeholder="CVC"
                            maxLength={4}
                            disabled={!user || isProcessing}
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        />
                    </div>
                </div>

                {payError && <p className="form-inline-error">{payError}</p>}

                <div className="step-footer" style={{ paddingTop: '16px' }}>
                    <Button type="submit" disabled={!user || isProcessing}>
                        {isProcessing
                            ? 'Processing payment...'
                            : `Pay ${formatPrice(totalAmount)} & book Reloq`}
                    </Button>
                    <p className="trust-note">
                        Receipt and live tracking link will be sent to {user?.email || 'your email'}
                    </p>
                </div>
            </form>
        </div>
    );
};

export default Step5Pay;