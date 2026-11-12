// Etichetele statusurilor de comandă, folosite de client (My account) și de dispecerat.
export const STATUS_LABELS = {
    pending_payment: 'Awaiting payment',
    paid: 'Paid',
    en_route: 'En route',
    completed: 'Completed',
    cancelled: 'Cancelled'
};

// Varianta pentru client: „Awaiting payment” la plata la livrare sună alarmant, deci explicăm.
export const CUSTOMER_STATUS_LABELS = {
    pending_payment: 'Confirmed • pay after the job',
    paid: 'Confirmed • paid',
    en_route: 'Crew on the way',
    completed: 'Completed',
    cancelled: 'Cancelled'
};
