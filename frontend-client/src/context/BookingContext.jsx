import React, { createContext, useContext, useState, useEffect } from 'react';

const BookingContext = createContext();

export const useBooking = () => useContext(BookingContext);

export const BookingProvider = ({ children }) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [completedOrder, setCompletedOrder] = useState(null); // Variabila a fost adăugată aici

    const [bookingData, setBookingData] = useState({
        pickup: null,      // { address, lat, lng }
        dropoff: null,     // { address, lat, lng }
        routeInfo: null,   // { distanceMiles, durationMins }
        vehicle: null,     // 'courier', 'lite', 'pickup', 'van'
        priceEstimate: null,
        schedule: 'asap',  // sau obiect cu { date, timeSlot }
        items: [],
        itemsDescription: '',
        photos: []
    });

    // Funcție pentru actualizarea parțială a datelor
    const updateBookingData = (newData) => {
        setBookingData((prev) => ({ ...prev, ...newData }));
    };

    const nextStep = () => setCurrentStep((p) => Math.min(p + 1, 5));
    const prevStep = () => setCurrentStep((p) => Math.max(p - 1, 1));

    // Funcția esențială lipsă: Finalizează comanda și o pune în localStorage
    const completeOrder = (orderData) => {
        const newOrder = {
            ...orderData,
            id: Math.random().toString(36).substr(2, 9).toUpperCase(),
            createdAt: new Date().toISOString(),
            status: 'pending_payment' // Dispecerul poate vedea comanda în admin
        };

        setCompletedOrder(newOrder); // O salvează în state pentru ecranul de succes

        // Salvare în localStorage pentru panoul de Admin
        const existingOrders = JSON.parse(localStorage.getItem('reloq_orders') || '[]');
        localStorage.setItem('reloq_orders', JSON.stringify([newOrder, ...existingOrders]));
    };

    const resetBooking = () => {
        setCurrentStep(1);
        setCompletedOrder(null);
        setBookingData({
            pickup: null,
            dropoff: null,
            routeInfo: null,
            vehicle: null,
            priceEstimate: null,
            schedule: 'asap',
            items: [],
            itemsDescription: '',
            photos: []
        });
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
                completedOrder,     // Returnată pentru a fi folosită de BookingSuccess.jsx
                completeOrder,      // Funcția care generează comanda
                resetBooking
            }}
        >
            {children}
        </BookingContext.Provider>
    );
};