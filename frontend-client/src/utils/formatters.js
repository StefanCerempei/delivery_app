export function formatPrice(amount) {
    if (amount == null || Number.isNaN(amount)) return '—';
    return `$${Math.round(amount)}`;
}

export function formatDistance(miles) {
    if (!miles) return '0 mi';
    return `${Number(miles).toFixed(1)} mi`;
}