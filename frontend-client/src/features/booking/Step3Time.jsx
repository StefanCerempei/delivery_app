import React, { useState, useMemo } from 'react';
import { useBooking } from '../../context/BookingContext';
import Button from '../../components/Button';

const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const TIME_SLOTS = [
    { id: '08:00', label: '8:00 AM – 9:00 AM' },
    { id: '09:00', label: '9:00 AM – 10:00 AM' },
    { id: '10:00', label: '10:00 AM – 11:00 AM' },
    { id: '11:00', label: '11:00 AM – 12:00 PM' },
    { id: '12:00', label: '12:00 PM – 1:00 PM' },
    { id: '13:00', label: '1:00 PM – 2:00 PM' },
    { id: '14:00', label: '2:00 PM – 3:00 PM' },
    { id: '15:00', label: '3:00 PM – 4:00 PM' },
    { id: '16:00', label: '4:00 PM – 5:00 PM' },
    { id: '17:00', label: '5:00 PM – 6:00 PM' },
    { id: '18:00', label: '6:00 PM – 7:00 PM' },
    { id: '19:00', label: '7:00 PM – 8:00 PM' }
];

const Step3Time = () => {
    const { bookingData, updateBookingData, nextStep } = useBooking();

    const upcomingDays = useMemo(() => {
        const days = [];
        const base = new Date();
        for (let i = 1; i <= 7; i++) {
            const d = new Date(base);
            d.setDate(base.getDate() + i);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');

            days.push({
                dateStr: `${yyyy}-${mm}-${dd}`,
                dayName: i === 1 ? 'Tomorrow' : DAYS_EN[d.getDay()],
                dayNumber: d.getDate(),
                monthName: MONTHS_EN[d.getMonth()]
            });
        }
        return days;
    }, []);

    const initialScheduled =
        typeof bookingData.scheduledTime === 'object' && bookingData.scheduledTime !== null;

    const [mode, setMode] = useState(initialScheduled ? 'scheduled' : 'asap');
    const [selectedDate, setSelectedDate] = useState(
        initialScheduled ? bookingData.scheduledTime.dateStr : upcomingDays[0].dateStr
    );
    const [selectedSlot, setSelectedSlot] = useState(
        initialScheduled ? bookingData.scheduledTime.slotId : '10:00'
    );

    const handleContinue = () => {
        if (mode === 'asap') {
            updateBookingData({ scheduledTime: 'asap' });
        } else {
            const dayObj = upcomingDays.find((d) => d.dateStr === selectedDate) || upcomingDays[0];
            const slotObj = TIME_SLOTS.find((s) => s.id === selectedSlot) || TIME_SLOTS[2];

            updateBookingData({
                scheduledTime: {
                    type: 'scheduled',
                    dateStr: dayObj.dateStr,
                    dateLabel: `${dayObj.dayName}, ${dayObj.monthName} ${dayObj.dayNumber}`,
                    slotId: slotObj.id,
                    slotLabel: slotObj.label,
                    iso: `${dayObj.dateStr}T${slotObj.id}:00`
                }
            });
        }
        nextStep();
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>When do you need Reloq?</h1>
                <p className="subtitle">
                    Request a crew right away or book an arrival window in advance.
                </p>
            </div>

            <div className="time-mode-list">
                <div
                    className={`time-mode-card ${mode === 'asap' ? 'selected' : ''}`}
                    onClick={() => setMode('asap')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setMode('asap')}
                >
                    <div className="time-mode-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg></div>
                    <div className="time-mode-info">
                        <div className="time-mode-title">
                            <strong>Now (in ~30 min)</strong>
                            <span className="instant-pill">Fastest</span>
                        </div>
                        <p>The nearest available Reloq crew heads straight to your pickup.</p>
                    </div>
                    <span className={`radio-circle ${mode === 'asap' ? 'checked' : ''}`} />
                </div>

                <div
                    className={`time-mode-card ${mode === 'scheduled' ? 'selected' : ''}`}
                    onClick={() => setMode('scheduled')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setMode('scheduled')}
                >
                    <div className="time-mode-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18" /></svg></div>
                    <div className="time-mode-info">
                        <div className="time-mode-title">
                            <strong>Schedule for later</strong>
                        </div>
                        <p>Pick a date and 1-hour arrival window that fits your plan.</p>
                    </div>
                    <span className={`radio-circle ${mode === 'scheduled' ? 'checked' : ''}`} />
                </div>
            </div>

            {mode === 'scheduled' && (
                <div className="schedule-picker-box">
                    <span className="picker-section-label">SELECT DATE</span>
                    <div className="days-strip">
                        {upcomingDays.map((day) => {
                            const active = selectedDate === day.dateStr;
                            return (
                                <button
                                    key={day.dateStr}
                                    type="button"
                                    className={`day-chip ${active ? 'active' : ''}`}
                                    onClick={() => setSelectedDate(day.dateStr)}
                                >
                                    <span className="day-name">{day.dayName}</span>
                                    <strong className="day-num">{day.dayNumber}</strong>
                                    <span className="day-month">{day.monthName}</span>
                                </button>
                            );
                        })}
                    </div>

                    <span className="picker-section-label" style={{ marginTop: '18px' }}>
            ARRIVAL WINDOW
          </span>
                    <div className="slots-grid">
                        {TIME_SLOTS.map((slot) => {
                            const active = selectedSlot === slot.id;
                            return (
                                <button
                                    key={slot.id}
                                    type="button"
                                    className={`slot-chip ${active ? 'active' : ''}`}
                                    onClick={() => setSelectedSlot(slot.id)}
                                >
                                    {slot.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="step-footer">
                <Button onClick={handleContinue}>
                    Continue to item details →
                </Button>
                <p className="trust-note">
                    Free cancellation up to 2 hours before pickup
                </p>
            </div>
        </div>
    );
};

export default Step3Time;