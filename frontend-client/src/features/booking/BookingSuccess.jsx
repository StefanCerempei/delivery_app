import React from 'react';
import { Link } from 'react-router-dom';
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
                <span className="order-code-pill">ORDER #{completedOrder.id}</span>
                <h1>Booking confirmed!</h1>
                <p className="subtitle" style={{ marginBottom: 0 }}>
                    Your Reloq account is active. We sent the confirmation to{' '}
                    <strong>{completedOrder.customer?.email}</strong>.
                </p>
            </div>

            {/* Live crew status */}
            <div className="live-status-card">
                <div className="status-step active">
                    <span className="status-pulse" />
                    <div>
                        <strong>You're booked for {completedOrder.scheduleText}</strong>
                        <small>
                            We'll text {completedOrder.customer?.phone} the day before and when your crew is on the way
                        </small>
                    </div>
                </div>
            </div>

            {/* Order details */}
            <div className="success-details-card">
                <div className="detail-line">
                    <span>Vehicle & crew</span>
                    <strong>
                        {completedOrder.vehicle?.name} ({completedOrder.vehicle?.crewLabel})
                    </strong>
                </div>
                <div className="detail-line">
                    <span>Schedule</span>
                    <strong>{completedOrder.scheduleText}</strong>
                </div>
                <div className="detail-line">
                    <span>Items</span>
                    <strong>{completedOrder.itemsDescription}</strong>
                </div>
                <div className="detail-line total">
                    <span>
                        {completedOrder.status === 'paid'
                            ? `Paid${completedOrder.cardLast4 ? ` (card •••• ${completedOrder.cardLast4})` : ''}`
                            : 'Pay after the job'}
                    </span>
                    <strong className="paid-sum">{formatPrice(completedOrder.totalAmount)}</strong>
                </div>
            </div>

            <div className="step-footer">
                <Link to="/account" className="lugg-btn lugg-btn-primary" onClick={resetBooking}>
                    View my orders
                </Link>
                <Button variant="secondary" onClick={resetBooking}>
                    + Book another Reloq
                </Button>
            </div>
        </div>
    );
};

export default BookingSuccess;