import React from 'react';
import { Link } from 'react-router-dom';
import { useBooking } from '../../context/BookingContext';
import { formatPrice } from '../../utils/formatters';
import Button from '../../components/Button';

const BookingSuccess = () => {
    const { completedOrder, resetBooking } = useBooking();

    if (!completedOrder) return null;

    // Confirmat doar după ce dispecerul acceptă comanda; plata online înseamnă doar „trimis + plătit”.
    const confirmed = completedOrder.status === 'confirmed';
    const paid = Boolean(completedOrder.paidOnline);

    return (
        <div className="step-container success-view">
            <div className="success-hero">
                <div className="success-badge-icon">✓</div>
                <span className="order-code-pill">ORDER #{completedOrder.id}</span>
                <h1>{confirmed ? 'Booking confirmed!' : 'Order submitted successfully!'}</h1>
                <p className="subtitle" style={{ marginBottom: 0 }}>
                    {confirmed ? (
                        <>Your RELOQ account is active. We sent the confirmation to <strong>{completedOrder.customer?.email}</strong>.</>
                    ) : (
                        <>
                            {paid ? 'Payment received. ' : ''}We emailed <strong>{completedOrder.customer?.email}</strong> to confirm we received your
                            request — we'll email you again as soon as our team confirms it.
                        </>
                    )}
                </p>
            </div>

            {/* Status */}
            <div className="live-status-card">
                <div className="status-step active">
                    <span className="status-pulse" />
                    <div>
                        <strong>
                            {confirmed
                                ? `You're booked for ${completedOrder.scheduleText}`
                                : `Request received for ${completedOrder.scheduleText}`}
                        </strong>
                        <small>
                            {confirmed
                                ? "We'll let you know when your crew is on the way."
                                : "In a short time we'll confirm your order. You can follow its status anytime in My orders."}
                        </small>
                    </div>
                </div>
            </div>

            {/* Order details */}
            <div className="success-details-card">
                <div className="detail-line">
                    <span>Vehicle &amp; crew</span>
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
                        {paid
                            ? `Paid at booking${
                                  completedOrder.paymentMethod === 'paypal'
                                      ? ' (PayPal)'
                                      : completedOrder.cardLast4
                                        ? ` (card •••• ${completedOrder.cardLast4})`
                                        : ''
                              }`
                            : 'Pay after the job'}
                    </span>
                    <strong className="paid-sum">{formatPrice(completedOrder.totalAmount)}</strong>
                </div>
            </div>

            <p className="trust-note labor-note">
                Labor is not included in this amount — it is billed after the job
                {completedOrder.price?.labor ? ` at ${completedOrder.price.labor.label}` : ''}, based on actual time from crew arrival to completion.
            </p>

            <div className="step-footer">
                <Link to="/account" className="lugg-btn lugg-btn-primary" onClick={resetBooking}>
                    View my orders
                </Link>
                <Button variant="secondary" onClick={resetBooking}>
                    + Book another RELOQ
                </Button>
            </div>
        </div>
    );
};

export default BookingSuccess;
