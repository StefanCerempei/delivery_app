import React from 'react';
import { formatMoney } from '../utils/formatters';

/**
 * Prețul pentru client: doar totalul de plată la rezervare și tariful manoperei (facturată după job).
 * Defalcarea (Reservation fee / Service fee / Transportation) apare doar în dispecerat.
 */
const PriceSummary = ({ vehicle, estimate }) => {
    if (!vehicle || estimate?.total == null) return null;

    return (
        <div className="price-summary-card">
            <div className="price-summary-header">
                <span>{vehicle.name}</span>
                <span className="crew-tag">{vehicle.crewLabel}</span>
            </div>

            <div className="price-total-row">
                <div>
                    <strong>Due at booking</strong>
                    <small>Booking price</small>
                </div>
                <span className="total-amount">{formatMoney(estimate.total)}</span>
            </div>

            {estimate.labor && (
                <div className="price-labor-row">
                    <div>
                        <strong>Labor • billed after completion</strong>
                        <small>{estimate.labor.detail}</small>
                    </div>
                    <span>{estimate.labor.label}</span>
                </div>
            )}
        </div>
    );
};

export default PriceSummary;
