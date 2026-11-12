import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

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

// Rezervarea în curs se păstrează în tab-ul curent (sessionStorage), ca să nu se piardă
// dacă clientul merge la Log in / Sign up sau reîncarcă pagina. Pozele nu se păstrează
// (sunt doar previzualizări locale). Draft-ul dispare la închiderea tab-ului sau după comandă.
const DRAFT_KEY = 'reloq_booking_draft';

function readDraft() {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        const draft = JSON.parse(raw);
        return {
            step: Math.min(Math.max(Number(draft.step) || 1, 1), 5),
            data: { ...EMPTY_BOOKING, ...draft.data, photos: [] }
        };
    } catch {
        return null;
    }
}

function writeDraft(step, data) {
    try {
        const { photos, ...rest } = data;
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, data: rest }));
    } catch {
        // stocare indisponibilă (mod privat etc.) — continuăm fără draft
    }
}

function clearDraft() {
    try {
        sessionStorage.removeItem(DRAFT_KEY);
    } catch {
        // ignorăm
    }
}

export const BookingProvider = ({ children }) => {
    const draft = readDraft();
    const [currentStep, setCurrentStep] = useState(draft?.step || 1);
    const [completedOrder, setCompletedOrderState] = useState(null);
    const [bookingData, setBookingData] = useState(draft?.data || EMPTY_BOOKING);

    // Contul vine din AuthContext (global în aplicație)
    const { user, authChecked, registerUser, loginUser, logoutUser } = useAuth();

    useEffect(() => {
        if (!completedOrder) writeDraft(currentStep, bookingData);
    }, [currentStep, bookingData, completedOrder]);

    const updateBookingData = useCallback((newData) => {
        setBookingData((prev) => ({ ...prev, ...newData }));
    }, []);

    const nextStep = () => setCurrentStep((p) => Math.min(p + 1, 5));
    const prevStep = () => setCurrentStep((p) => Math.max(p - 1, 1));

    const setCompletedOrder = (order) => {
        clearDraft();
        setCompletedOrderState(order);
    };

    const resetBooking = () => {
        bookingData.photos?.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
        clearDraft();
        setCurrentStep(1);
        setCompletedOrderState(null);
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
