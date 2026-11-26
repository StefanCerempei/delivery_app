import React from 'react';
import { useBooking } from '../context/BookingContext';
import Logo from './Logo';
import { AccountChip } from './MapPreview';

const STEP_LABELS = ['Route', 'Items', 'Vehicle', 'Schedule', 'Payment'];

const StepProgress = () => {
    const { currentStep, prevStep } = useBooking();

    return (
        <div className="lugg-header">
            <div className="lugg-header-top">
                {currentStep > 1 ? (
                    <button
                        type="button"
                        className="step-back-btn"
                        onClick={prevStep}
                        aria-label={`Back to ${STEP_LABELS[currentStep - 2]}`}
                    >
                        <span className="step-back-icon" aria-hidden="true">
                            <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                                <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        <span className="step-back-text">
                            <span>Back</span>
                            <small>{STEP_LABELS[currentStep - 2]}</small>
                        </span>
                    </button>
                ) : (
                    <div className="brand-mark">
                        <Logo height={26} />
                    </div>
                )}

                <span className="step-header-right">
                    {/* Pe telefon harta (cu butonul de cont) e doar la pasul 1: de la pasul 2 contul e aici */}
                    {currentStep > 1 && (
                        <span className="header-account">
                            <AccountChip />
                        </span>
                    )}
                <span className="step-counter">
                    <span className="step-counter-label">{STEP_LABELS[currentStep - 1]} • </span>
                    {currentStep}/5
                </span>
                </span>
            </div>

            <div className="progress-segments">
                {[1, 2, 3, 4, 5].map((step) => (
                    <div
                        key={step}
                        className={`progress-segment ${
                            step < currentStep ? 'completed' : step === currentStep ? 'active' : ''
                        }`}
                    />
                ))}
            </div>
        </div>
    );
};

export default StepProgress;