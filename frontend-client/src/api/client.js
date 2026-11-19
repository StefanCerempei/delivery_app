// Toate apelurile către backend trec pe aici.
// Implicit API-ul e pe același domeniu (/api). VITE_API_URL e necesar doar dacă e pe alt domeniu.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

async function request(path, { method = 'GET', body } = {}) {
    let res;
    try {
        res = await fetch(`${API_BASE}/api${path}`, {
            method,
            credentials: 'include', // trimite cookie-ul de sesiune
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined
        });
    } catch {
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

    availability: (from, to) => request(`/availability?from=${from}&to=${to}`),
    estimate: (pickup, dropoff) => request('/estimate', { method: 'POST', body: { pickup, dropoff } }),
    createOrder: (payload) => request('/orders', { method: 'POST', body: payload }),
    confirmPayment: (code) => request(`/orders/${encodeURIComponent(code)}/confirm-payment`, { method: 'POST' }),
    paypalCreate: (code) => request(`/orders/${encodeURIComponent(code)}/paypal/create`, { method: 'POST' }),
    paypalCapture: (code, paypalOrderId) =>
        request(`/orders/${encodeURIComponent(code)}/paypal/capture`, { method: 'POST', body: { paypalOrderId } }),
    myOrders: () => request('/orders/mine'),

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

    adminSchedule: (from, to) => request(`/admin/schedule?from=${from}&to=${to}`),
    adminSaveNotes: (code, notes) =>
        request(`/admin/orders/${encodeURIComponent(code)}/notes`, { method: 'PATCH', body: { notes } }),
    adminSendReminders: (date) => request('/admin/drivers/reminders', { method: 'POST', body: date ? { date } : {} }),

    // Pagina de job a șoferului (fără cont, cu tokenul din link)
    job: (token) => request(`/job/${encodeURIComponent(token)}`),
    jobAction: (token, action) => request(`/job/${encodeURIComponent(token)}/${action}`, { method: 'POST' }),

    adminDrivers: () => request('/admin/drivers'),
    adminCreateDriver: (payload) => request('/admin/drivers', { method: 'POST', body: payload }),
    adminUpdateDriver: (id, payload) => request(`/admin/drivers/${id}`, { method: 'PATCH', body: payload }),
    adminDeleteDriver: (id) => request(`/admin/drivers/${id}`, { method: 'DELETE' })
};

/** Doar adresa și coordonatele: atât cere API-ul. */
export const toLocation = (loc) => ({ address: loc.address, lat: Number(loc.lat), lng: Number(loc.lng) });
