import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useBooking } from '../../context/BookingContext';
import { api } from '../../api/client';
import Button from '../../components/Button';
import { COMPANY } from '../../data/company';

const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Câte zile în avans se poate rezerva (prima zi disponibilă e mâine)
const BOOKING_WINDOW_DAYS = 14;

// Firma operează în Massachusetts: „mâine” se calculează după ora de acolo,
// nu după fusul orar al browserului. Serverul verifică aceeași regulă.
const BUSINESS_TZ = 'America/New_York';

// Ferestre de sosire de 2 ore. Echipa sună clientul cu ~45 min înainte de sosire.
export const TIME_SLOTS = [
    { id: '07:00', label: '7:00 AM – 9:00 AM' },
    { id: '09:00', label: '9:00 AM – 11:00 AM' },
    { id: '11:00', label: '11:00 AM – 1:00 PM' },
    { id: '13:00', label: '1:00 PM – 3:00 PM' },
    { id: '15:00', label: '3:00 PM – 5:00 PM' }
];

/** Data de azi (an, lună, zi) în fusul orar al firmei. */
function businessToday() {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, year: 'numeric', month: 'numeric', day: 'numeric' })
            .formatToParts(new Date())
            .map((p) => [p.type, p.value])
    );
    return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

function buildDays() {
    const { y, m, d } = businessToday();
    const days = [];
    for (let i = 1; i <= BOOKING_WINDOW_DAYS; i++) {
        const date = new Date(Date.UTC(y, m - 1, d + i)); // calcul în UTC: fără probleme de oră de vară
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(date.getUTCDate()).padStart(2, '0');
        days.push({
            dateStr: `${yyyy}-${mm}-${dd}`,
            dayName: i === 1 ? 'Tomorrow' : DAYS_EN[date.getUTCDay()],
            dayNumber: date.getUTCDate(),
            monthName: MONTHS_EN[date.getUTCMonth()]
        });
    }
    return days;
}

const Step3Time = () => {
    const { bookingData, updateBookingData, nextStep } = useBooking();
    const upcomingDays = useMemo(buildDays, []);

    // Păstrăm alegerea anterioară doar dacă data e încă disponibilă (ex. draft vechi)
    const saved =
        bookingData.scheduledTime && typeof bookingData.scheduledTime === 'object' ? bookingData.scheduledTime : null;
    const savedValid = saved && upcomingDays.some((d) => d.dateStr === saved.dateStr);
    const savedSlotValid = savedValid && TIME_SLOTS.some((s) => s.id === saved.slotId);

    const [selectedDate, setSelectedDate] = useState(savedValid ? saved.dateStr : upcomingDays[0].dateStr);
    const [selectedSlot, setSelectedSlot] = useState(savedSlotValid ? saved.slotId : null);

    // Ferestrele deja rezervate de alți clienți: { 'YYYY-MM-DD': ['09:00', ...] }. Ele nu mai apar la alegere.
    const [taken, setTaken] = useState({});
    const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
    const [notice, setNotice] = useState('');

    const loadAvailability = useCallback(async () => {
        try {
            // în fundal (la fiecare minut): fără bara de încărcare
            const { taken } = await api.availability(upcomingDays[0].dateStr, upcomingDays[upcomingDays.length - 1].dateStr, {
                quiet: true
            });
            setTaken(taken || {});
        } catch {
            // Fără răspuns: serverul verifică oricum la rezervare.
        } finally {
            setAvailabilityLoaded(true);
        }
    }, [upcomingDays]);

    // La deschidere, apoi la fiecare minut și când clientul revine în tab
    useEffect(() => {
        loadAvailability();
        const timer = setInterval(loadAvailability, 60000);
        const onFocus = () => document.visibilityState === 'visible' && loadAvailability();
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [loadAvailability]);

    const freeSlots = (dateStr) => TIME_SLOTS.filter((s) => !(taken[dateStr] || []).includes(s.id));
    const isFull = (dateStr) => freeSlots(dateStr).length === 0;
    const visibleSlots = freeSlots(selectedDate);

    // Dacă ora aleasă a fost între timp rezervată de altcineva, o scoatem
    useEffect(() => {
        if (selectedSlot && (taken[selectedDate] || []).includes(selectedSlot)) {
            setSelectedSlot(null);
            setNotice('The arrival window you picked was just booked. Please choose another one.');
        }
    }, [taken, selectedDate, selectedSlot]);

    // Prima zi afișată plină → trecem la prima zi cu locuri libere
    useEffect(() => {
        if (!availabilityLoaded || !isFull(selectedDate)) return;
        const firstFree = upcomingDays.find((d) => !isFull(d.dateStr));
        if (firstFree && !selectedSlot) setSelectedDate(firstFree.dateStr);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availabilityLoaded, taken]);

    const handleContinue = () => {
        const dayObj = upcomingDays.find((d) => d.dateStr === selectedDate);
        const slotObj = TIME_SLOTS.find((s) => s.id === selectedSlot);
        if (!dayObj || !slotObj) return;

        updateBookingData({
            scheduledTime: {
                type: 'scheduled',
                dateStr: dayObj.dateStr,
                dateLabel: `${dayObj.dayName}, ${dayObj.monthName} ${dayObj.dayNumber}`,
                slotId: slotObj.id,
                slotLabel: slotObj.label
            }
        });
        nextStep();
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>When should we arrive?</h1>
                <p className="subtitle">
                    Pick a date and a 2-hour arrival window. Bookings open from tomorrow onward.
                </p>
            </div>

            <div className="schedule-picker-box">
                <span className="picker-section-label">SELECT DATE</span>
                <div className="days-strip">
                    {upcomingDays.map((day) => {
                        const full = isFull(day.dateStr);
                        return (
                            <button
                                key={day.dateStr}
                                type="button"
                                className={`day-chip ${selectedDate === day.dateStr ? 'active' : ''} ${full ? 'full' : ''}`}
                                onClick={() => {
                                    setSelectedDate(day.dateStr);
                                    setNotice('');
                                    if (selectedSlot && (taken[day.dateStr] || []).includes(selectedSlot)) setSelectedSlot(null);
                                }}
                                disabled={full}
                                aria-pressed={selectedDate === day.dateStr}
                            >
                                <span className="day-name">{day.dayName}</span>
                                <strong className="day-num">{day.dayNumber}</strong>
                                <span className="day-month">{full ? 'Full' : day.monthName}</span>
                            </button>
                        );
                    })}
                </div>

                <span className="picker-section-label" style={{ marginTop: '18px' }}>
                    ARRIVAL WINDOW
                </span>
                {visibleSlots.length === 0 ? (
                    <p className="slots-empty">This day is fully booked. Please pick another date.</p>
                ) : (
                    <div className="slots-grid">
                        {visibleSlots.map((slot) => (
                            <button
                                key={slot.id}
                                type="button"
                                className={`slot-chip ${selectedSlot === slot.id ? 'active' : ''}`}
                                onClick={() => {
                                    setSelectedSlot(slot.id);
                                    setNotice('');
                                }}
                                aria-pressed={selectedSlot === slot.id}
                            >
                                {slot.label}
                            </button>
                        ))}
                    </div>
                )}
                {notice && <p className="form-inline-error">{notice}</p>}
            </div>

            <div className="step-footer">
                <Button onClick={handleContinue} disabled={!selectedSlot}>
                    {selectedSlot ? 'Continue to payment →' : 'Pick an arrival window'}
                </Button>
            </div>
            <div className="step-notes">
                <p className="trust-note">
                    Our crew calls you about 45 minutes before arrival
                </p>
                <p className="trust-note">
                    Free cancellation up to {COMPANY.freeCancellationHours} hours before your arrival window
                </p>
            </div>
        </div>
    );
};

export default Step3Time;
