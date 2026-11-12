import React from 'react';
import { useBooking } from '../context/BookingContext';
import Logo from './Logo';

const STEP_LABELS = ['Route', 'Vehicle', 'Schedule', 'Items', 'Payment'];

const StepProgress = () => {
    const { currentStep, prevStep } = useBooking();

    return (
        <div className="lugg-header">
            <div className="lugg-header-top">
                {currentStep > 1 ? (
                    <button type="button" className="back-btn" onClick={prevStep} aria-label="Back">
                        ← Back
                    </button>
                ) : (
                    <div className="brand-mark">
                        <Logo height={26} />
                    </div>
                )}

                <span className="step-counter">
          {STEP_LABELS[currentStep - 1]} • {currentStep}/5
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