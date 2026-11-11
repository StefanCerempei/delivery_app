import React, { createContext, useContext, useState } from 'react';

const BookingContext = createContext();

export const useBooking = () => useContext(BookingContext);

const INITIAL_BOOKING = {
    pickup: null,
    dropoff: null,
    routeInfo: null,
    vehicle: null,
    scheduledTime: 'asap',
    itemsDescription: '',
    photos: [],
    priceEstimate: null
};

function loadSavedUser() {
    try {
        const raw = localStorage.getItem('reloq_user');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export const BookingProvider = ({ children }) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [bookingData, setBookingData] = useState(INITIAL_BOOKING);
    const [user, setUser] = useState(loadSavedUser);
    const [completedOrder, setCompletedOrder] = useState(null);

    const updateBookingData = (newData) => {
        setBookingData((prev) => ({ ...prev, ...newData }));
    };

    const saveUserAccount = (accountData) => {
        setUser(accountData);
        try {
            localStorage.setItem('reloq_user', JSON.stringify(accountData));
        } catch (err) {
            console.warn('Nu s-a putut salva contul în localStorage:', err);
        }
    };

    const logoutUser = () => {
        setUser(null);
        localStorage.removeItem('reloq_user');
    };

    const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 5));
    const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

    const resetBooking = () => {
        setBookingData(INITIAL_BOOKING);
        setCompletedOrder(null);
        setCurrentStep(1);
    };

    return (
        <BookingContext.Provider
            value={{
                currentStep,
                setCurrentStep,
                bookingData,
                updateBookingData,
                nextStep,
                prevStep,
                user,
                saveUserAccount,
                logoutUser,
                completedOrder,
                setCompletedOrder,
                resetBooking
            }}
        >
            {children}
        </BookingContext.Provider>
    );
};