import React from 'react';
import { formatPrice, formatDistance } from '../utils/formatters';

const PriceSummary = ({ vehicle, estimate, routeInfo }) => {
    if (!vehicle || !estimate) return null;

    return (
        <div className="price-summary-card">
            <div className="price-summary-header">
                <span>Detalii tarif • {vehicle.name}</span>
                <span className="crew-tag">{vehicle.crewLabel}</span>
            </div>

            <div className="price-rows">
                <div className="price-row">
                    <span>Tarif de bază și manipulare</span>
                    <span>{formatPrice(estimate.baseFare)}</span>
                </div>
                <div className="price-row">
                    <span>Traseu ({formatDistance(routeInfo?.distanceKm)})</span>
                    <span>{formatPrice(estimate.distanceCost + estimate.timeCost)}</span>
                </div>
            </div>

            <div className="price-total-row">
                <div>
                    <strong>Total estimat</strong>
                    <small>Fără taxe ascunse</small>
                </div>
                <span className="total-amount">{formatPrice(estimate.total)}</span>
            </div>
        </div>
    );
};

export default PriceSummary;