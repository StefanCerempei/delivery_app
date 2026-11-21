import React, { useState } from 'react';
import { api } from '../api/client';
import { stripePromise, stripeAppearance } from '../utils/stripe';
import { formatMoney } from '../utils/formatters';
import Button from './Button';
import PaymentMethodPicker from './PaymentMethodPicker';

/** Plata manoperei în contul clientului: rezumat + plată cu card / Apple Pay / Google Pay. */
const LaborPayment = ({ order, onPaid, autoOpen = false }) => {
    const [clientSecret, setClientSecret] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [opened, setOpened] = useState(false);
    const amount = order.laborBilling?.amount;

    const open = async () => {
        setError('');
        setLoading(true);
        try {
            const res = await api.laborIntent(order.id);
            setClientSecret(res.clientSecret);
            setOpened(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Venit din linkul din email (/account?pay=…): deschidem direct plata
    React.useEffect(() => {
        if (autoOpen && stripePromise && !opened && !loading) open();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpen]);

    return (
        <div className="labor-pay" id={`pay-${order.id}`}>
            <div className="labor-pay-head">
                <div>
                    <span className="labor-pay-label">Labor payment due</span>
                    <strong>{formatMoney(amount)}</strong>
                    <small>
                        {order.laborActual ? `${order.laborActual.minutes} min` : ''}
                        {order.price?.labor ? ` · ${order.price.labor.label}` : ''} · #{order.id}
                    </small>
                </div>
                {!clientSecret && (
                    <div className="labor-pay-cta">
                        <Button onClick={open} loading={loading} disabled={!stripePromise}>
                            Pay {formatMoney(amount)}
                        </Button>
                    </div>
                )}
            </div>
            {!stripePromise && <p className="form-inline-error">Online payments aren’t available right now. Please contact us.</p>}
            {error && <p className="form-inline-error">{error}</p>}
            {clientSecret && (
                <PaymentMethodPicker
                    stripePromise={stripePromise}
                    appearance={stripeAppearance}
                    order={{ id: order.id, totalAmount: amount, currency: order.currency }}
                    clientSecret={clientSecret}
                    onPaid={onPaid}
                    returnParam="labor_return"
                    confirmOnServer={api.laborConfirm}
                    exclude={['amazonPay', 'paypal']}
                />
            )}
        </div>
    );
};

export default LaborPayment;
