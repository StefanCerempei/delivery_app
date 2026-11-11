import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const BookingContext = createContext();

export const useBooking = () => useContext(BookingContext);

const EMPTY_BOOKING = {
    pickup: null, // { address, lat, lng }
    dropoff: null, // { address, lat, lng }
    routeInfo: null, // { distanceMiles, durationMins }
    vehicle: null, // 'courier' | 'lite' | 'pickup' | 'van'
    priceEstimate: null, // estimarea de la server pentru vehiculul ales
    scheduledTime: 'asap', // 'asap' sau { dateStr, slotId, dateLabel, slotLabel }
    itemsDescription: '',
    photos: []
};

export const BookingProvider = ({ children }) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [completedOrder, setCompletedOrder] = useState(null);
    const [bookingData, setBookingData] = useState(EMPTY_BOOKING);

    // Contul clientului vine din sesiunea de pe server (cookie httpOnly), nu din localStorage.
    const [user, setUser] = useState(null);
    const [authChecked, setAuthChecked] = useState(false);

    useEffect(() => {
        api.me()
            .then(({ user }) => setUser(user))
            .catch(() => setUser(null))
            .finally(() => setAuthChecked(true));
    }, []);

    const updateBookingData = useCallback((newData) => {
        setBookingData((prev) => ({ ...prev, ...newData }));
    }, []);

    const nextStep = () => setCurrentStep((p) => Math.min(p + 1, 5));
    const prevStep = () => setCurrentStep((p) => Math.max(p - 1, 1));

    const registerUser = async (payload) => {
        const { user } = await api.register(payload);
        setUser(user);
        return user;
    };

    const loginUser = async (email, password) => {
        const { user } = await api.login(email, password);
        setUser(user);
        return user;
    };

    const logoutUser = async () => {
        try {
            await api.logout();
        } finally {
            setUser(null);
        }
    };

    const resetBooking = () => {
        bookingData.photos?.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
        setCurrentStep(1);
        setCompletedOrder(null);
        setBookingData(EMPTY_BOOKING);
    };

    return (
        <BookingContext.Provider
            value={{
                currentStep,
                setCurrentStep,
                nextStep,
                prevStep,
                bookingData,
                updateBookingData,
                user,
                authChecked,
                registerUser,
                loginUser,
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
