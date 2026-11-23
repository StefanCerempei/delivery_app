import React, { useState } from 'react';
import { formatMoney } from '../utils/formatters';

/**
 * Defalcarea prețului (specificația RELOQ): Reservation fee + Service fee + Transportation,
 * plătite la rezervare, și tariful de manoperă (Labor), facturat după job.
 * Liniile vin calculate de server (/api/estimate), deci sunt identice cu cele din emailuri și dispecerat.
 * Totalul e mereu vizibil; detaliile liniilor se deschid la cerere.
 */
const PriceSummary = ({ vehicle, estimate }) => {
    const [open, setOpen] = useState(false);
    if (!vehicle || !estimate?.lines) return null;

    return (
        <div className="price-summary-card">
            <div className="price-total-row">
                <div>
                    <strong>Due at booking</strong>
                    <small>{vehicle.name} • {vehicle.crewLabel}</small>
                </div>
                <span className="total-amount">{formatMoney(estimate.total)}</span>
            </div>

            {estimate.labor && (
                <p className="price-labor-line">
                    + Labor <strong>{estimate.labor.label.split(' (')[0]}</strong> after the move, for actual time only
                </p>
            )}

            <button
                type="button"
                className="price-toggle"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
            >
                {open ? 'Hide price details' : 'See price details'}
                <span aria-hidden="true" className={`price-toggle-chev ${open ? 'open' : ''}`}>›</span>
            </button>

            {open && (
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
                    {estimate.labor && <p className="price-row-detail price-labor-detail">Labor: {estimate.labor.label}. {estimate.labor.detail}</p>}
                </div>
            )}
        </div>
    );
};

export default PriceSummary;
