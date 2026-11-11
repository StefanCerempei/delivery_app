import React from 'react';
import { formatPrice, formatDistance } from '../utils/formatters';

const PriceSummary = ({ vehicle, estimate, routeInfo }) => {
    if (!vehicle || !estimate) return null;

    return (
        <div className="price-summary-card">
            <div className="price-summary-header">
                <span>Fare breakdown • {vehicle.name}</span>
                <span className="crew-tag">{vehicle.crewLabel}</span>
            </div>

            <div className="price-rows">
                <div className="price-row">
                    <span>Base fare & loading</span>
                    <span>{formatPrice(estimate.baseFare)}</span>
                </div>
                <div className="price-row">
                    <span>Distance & time ({formatDistance(routeInfo?.distanceMiles)})</span>
                    <span>{formatPrice(estimate.distanceCost + estimate.timeCost)}</span>
                </div>
            </div>

            <div className="price-total-row">
                <div>
                    <strong>Estimated total</strong>
                    <small>No hidden fees</small>
                </div>
                <span className="total-amount">{formatPrice(estimate.total)}</span>
            </div>
        </div>
    );
};

export default PriceSummary;