import React from 'react';
import { formatMoney } from '../utils/formatters';

/**
 * Defalcarea prețului (specificația RELOQ): Reservation fee + Service fee + Transportation,
 * plătite la rezervare, și tariful de manoperă (Labor), facturat după job.
 * Liniile vin calculate de server (/api/estimate), deci sunt identice cu cele din emailuri și dispecerat.
 */
const PriceSummary = ({ vehicle, estimate }) => {
    if (!vehicle || !estimate?.lines) return null;

    return (
        <div className="price-summary-card">
            <div className="price-summary-header">
                <span>Fare breakdown • {vehicle.name}</span>
                <span className="crew-tag">{vehicle.crewLabel}</span>
            </div>

            <div className="price-rows">
                {estimate.lines.map((line) => (
                    <div className="price-row" key={line.key}>
                        <span>
                            {line.label}
                            {line.detail && <small className="price-row-detail">{line.detail}</small>}
                        </span>
                        <span>{formatMoney(line.amount)}</span>
                    </div>
                ))}
            </div>

            <div className="price-total-row">
                <div>
                    <strong>Due at booking</strong>
                    <small>Reservation, service &amp; transportation</small>
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
