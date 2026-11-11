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
    const { currentStep, completedOrder } = useBooking();

    const renderStep = () => {
        if (completedOrder) {
            return <BookingSuccess />;
        }

        switch (currentStep) {
            case 1:
                return <Step1Route />;
            case 2:
                return <Step2Vehicle />;
            case 3:
                return <Step3Time />;
            case 4:
                return <Step4Items />;
            case 5:
                return <Step5Pay />;
            default:
                return <Step1Route />;
        }
    };

    return (
        <div className="booking-layout">
            <div className="map-container">
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