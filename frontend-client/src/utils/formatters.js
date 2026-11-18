/** „$29” pentru sume întregi, „$141.54” când există cenți (suma afișată = suma încasată). */
export function formatPrice(amount) {
    if (amount == null || Number.isNaN(amount)) return '—';
    const cents = Math.round(Number(amount) * 100);
    return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** Mereu cu două zecimale („$29.00”) — pentru defalcarea prețului. */
export function formatMoney(amount) {
    if (amount == null || Number.isNaN(amount)) return '—';
    return `$${(Math.round(Number(amount) * 100) / 100).toFixed(2)}`;
}

export function formatDistance(miles) {
    if (!miles) return '0 mi';
    return `${Number(miles).toFixed(1)} mi`;
}