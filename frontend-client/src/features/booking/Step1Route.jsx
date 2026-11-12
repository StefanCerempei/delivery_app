import React from 'react';
import { Link } from 'react-router-dom';
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
                <h1>Where are we moving?</h1>
                <p className="subtitle">
                    Enter your pickup and dropoff addresses for an instant route estimate.
                </p>
            </div>

            <div className="route-card">
                <div className="route-timeline">
                    <span className="dot-pickup" />
                    <span className="timeline-line" />
                    <span className="dot-dropoff" />
                </div>

                <div className="route-inputs-stack">
                    <div className="route-slot">
                        <span className="slot-tag">PICKUP</span>
                        <AddressInput
                            placeholder="Pickup address..."
                            value={bookingData.pickup}
                            onSelect={(loc) => updateBookingData({ pickup: loc })}
                        />
                    </div>

                    <div className="route-divider" />

                    <div className="route-slot">
                        <span className="slot-tag">DROPOFF</span>
                        <AddressInput
                            placeholder="Where are we delivering?"
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
                        title="Swap addresses"
                    >
                        ⇅
                    </button>
                )}
            </div>

            {isReady && bookingData.routeInfo && (
                <div className="trip-metrics-card">
                    <div className="metric-item">
                        <span className="metric-label">Driving distance</span>
                        <span className="metric-value">{bookingData.routeInfo.distanceMiles} mi</span>
                    </div>
                    <div className="metric-sep" />
                    <div className="metric-item">
                        <span className="metric-label">Est. drive time</span>
                        <span className="metric-value">~{bookingData.routeInfo.durationMins} min</span>
                    </div>
                </div>
            )}

            <div className="step-footer">
                <Button onClick={nextStep} disabled={!isReady}>
                    Choose vehicle →
                </Button>
                <p className="trust-note">
                    Background-checked movers • Loading & unloading included
                </p>
                <p className="trust-note legal-inline-links">
                    <Link to="/terms" target="_blank" rel="noopener">Terms</Link> •{' '}
                    <Link to="/privacy" target="_blank" rel="noopener">Privacy</Link>
                </p>
            </div>
        </div>
    );
};

export default Step1Route;