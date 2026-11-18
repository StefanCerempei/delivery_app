// Etichetele statusurilor de comandă, folosite de client (My account) și de dispecerat.
export const STATUS_LABELS = {
    pending_payment: 'New',
    paid: 'Paid • to confirm',
    confirmed: 'Confirmed',
    en_route: 'En route',
    completed: 'Completed',
    cancelled: 'Cancelled'
};

// Varianta pentru client: „Awaiting payment” la plata la livrare sună alarmant, deci explicăm.
export const CUSTOMER_STATUS_LABELS = {
    pending_payment: 'Submitted • we’ll confirm shortly',
    paid: 'Paid • we’ll confirm shortly',
    confirmed: 'Confirmed',
    en_route: 'Crew on the way',
    completed: 'Completed',
    cancelled: 'Cancelled'
};
