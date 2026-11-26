import React from 'react';
import { useBooking } from '../context/BookingContext';
import MapPreview from '../components/MapPreview';
import StepProgress from '../components/StepProgress';
import Step1Route from '../features/booking/Step1Route';
import Step2Vehicle from '../features/booking/Step2Vehicle';
import Step3Time from '../features/booking/Step3Time';
import Step4Items from '../features/booking/Step4Items';
import Step5Pay from '../features/booking/Step5Pay';
import BookingSuccess from '../features/booking/BookingSuccess';
import './BookingPage.css';

const BookingPage = () => {
    const { currentStep, completedOrder, paymentReturn, pinMode } = useBooking();

    const renderStep = () => {
        if (paymentReturn === 'checking') {
            return <div className="account-gate-card is-loading">Confirming your payment…</div>;
        }
        if (completedOrder) {
            return <BookingSuccess />;
        }

        switch (currentStep) {
            case 1:
                return <Step1Route />;
            case 2:
                return <Step4Items />;
            case 3:
                return <Step2Vehicle />;
            case 4:
                return <Step3Time />;
            case 5:
                return <Step5Pay />;
            default:
                return <Step1Route />;
        }
    };

    return (
        <div className={`booking-layout ${pinMode ? 'pin-active' : ''} ${currentStep > 1 || completedOrder ? 'past-route' : ''}`}>
            {/* Pe telefon harta se mărește (~75% din ecran) cât timp clientul pune pinul */}
            <div className={`map-container ${pinMode ? 'pin-mode' : ''}`}>
                <MapPreview />
            </div>

            <aside className="wizard-container">
                {!completedOrder && <StepProgress />}
                <div className="wizard-content">{renderStep()}</div>
            </aside>
        </div>
    );
};

export default BookingPage;