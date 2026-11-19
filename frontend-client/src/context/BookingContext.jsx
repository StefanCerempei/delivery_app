import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { api } from '../api/client';

// Parametrul pus în return_url când Stripe trimite clientul pe alt site (ex. Amazon Pay).
// La întoarcere verificăm plata pe server și arătăm pagina de succes.
export const PAYMENT_RETURN_PARAM = 'payment_return';

const BookingContext = createContext();

export const useBooking = () => useContext(BookingContext);

const EMPTY_BOOKING = {
    pickup: null, // { address, lat, lng }
    dropoff: null, // { address, lat, lng }
    routeInfo: null, // { distanceMiles, durationMins }
    vehicle: null, // 'courier' | 'lite' | 'pickup' | 'van'
    priceEstimate: null, // estimarea de la server pentru vehiculul ales
    items: [], // [{ id, label, size, qty }] alese din catalog
    itemsNotes: '', // note de acces opționale
    // Etaj, lift, apartament, note de acces — pentru fiecare adresă
    pickupDetails: { unit: '', floor: '', elevator: null, notes: '' },
    dropoffDetails: { unit: '', floor: '', elevator: null, notes: '' },
    scheduledTime: null, // { dateStr, slotId, dateLabel, slotLabel } — doar programat, de mâine încolo
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
            data: {
                ...EMPTY_BOOKING,
                ...draft.data,
                // drafturi vechi cu „asap” (opțiune scoasă) → clientul alege din nou ziua
                scheduledTime: typeof draft.data?.scheduledTime === 'object' ? draft.data.scheduledTime : null,
                photos: []
            }
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
    const [paymentReturn, setPaymentReturn] = useState(() =>
        new URLSearchParams(window.location.search).get(PAYMENT_RETURN_PARAM) ? 'checking' : null
    );
    const [paymentNotice, setPaymentNotice] = useState('');
    // Marcarea exactă pe hartă: 'pickup' | 'dropoff' | null (pinul se poate trage / harta atinsă)
    const [pinMode, setPinMode] = useState(null);

    // Contul vine din AuthContext (global în aplicație)
    const { user, authChecked, registerUser, loginUser, logoutUser } = useAuth();

    useEffect(() => {
        if (!completedOrder) writeDraft(currentStep, bookingData);
    }, [currentStep, bookingData, completedOrder]);

    // Primește un obiect sau o funcție (prev) => obiect, pentru actualizări care depind de starea curentă
    const updateBookingData = useCallback((newData) => {
        setBookingData((prev) => ({ ...prev, ...(typeof newData === 'function' ? newData(prev) : newData) }));
    }, []);

    const nextStep = () => {
        setPinMode(null);
        setCurrentStep((p) => Math.min(p + 1, 5));
    };
    const prevStep = () => setCurrentStep((p) => Math.max(p - 1, 1));

    const setCompletedOrder = (order) => {
        clearDraft();
        setCompletedOrderState(order);
    };

    // Întoarcerea dintr-o plată cu redirect (Amazon Pay): /?payment_return=RLQ-…&redirect_status=…
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get(PAYMENT_RETURN_PARAM);
        if (!code) return;
        const redirectStatus = params.get('redirect_status');
        window.history.replaceState(null, '', window.location.pathname); // fără parametri în adresă

        api.confirmPayment(code)
            .then(({ order }) => {
                if (order?.paidOnline) {
                    setCompletedOrder(order);
                } else {
                    setCurrentStep(5);
                    setPaymentNotice(
                        redirectStatus === 'failed'
                            ? 'Your payment was not completed. Please try again or choose another payment method.'
                            : 'We could not confirm your payment yet. If you were charged, we will email you shortly — otherwise please try again.'
                    );
                }
            })
            .catch(() => {
                setCurrentStep(5);
                setPaymentNotice('We could not check your payment. Please refresh the page or contact us if you were charged.');
            })
            .finally(() => setPaymentReturn(null));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                pinMode,
                setPinMode,
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
                paymentReturn,
                paymentNotice,
                setPaymentNotice,
                resetBooking
            }}
        >
            {children}
        </BookingContext.Provider>
    );
};
