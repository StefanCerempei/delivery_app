import React from 'react';
import { COMPANY } from '../data/company';

/** „★★★★★ 5.0 · 352 Google reviews” — link spre pagina RELOQ de pe Google Maps. */
const GoogleRating = ({ extra = null, className = '' }) => (
    <a
        className={`google-rating ${className}`}
        href={COMPANY.googleReviewsUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Rated ${COMPANY.googleRating.toFixed(1)} out of 5 from ${COMPANY.googleReviewCount} Google reviews`}
    >
        <span className="google-rating-stars" aria-hidden="true">
            ★★★★★
        </span>
        <strong>{COMPANY.googleRating.toFixed(1)}</strong>
        <span className="google-rating-count">
            · {COMPANY.googleReviewCount} Google reviews
        </span>
        {extra && <span className="google-rating-extra">· {extra}</span>}
    </a>
);

export default GoogleRating;
