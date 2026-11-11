import React from 'react';
import { useBooking } from '../../context/BookingContext';
import AddressInput from '../../components/AddressInput';
import Button from '../../components/Button';

const Step1Route = () => {
    const { bookingData, updateBookingData, nextStep } = useBooking();
    const isReady = Boolean(bookingData.pickup?.lat && bookingData.dropoff?.lat);

    const handleSwapAddresses = () => {
        updateBookingData({
            pickup: bookingData.dropoff,
            dropoff: bookingData.pickup
        });
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>Unde mutăm?</h1>
                <p className="subtitle">
                    Alege punctul de preluare și destinația pentru a calcula traseul instant.
                </p>
            </div>

            {/* Card unitar stil Lugg / Uber */}
            <div className="route-card">
                <div className="route-timeline">
                    <span className="dot-pickup" />
                    <span className="timeline-line" />
                    <span className="dot-dropoff" />
                </div>

                <div className="route-inputs-stack">
                    <div className="route-slot">
                        <span className="slot-tag">PRELUARE</span>
                        <AddressInput
                            placeholder="Adresa de preluare..."
                            value={bookingData.pickup}
                            onSelect={(loc) => updateBookingData({ pickup: loc })}
                        />
                    </div>

                    <div className="route-divider" />

                    <div className="route-slot">
                        <span className="slot-tag">DESTINAȚIE</span>
                        <AddressInput
                            placeholder="Unde livrăm?"
                            value={bookingData.dropoff}
                            onSelect={(loc) => updateBookingData({ dropoff: loc })}
                        />
                    </div>
                </div>

                {(bookingData.pickup || bookingData.dropoff) && (
                    <button
                        type="button"
                        className="swap-route-btn"
                        onClick={handleSwapAddresses}
                        title="Inversează adresele"
                    >
                        ⇅
                    </button>
                )}
            </div>

            {isReady && bookingData.routeInfo && (
                <div className="trip-metrics-card">
                    <div className="metric-item">
                        <span className="metric-label">Distanță rutieră</span>
                        <span className="metric-value">{bookingData.routeInfo.distanceKm} km</span>
                    </div>
                    <div className="metric-sep" />
                    <div className="metric-item">
                        <span className="metric-label">Timp estimat</span>
                        <span className="metric-value">~{bookingData.routeInfo.durationMins} min</span>
                    </div>
                </div>
            )}

            <div className="step-footer">
                <Button onClick={nextStep} disabled={!isReady}>
                    Alege vehiculul →
                </Button>
                <p className="trust-note">
                    2 mutători profesioniști • Încărcare și descărcare incluse
                </p>
            </div>
        </div>
    );
};

export default Step1Route;