import React, { useMemo, useState } from 'react';
import { useBooking } from '../../context/BookingContext';
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
                    {upcomingDays.map((day) => (
                        <button
                            key={day.dateStr}
                            type="button"
                            className={`day-chip ${selectedDate === day.dateStr ? 'active' : ''}`}
                            onClick={() => setSelectedDate(day.dateStr)}
                            aria-pressed={selectedDate === day.dateStr}
                        >
                            <span className="day-name">{day.dayName}</span>
                            <strong className="day-num">{day.dayNumber}</strong>
                            <span className="day-month">{day.monthName}</span>
                        </button>
                    ))}
                </div>

                <span className="picker-section-label" style={{ marginTop: '18px' }}>
                    ARRIVAL WINDOW
                </span>
                <div className="slots-grid">
                    {TIME_SLOTS.map((slot) => (
                        <button
                            key={slot.id}
                            type="button"
                            className={`slot-chip ${selectedSlot === slot.id ? 'active' : ''}`}
                            onClick={() => setSelectedSlot(slot.id)}
                            aria-pressed={selectedSlot === slot.id}
                        >
                            {slot.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="step-footer">
                <Button onClick={handleContinue} disabled={!selectedSlot}>
                    {selectedSlot ? 'Continue to payment →' : 'Pick an arrival window'}
                </Button>
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
