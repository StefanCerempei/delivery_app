import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';
import Spinner from '../components/Spinner';

/** Întoarcerea de pe pagina de plată Stripe (linkul trimis de dispecer). */
const PaymentCompletePage = () => {
    const [params] = useSearchParams();
    const sessionId = params.get('session_id');
    const cancelled = params.get('cancelled') === '1';
    const [state, setState] = useState(sessionId ? 'checking' : cancelled ? 'cancelled' : 'unknown');
    const [info, setInfo] = useState(null);

    useEffect(() => {
        if (!sessionId) return;
        let tries = 0;
        let timer;
        const check = () => {
            api.paymentLinkComplete(sessionId)
                .then((res) => {
                    setInfo(res);
                    if (res.paid) setState('paid');
                    else if (++tries < 5) timer = setTimeout(check, 2000);
                    else setState('pending');
                })
                .catch(() => setState('error'));
        };
        check();
        return () => clearTimeout(timer);
    }, [sessionId]);

    return (
        <div className="paydone-page">
            <div className="paydone-card">
                <Logo height={28} />
                {state === 'checking' && (
                    <>
                        <Spinner size={28} />
                        <p>Checking your payment…</p>
                    </>
                )}
                {state === 'paid' && (
                    <>
                        <div className="paydone-icon ok">✓</div>
                        <h1>Payment received — you're booked!</h1>
                        <p>
                            Thank you! Your RELOQ move{info?.schedule ? ` on ${info.schedule}` : ''} is confirmed
                            {info?.orderCode ? ` (order ${info.orderCode})` : ''}. A confirmation email is on its way.
                        </p>
                        <p className="paydone-muted">Labor is billed after the job, based on the actual time, in 5-minute increments.</p>
                    </>
                )}
                {state === 'pending' && (
                    <>
                        <div className="paydone-icon">…</div>
                        <h1>We're confirming your payment</h1>
                        <p>Your payment is being processed. You'll receive a confirmation email shortly.</p>
                    </>
                )}
                {state === 'cancelled' && (
                    <>
                        <div className="paydone-icon">!</div>
                        <h1>Payment not completed</h1>
                        <p>No charge was made. You can open the payment link from your email again, or call us and we'll help.</p>
                    </>
                )}
                {(state === 'error' || state === 'unknown') && (
                    <>
                        <div className="paydone-icon">!</div>
                        <h1>We couldn't check this payment</h1>
                        <p>If you paid, you'll receive a confirmation email. Questions? Call us.</p>
                    </>
                )}
                <p className="paydone-contact">
                    <a href="tel:+15088167230">(508) 816-7230</a> · <Link to="/">reloqmove.com</Link>
                </p>
            </div>
        </div>
    );
};

export default PaymentCompletePage;
