export function formatPrice(amount) {
    if (amount == null || Number.isNaN(amount)) return '—';
    return `${Math.round(amount)} lei`;
}

export function formatDistance(km) {
    if (!km) return '0 km';
    return `${Number(km).toFixed(1)} km`;
}