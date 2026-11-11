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

    // Stare pentru formularul de cont (Creează cont vs Am deja cont)
    const [authMode, setAuthMode] = useState('register');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState('');

    // Stare pentru cardul bancar
    const [cardNumber, setCardNumber] = useState('');
    const [cardExpiry, setCardExpiry] = useState('');
    const [cardCvc, setCardCvc] = useState('');
    const [payError, setPayError] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const selectedVehicle = VEHICLES.find((v) => v.id === bookingData.vehicle);
    const totalAmount = bookingData.priceEstimate?.total || 0;

    const scheduleText =
        bookingData.scheduledTime === 'asap'
            ? 'Acum (în ~30 min)'
            : `${bookingData.scheduledTime?.dateLabel} • ${bookingData.scheduledTime?.slotLabel}`;

    const handleAccountSubmit = (e) => {
        e.preventDefault();
        setAuthError('');

        if (authMode === 'register' && fullName.trim().length < 2) {
            setAuthError('Introdu numele tău complet.');
            return;
        }
        if (authMode === 'register' && !isValidPhone(phone)) {
            setAuthError('Introdu un număr de telefon valid (ex: 0722 123 456).');
            return;
        }
        if (!isValidEmail(email)) {
            setAuthError('Introdu o adresă de email validă.');
            return;
        }
        if (password.length < 6) {
            setAuthError('Parola trebuie să aibă minimum 6 caractere.');
            return;
        }

        const cleanEmail = email.trim().toLowerCase();
        const accountObj = {
            id: `usr_${Date.now()}`,
            fullName:
                authMode === 'register'
                    ? fullName.trim()
                    : cleanEmail.split('@')[0],
            phone: authMode === 'register' ? phone.trim() : '0722 000 000',
            email: cleanEmail,
            createdAt: new Date().toISOString()
        };

        saveUserAccount(accountObj);
    };

    const handlePayAndConfirm = (e) => {
        e.preventDefault();
        setPayError('');

        if (!user) {
            setPayError('Creează-ți mai întâi contul Reloq pentru a continua.');
            return;
        }

        const rawDigits = cardNumber.replace(/\s/g, '');
        if (rawDigits.length < 16) {
            setPayError('Introdu toate cele 16 cifre ale cardului.');
            return;
        }
        if (cardExpiry.length < 5) {
            setPayError('Introdu data expirării în format LL/AA.');
            return;
        }
        if (cardCvc.length < 3) {
            setPayError('Introdu codul CVC de 3 cifre.');
            return;
        }

        setIsProcessing(true);

        // Simulăm procesarea plății (va fi înlocuită cu Stripe PaymentIntent)
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
                console.warn('Nu s-a putut salva comanda local:', err);
            }

            setIsProcessing(false);
            setCompletedOrder(newOrder);
        }, 1100);
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>Cont & Plată</h1>
                <p className="subtitle">
                    Creează-ți contul Reloq pentru urmărirea echipajului și finalizează rezervarea.
                </p>
            </div>

            {/* 1. Recapitulare compactă comandă */}
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

            {/* 2. Secțiunea de Cont Reloq (obligatorie înainte de plată) */}
            {!user ? (
                <form className="account-gate-card" onSubmit={handleAccountSubmit}>
                    <div className="account-gate-header">
                        <span className="step-badge-num">1</span>
                        <div>
                            <strong>Creează contul tău Reloq</strong>
                            <small>Necesar pentru notificări SMS și urmărirea live pe hartă</small>
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
                            Cont nou
                        </button>
                        <button
                            type="button"
                            className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
                            onClick={() => {
                                setAuthMode('login');
                                setAuthError('');
                            }}
                        >
                            Am deja cont
                        </button>
                    </div>

                    <div className="auth-fields-grid">
                        {authMode === 'register' && (
                            <>
                                <input
                                    type="text"
                                    className="reloq-input"
                                    placeholder="Nume complet (ex: Andrei Popescu)"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                />
                                <input
                                    type="tel"
                                    className="reloq-input"
                                    placeholder="Telefon mobil (ex: 0722 123 456)"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                />
                            </>
                        )}

                        <input
                            type="email"
                            className="reloq-input"
                            placeholder="Adresă de email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />

                        <input
                            type="password"
                            className="reloq-input"
                            placeholder="Parolă (min. 6 caractere)"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {authError && <p className="form-inline-error">{authError}</p>}

                    <button type="submit" className="create-account-btn">
                        {authMode === 'register'
                            ? 'Creează cont Reloq și continuă →'
                            : 'Conectează-te și continuă →'}
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
                        Schimbă
                    </button>
                </div>
            )}

            {/* 3. Secțiunea de Plată cu cardul */}
            <form
                className={`payment-card-box ${!user ? 'locked' : ''}`}
                onSubmit={handlePayAndConfirm}
            >
                <div className="account-gate-header">
                    <span className="step-badge-num">2</span>
                    <div>
                        <strong>Detalii plată</strong>
                        <small>
                            {user
                                ? 'Tranzacție securizată • Suma se blochează până la livrare'
                                : 'Completează pasul 1 (contul Reloq) pentru a debloca plata'}
                        </small>
                    </div>
                </div>

                <div className="card-inputs-stack">
                    <input
                        type="text"
                        inputMode="numeric"
                        className="reloq-input"
                        placeholder="Număr card (ex: 4242 4242 4242 4242)"
                        disabled={!user || isProcessing}
                        value={cardNumber}
                        onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    />

                    <div className="card-split-row">
                        <input
                            type="text"
                            inputMode="numeric"
                            className="reloq-input"
                            placeholder="LL/AA"
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
                            ? 'Se procesează plata...'
                            : `Plătește ${formatPrice(totalAmount)} și confirmă Reloq`}
                    </Button>
                    <p className="trust-note">
                        Chitanța și link-ul de tracking se trimit automat pe {user?.email || 'email'}
                    </p>
                </div>
            </form>
        </div>
    );
};

export default Step5Pay;