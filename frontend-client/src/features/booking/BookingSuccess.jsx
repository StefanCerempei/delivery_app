import React from 'react';
import { useBooking } from '../../context/BookingContext';
import { formatPrice } from '../../utils/formatters';
import Button from '../../components/Button';

const BookingSuccess = () => {
    const { completedOrder, resetBooking } = useBooking();

    if (!completedOrder) return null;

    return (
        <div className="step-container success-view">
            <div className="success-hero">
                <div className="success-badge-icon">✓</div>
                <span className="order-code-pill">COMANDA #{completedOrder.id}</span>
                <h1>Rezervare confirmată!</h1>
                <p className="subtitle" style={{ marginBottom: 0 }}>
                    Contul tău Reloq este activ. Am trimis confirmarea către{' '}
                    <strong>{completedOrder.customer?.email}</strong>.
                </p>
            </div>

            {/* Status live echipaj */}
            <div className="live-status-card">
                <div className="status-step active">
                    <span className="status-pulse" />
                    <div>
                        <strong>Căutăm echipajul Reloq cel mai apropiat</strong>
                        <small>Vei primi SMS la {completedOrder.customer?.phone} când șoferul pornește</small>
                    </div>
                </div>
            </div>

            {/* Detalii comandă */}
            <div className="success-details-card">
                <div className="detail-line">
                    <span>Vehicul & Echipaj</span>
                    <strong>
                        {completedOrder.vehicle?.name} ({completedOrder.vehicle?.crewLabel})
                    </strong>
                </div>
                <div className="detail-line">
                    <span>Programare</span>
                    <strong>{completedOrder.scheduleText}</strong>
                </div>
                <div className="detail-line">
                    <span>Obiecte</span>
                    <strong>{completedOrder.itemsDescription}</strong>
                </div>
                <div className="detail-line total">
                    <span>
                        {completedOrder.status === 'paid'
                            ? `Achitat${completedOrder.cardLast4 ? ` (card •••• ${completedOrder.cardLast4})` : ''}`
                            : 'De plată la finalizare'}
                    </span>
                    <strong className="paid-sum">{formatPrice(completedOrder.totalAmount)}</strong>
                </div>
            </div>

            <div className="step-footer">
                <Button variant="secondary" onClick={resetBooking}>
                    + Plasează o nouă comandă Reloq
                </Button>
            </div>
        </div>
    );
};

export default BookingSuccess;