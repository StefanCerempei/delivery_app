import React from 'react';

/** Cerc care se rotește (culoarea textului din jur). */
const Spinner = ({ size = 18, className = '' }) => (
    <svg className={`spinner ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path d="M21.5 12A9.5 9.5 0 0 0 12 2.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

/** Încărcare pe toată zona (pagini, tabele): spinner + text, anunțat și cititoarelor de ecran. */
export const PageLoader = ({ label = 'Loading…', compact = false }) => (
    <div className={`page-loader ${compact ? 'compact' : ''}`} role="status" aria-live="polite">
        <span className="page-loader-ring">
            <Spinner size={compact ? 22 : 34} />
        </span>
        <span className="page-loader-label">{label}</span>
    </div>
);

export default Spinner;
