import React from 'react';
import { Link } from 'react-router-dom';
import { COMPANY, LICENSE_LINE } from '../../data/company';
import { useBooking } from '../../context/BookingContext';
import AddressInput from '../../components/AddressInput';
import LocationDetails, { detailsComplete } from '../../components/LocationDetails';
import { startManualPin, confirmPin } from '../../utils/pinLocation';
import GoogleRating from '../../components/GoogleRating';
import { inServiceArea, SERVICE_AREA_LABEL } from '../../data/serviceArea';
import Button from '../../components/Button';

const Step1Route = () => {
    const { bookingData, updateBookingData, nextStep, pinMode, setPinMode } = useBooking();
    // O adresă folosită „cum a fost scrisă” trebuie marcată pe hartă înainte de a continua
    const needsPin = (loc) => Boolean(loc?.needsPin && !loc?.pinned);
    // Doar în zona deservită (Massachusetts, de la Worcester spre est); serverul verifică și el
    const outside = (loc) => Boolean(loc?.lat && !needsPin(loc) && !inServiceArea(loc.lat, loc.lng));
    const anyOutside = outside(bookingData.pickup) || outside(bookingData.dropoff);
    const addressesReady =
        Boolean(bookingData.pickup?.lat && bookingData.dropoff?.lat) &&
        !needsPin(bookingData.pickup) &&
        !needsPin(bookingData.dropoff) &&
        !anyOutside;

    // Închiderea marcării confirmă pinul (vezi confirmPin)
    const finishPin = () => {
        if (pinMode) confirmPin(updateBookingData, pinMode, bookingData[pinMode]);
        setPinMode(null);
    };

    const startPin = (kind) => {
        if (pinMode && pinMode !== kind) confirmPin(updateBookingData, pinMode, bookingData[pinMode]);
        setPinMode(kind);
        // pe telefon harta e sus
        if (window.matchMedia('(max-width: 900px)').matches) window.scrollTo({ top: 0, behavior: 'auto' });
    };

    const selectAddress = (kind, loc) => {
        updateBookingData({ [kind]: loc });
        if (loc?.needsPin) startPin(kind);
        else if (pinMode === kind) setPinMode(null);
    };

    /** „Pick on map” (fără adresă) sau „Adjust pin on map” sub fiecare adresă. */
    const PinControl = ({ kind }) => {
        const loc = bookingData[kind];
        const active = pinMode === kind;
        if (!loc?.lat) {
            const other = bookingData[kind === 'pickup' ? 'dropoff' : 'pickup'];
            return (
                <div className="pin-control">
                    <button
                        type="button"
                        className="pin-btn"
                        onClick={() => {
                            startManualPin(updateBookingData, kind, other);
                            startPin(kind);
                        }}
                    >
                        📍 Or pick it on the map
                    </button>
                </div>
            );
        }
        return (
            <div className="pin-control">
                <button type="button" className={`pin-btn ${active ? 'active' : ''}`} onClick={() => (active ? finishPin() : startPin(kind))}>
                    {active ? '✓ Done marking' : loc.pinned ? '📍 Pin set — adjust' : '📍 Adjust pin on map'}
                </button>
                {needsPin(loc) && !active && <span className="pin-warn">Mark the spot on the map to continue</span>}
                {outside(loc) && (
                    <span className="pin-error">
                        This address is outside our service area ({SERVICE_AREA_LABEL}). Please choose another address
                        {loc.pinned || loc.manual ? ' or move the pin' : ''}.
                    </span>
                )}
                {loc.approx && !loc.pinned && !needsPin(loc) && !active && (
                    <span className="pin-hint">Map location is approximate — adjust the pin if needed</span>
                )}
                {active && <span className="pin-hint">Drag the pin or tap the map on the exact building</span>}
            </div>
        );
    };
    // Etajul (și liftul, dacă nu e parter / casă) e obligatoriu la ambele adrese
    const detailsReady = detailsComplete(bookingData.pickupDetails) && detailsComplete(bookingData.dropoffDetails);
    const isReady = addressesReady && detailsReady;

    const handleSwapAddresses = () => {
        updateBookingData({
            pickup: bookingData.dropoff,
            dropoff: bookingData.pickup,
            pickupDetails: bookingData.dropoffDetails,
            dropoffDetails: bookingData.pickupDetails
        });
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>Where are we moving?</h1>
                <p className="subtitle">
                    Enter your pickup and dropoff addresses for an instant route estimate. We serve Massachusetts from Worcester
                    east, including Cape Cod and the Islands.
                </p>
                <GoogleRating extra="Licensed & insured" />
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
                            name="pickup-address"
                            label="Pickup address"
                            placeholder="Pickup address..."
                            value={bookingData.pickup}
                            onSelect={(loc) => selectAddress('pickup', loc)}
                        />
                        <PinControl kind="pickup" />
                        {bookingData.pickup?.lat && (
                            <LocationDetails
                                prefix="pickup"
                                value={bookingData.pickupDetails}
                                onChange={(d) => updateBookingData({ pickupDetails: d })}
                            />
                        )}
                    </div>

                    <div className="route-divider" />

                    <div className="route-slot">
                        <span className="slot-tag">DROPOFF</span>
                        <AddressInput
                            name="dropoff-address"
                            label="Drop-off address"
                            placeholder="Where are we delivering?"
                            value={bookingData.dropoff}
                            onSelect={(loc) => selectAddress('dropoff', loc)}
                        />
                        <PinControl kind="dropoff" />
                        {bookingData.dropoff?.lat && (
                            <LocationDetails
                                prefix="dropoff"
                                value={bookingData.dropoffDetails}
                                onChange={(d) => updateBookingData({ dropoffDetails: d })}
                            />
                        )}
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

            {addressesReady && bookingData.routeInfo && (
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
                    {anyOutside
                        ? 'Address outside our service area'
                        : needsPin(bookingData.pickup) || needsPin(bookingData.dropoff)
                        ? 'Mark the address on the map'
                        : addressesReady && !detailsReady
                          ? 'Add property & access info'
                          : 'Choose your items →'}
                </Button>
                <p className="trust-note">
                    Background-checked movers • Loading & unloading included
                </p>
                <p className="trust-note legal-inline-links">
                    <Link to="/about">About</Link> • <Link to="/contact">Contact</Link> •{' '}
                    <a href="tel:+15088167230">(508) 816-7230</a> •{' '}
                    <a href={COMPANY.instagram} target="_blank" rel="noopener noreferrer">
                        Instagram
                    </a>{' '}
                    •{' '}
                    <Link to="/terms" target="_blank" rel="noopener">Terms</Link> •{' '}
                    <Link to="/privacy" target="_blank" rel="noopener">Privacy</Link> •{' '}
                    <a href={COMPANY.fmcsaRightsAndResponsibilities} target="_blank" rel="noopener noreferrer">
                        Your Rights &amp; Responsibilities
                    </a>{' '}
                    •{' '}
                    <a href={COMPANY.fmcsaReadyToMove} target="_blank" rel="noopener noreferrer">
                        Ready to Move?
                    </a>
                </p>
                <p className="trust-note license-line">{LICENSE_LINE}</p>
            </div>
        </div>
    );
};

export default Step1Route;