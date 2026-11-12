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

    estimate: (pickup, dropoff) => request('/estimate', { method: 'POST', body: { pickup, dropoff } }),
    createOrder: (payload) => request('/orders', { method: 'POST', body: payload }),
    confirmPayment: (code) => request(`/orders/${encodeURIComponent(code)}/confirm-payment`, { method: 'POST' }),
    myOrders: () => request('/orders/mine'),

    adminOrders: () => request('/admin/orders'),
    adminOrder: (code) => request(`/admin/orders/${encodeURIComponent(code)}`),
    adminSetStatus: (code, status) =>
        request(`/admin/orders/${encodeURIComponent(code)}/status`, { method: 'PATCH', body: { status } })
};

/** Doar adresa și coordonatele: atât cere API-ul. */
export const toLocation = (loc) => ({ address: loc.address, lat: Number(loc.lat), lng: Number(loc.lng) });
