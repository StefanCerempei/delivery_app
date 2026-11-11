import React from 'react';
import { useBooking } from '../../context/BookingContext';
import { VEHICLES } from '../../data/vehicles';
import { usePriceEstimate } from '../../hooks/usePriceEstimate';
import { formatPrice } from '../../utils/formatters';
import PriceSummary from '../../components/PriceSummary';
import Button from '../../components/Button';

const Step2Vehicle = () => {
    const { bookingData, updateBookingData, nextStep } = useBooking();
    const estimates = usePriceEstimate(bookingData.routeInfo);

    const selectedVehicleId = bookingData.vehicle;
    const selectedVehicle = VEHICLES.find((v) => v.id === selectedVehicleId);
    const selectedEstimate = selectedVehicleId ? estimates[selectedVehicleId] : null;

    const handleSelectVehicle = (vehicleId) => {
        updateBookingData({
            vehicle: vehicleId,
            priceEstimate: estimates[vehicleId]
        });
    };

    const handleContinue = () => {
        if (!selectedVehicleId) return;
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

            <div className="vehicles-list">
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
                                <span className="vehicle-price">{formatPrice(estimate?.total)}</span>
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
                    routeInfo={bookingData.routeInfo}
                />
            )}

            <div className="step-footer">
                <Button onClick={handleContinue} disabled={!selectedVehicleId}>
                    Continue to schedule →
                </Button>
            </div>
        </div>
    );
};

export default Step2Vehicle;