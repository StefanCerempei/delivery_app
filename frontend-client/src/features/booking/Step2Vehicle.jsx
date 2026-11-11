import React, { useEffect } from 'react';
import { useBooking } from '../../context/BookingContext';
import { VEHICLES } from '../../data/vehicles';
import { usePriceEstimate } from '../../hooks/usePriceEstimate';
import { formatPrice } from '../../utils/formatters';
import PriceSummary from '../../components/PriceSummary';
import Button from '../../components/Button';

const Step2Vehicle = () => {
    const { bookingData, updateBookingData, nextStep } = useBooking();
    const { estimates, routeInfo, loading, error } = usePriceEstimate(bookingData.pickup, bookingData.dropoff);

    const selectedVehicleId = bookingData.vehicle;
    const selectedVehicle = VEHICLES.find((v) => v.id === selectedVehicleId);
    const selectedEstimate = selectedVehicleId ? estimates[selectedVehicleId] : null;

    // Când sosesc prețurile de la server, actualizăm și estimarea vehiculului deja ales.
    useEffect(() => {
        if (routeInfo) updateBookingData({ routeInfo });
        if (selectedVehicleId && estimates[selectedVehicleId]) {
            updateBookingData({ priceEstimate: estimates[selectedVehicleId] });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [estimates, routeInfo]);

    const handleSelectVehicle = (vehicleId) => {
        updateBookingData({
            vehicle: vehicleId,
            priceEstimate: estimates[vehicleId] || null
        });
    };

    const handleContinue = () => {
        if (!selectedVehicleId || !selectedEstimate) return;
        nextStep();
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>Choose your vehicle</h1>
                <p className="subtitle">
                    Select the right size truck and crew for your items.
                </p>
            </div>

            {error && <p className="form-inline-error">{error}</p>}

            <div className={`vehicles-list ${loading ? 'is-loading' : ''}`}>
                {VEHICLES.map((vehicle) => {
                    const isSelected = selectedVehicleId === vehicle.id;
                    const estimate = estimates[vehicle.id];

                    return (
                        <div
                            key={vehicle.id}
                            className={`vehicle-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSelectVehicle(vehicle.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && handleSelectVehicle(vehicle.id)}
                        >
                            <div className="vehicle-icon-box">
                                <img src={vehicle.icon} alt={vehicle.name} />
                            </div>

                            <div className="vehicle-info">
                                <div className="vehicle-title-row">
                                    <strong>{vehicle.name}</strong>
                                    {vehicle.badge && <span className="vehicle-badge">{vehicle.badge}</span>}
                                </div>
                                <span className="vehicle-meta">
                  {vehicle.crewLabel} • {vehicle.dimensions}
                </span>
                                <p className="vehicle-desc">{vehicle.description}</p>
                            </div>

                            <div className="vehicle-price-col">
                                <span className="vehicle-price">{loading ? '…' : formatPrice(estimate?.total)}</span>
                                <span className={`radio-circle ${isSelected ? 'checked' : ''}`} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {selectedVehicle && selectedEstimate && (
                <PriceSummary
                    vehicle={selectedVehicle}
                    estimate={selectedEstimate}
                    routeInfo={routeInfo || bookingData.routeInfo}
                />
            )}

            <div className="step-footer">
                <Button onClick={handleContinue} disabled={!selectedVehicleId || !selectedEstimate || loading}>
                    Continue to schedule →
                </Button>
            </div>
        </div>
    );
};

export default Step2Vehicle;