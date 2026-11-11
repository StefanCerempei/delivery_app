import React, { useState, useMemo } from 'react';
import { useBooking } from '../../context/BookingContext';
import Button from '../../components/Button';

const DAYS_RO = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
const MONTHS_RO = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec'];

const TIME_SLOTS = [
    { id: '08:00', label: '08:00 – 09:00' },
    { id: '09:00', label: '09:00 – 10:00' },
    { id: '10:00', label: '10:00 – 11:00' },
    { id: '11:00', label: '11:00 – 12:00' },
    { id: '12:00', label: '12:00 – 13:00' },
    { id: '13:00', label: '13:00 – 14:00' },
    { id: '14:00', label: '14:00 – 15:00' },
    { id: '15:00', label: '15:00 – 16:00' },
    { id: '16:00', label: '16:00 – 17:00' },
    { id: '17:00', label: '17:00 – 18:00' },
    { id: '18:00', label: '18:00 – 19:00' },
    { id: '19:00', label: '19:00 – 20:00' }
];

const Step3Time = () => {
    const { bookingData, updateBookingData, nextStep } = useBooking();

    // Generăm următoarele 7 zile începând de mâine
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
                dayName: i === 1 ? 'Mâine' : DAYS_RO[d.getDay()],
                dayNumber: d.getDate(),
                monthName: MONTHS_RO[d.getMonth()]
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
                    dateLabel: `${dayObj.dayName}, ${dayObj.dayNumber} ${dayObj.monthName}`,
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
                <h1>Când ai nevoie de Reloq?</h1>
                <p className="subtitle">
                    Poți chema un echipaj imediat sau poți rezerva o fereastră orară.
                </p>
            </div>

            {/* Opțiunile principale: ASAP vs Programat */}
            <div className="time-mode-list">
                <div
                    className={`time-mode-card ${mode === 'asap' ? 'selected' : ''}`}
                    onClick={() => setMode('asap')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setMode('asap')}
                >
                    <div className="time-mode-icon">⚡</div>
                    <div className="time-mode-info">
                        <div className="time-mode-title">
                            <strong>Acum (în ~30 min)</strong>
                            <span className="instant-pill">Rapid</span>
                        </div>
                        <p>Cel mai apropiat echipaj Reloq pleacă imediat spre adresa de preluare.</p>
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
                    <div className="time-mode-icon">📅</div>
                    <div className="time-mode-info">
                        <div className="time-mode-title">
                            <strong>Programează mai târziu</strong>
                        </div>
                        <p>Alege ziua și intervalul orar convenabil pentru tine.</p>
                    </div>
                    <span className={`radio-circle ${mode === 'scheduled' ? 'checked' : ''}`} />
                </div>
            </div>

            {/* Selector zi + oră când este selectat "Programează" */}
            {mode === 'scheduled' && (
                <div className="schedule-picker-box">
                    <span className="picker-section-label">SELECTEAZĂ ZIUA</span>
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
            INTERVAL ORAR DE SOSIRE
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
                    Continuă la detalii obiecte →
                </Button>
                <p className="trust-note">
                    Anulare gratuită cu până la 2 ore înainte de preluare
                </p>
            </div>
        </div>
    );
};

export default Step3Time;