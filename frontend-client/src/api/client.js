// Toate apelurile către backend trec pe aici.
import { trackRequest } from './loadingTracker';

// Implicit API-ul e pe același domeniu (/api). VITE_API_URL e necesar doar dacă e pe alt domeniu.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

/** `quiet`: cererile de fundal (căutare la tastare, reîmprospătări) nu aprind bara de încărcare. */
function request(path, options = {}) {
    const promise = rawRequest(path, options);
    return options.quiet ? promise : trackRequest(promise);
}

async function rawRequest(path, { method = 'GET', body, signal } = {}) {
    let res;
    try {
        res = await fetch(`${API_BASE}/api${path}`, {
            method,
            credentials: 'include', // trimite cookie-ul de sesiune
            signal,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    }

    // Dacă serverul API nu rulează, hostingul poate întoarce pagina HTML a site-ului în loc de JSON.
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    if (!isJson) {
        throw new ApiError('Our booking service is temporarily unavailable. Please try again shortly.', res.status);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
    }
    return data;
}

export const api = {
    config: () => request('/config'),

    me: () => request('/auth/me'),
    register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
    login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    forgotPassword: (email) => request('/auth/password/forgot', { method: 'POST', body: { email } }),
    resetPassword: (token, password) => request('/auth/password/reset', { method: 'POST', body: { token, password } }),
    updateProfile: (payload) => request('/account/profile', { method: 'PATCH', body: payload }),
    changePassword: (currentPassword, newPassword) =>
        request('/account/password', { method: 'POST', body: { currentPassword, newPassword } }),
    deleteAccount: (password) => request('/account', { method: 'DELETE', body: { password } }),
    sendVerificationCode: () => request('/auth/verify-email/send', { method: 'POST' }),
    confirmVerificationCode: (code) => request('/auth/verify-email/confirm', { method: 'POST', body: { code } }),

    reverseGeocode: (lat, lng) => request(`/reverse-geocode?lat=${lat}&lng=${lng}`),
    geocode: (q, signal) => request(`/geocode?q=${encodeURIComponent(q)}`, { signal, quiet: true }),
    availability: (from, to, { quiet = false } = {}) => request(`/availability?from=${from}&to=${to}`, { quiet }),
    estimate: (pickup, dropoff) => request('/estimate', { method: 'POST', body: { pickup, dropoff } }),
    createOrder: (payload) => request('/orders', { method: 'POST', body: payload }),
    checkDiscount: (code) => request('/discounts/check', { method: 'POST', body: { code } }),
    adminDiscounts: () => request('/admin/discounts'),
    adminCreateDiscount: (payload) => request('/admin/discounts', { method: 'POST', body: payload }),
    adminToggleDiscount: (id, active) => request(`/admin/discounts/${id}`, { method: 'PATCH', body: { active } }),
    confirmPayment: (code) => request(`/orders/${encodeURIComponent(code)}/confirm-payment`, { method: 'POST' }),
    paypalCreate: (code) => request(`/orders/${encodeURIComponent(code)}/paypal/create`, { method: 'POST' }),
    paypalCapture: (code, paypalOrderId) =>
        request(`/orders/${encodeURIComponent(code)}/paypal/capture`, { method: 'POST', body: { paypalOrderId } }),
    myOrders: () => request('/orders/mine'),
    // Plata manoperei după job (din contul clientului)
    laborIntent: (code) => request(`/orders/${encodeURIComponent(code)}/labor/intent`, { method: 'POST' }),
    laborConfirm: (code) => request(`/orders/${encodeURIComponent(code)}/labor/confirm`, { method: 'POST' }),

    adminOrders: () => request('/admin/orders'),
    adminOrder: (code) => request(`/admin/orders/${encodeURIComponent(code)}`),
    // driverId opțional: șoferul ales odată cu schimbarea statusului (ex. la confirmare)
    adminSetStatus: (code, status, driverId) =>
        request(`/admin/orders/${encodeURIComponent(code)}/status`, {
            method: 'PATCH',
            body: driverId === undefined ? { status } : { status, driverId }
        }),
    adminAssignDriver: (code, driverId, { resend = false } = {}) =>
        request(`/admin/orders/${encodeURIComponent(code)}/driver`, { method: 'PATCH', body: { driverId, resend } }),

    adminRevenue: (from, to) => request(`/admin/revenue?from=${from}&to=${to}`),
    adminCustomers: (q = '') => request(`/admin/customers?q=${encodeURIComponent(q)}`),
    adminCreateOrder: (payload) => request('/admin/orders', { method: 'POST', body: payload }),
    adminPaymentLink: (code) => request(`/admin/orders/${encodeURIComponent(code)}/payment-link`, { method: 'POST', body: {} }),
    paymentLinkComplete: (sessionId) => request(`/payment-link/complete?session_id=${encodeURIComponent(sessionId)}`),
    adminUpdateOrder: (code, changes) => request(`/admin/orders/${encodeURIComponent(code)}`, { method: 'PATCH', body: changes }),
    adminOrderHistory: (code) => request(`/admin/orders/${encodeURIComponent(code)}/history`),
    adminLabor: (code, action, extra = {}) =>
        request(`/admin/orders/${encodeURIComponent(code)}/labor`, { method: 'POST', body: { action, ...extra } }),
    // Ore / zile blocate (slot '*' = toată ziua)
    adminBlocks: (from, to) => request(`/admin/blocks?from=${from}&to=${to}`),
    adminBlock: (date, slot) => request('/admin/blocks', { method: 'POST', body: { date, slot } }),
    adminUnblock: (date, slot) => request('/admin/blocks', { method: 'DELETE', body: { date, slot } }),
    adminSchedule: (from, to) => request(`/admin/schedule?from=${from}&to=${to}`),
    adminSaveNotes: (code, notes) =>
        request(`/admin/orders/${encodeURIComponent(code)}/notes`, { method: 'PATCH', body: { notes } }),
    adminSendReminders: (date) => request('/admin/drivers/reminders', { method: 'POST', body: date ? { date } : {} }),

    // Pagina de job a șoferului (fără cont, cu tokenul din link)
    job: (token) => request(`/job/${encodeURIComponent(token)}`),
    jobAction: (token, action, body) => request(`/job/${encodeURIComponent(token)}/${action}`, { method: 'POST', body: body || {} }),

    // Panoul șoferului
    driverMe: () => request('/driver/me', { quiet: true }),
    driverLogin: (email, password) => request('/driver/login', { method: 'POST', body: { email, password } }),
    driverLoginLink: (email) => request('/driver/login-link', { method: 'POST', body: { email } }),
    driverSession: (token) => request('/driver/session', { method: 'POST', body: { token } }),
    driverLogout: () => request('/driver/logout', { method: 'POST' }),
    driverJobs: ({ quiet = false } = {}) => request('/driver/jobs', { quiet }),
    adminDriverLoginLink: (id) => request(`/admin/drivers/${id}/login-link`, { method: 'POST' }),
    adminSettings: () => request('/admin/settings'),
    adminUpdateSettings: (patch) => request('/admin/settings', { method: 'PATCH', body: patch }),

    adminDrivers: () => request('/admin/drivers'),
    adminCreateDriver: (payload) => request('/admin/drivers', { method: 'POST', body: payload }),
    adminUpdateDriver: (id, payload) => request(`/admin/drivers/${id}`, { method: 'PATCH', body: payload }),
    adminDeleteDriver: (id) => request(`/admin/drivers/${id}`, { method: 'DELETE' })
};

/** Încarcă o poză la o comandă (octeții imaginii, nu JSON). */
export function uploadOrderPhoto(code, blob) {
    return trackRequest(uploadOrderPhotoRaw(code, blob));
}

async function uploadOrderPhotoRaw(code, blob) {
    let res;
    try {
        res = await fetch(`${API_BASE}/api/orders/${encodeURIComponent(code)}/photos`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': blob.type || 'image/jpeg' },
            body: blob
        });
    } catch {
        throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || `Photo upload failed (${res.status})`, res.status, data);
    return data;
}

/** Linkul unei poze încărcate: pentru client și dispecer (cu sesiune) sau pentru șofer (cu tokenul jobului). */
export const orderPhotoUrl = (code, photoId) => `${API_BASE}/api/orders/${encodeURIComponent(code)}/photos/${photoId}`;
export const jobPhotoUrl = (token, photoId) => `${API_BASE}/api/job/${encodeURIComponent(token)}/photos/${photoId}`;

/** Doar adresa și coordonatele: atât cere API-ul. */
export const toLocation = (loc) => ({ address: loc.address, lat: Number(loc.lat), lng: Number(loc.lng) });
