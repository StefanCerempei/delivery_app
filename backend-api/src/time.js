// Reguli de dată în fusul orar al firmei (Massachusetts).
export const BUSINESS_TZ = 'America/New_York';

/** Data de azi în fusul orar al firmei, ca obiect Date la miezul nopții UTC (doar pentru comparații de zile). */
export function businessTodayUTC() {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, year: 'numeric', month: 'numeric', day: 'numeric' })
            .formatToParts(new Date())
            .map((p) => [p.type, p.value])
    );
    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

/** Parsează YYYY-MM-DD strict (respinge 2026-02-31 etc.). */
export function parseDateOnly(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    return date;
}

/** Vârsta în ani împliniți la data de azi (fusul firmei). */
export function ageOn(birth, today = businessTodayUTC()) {
    let age = today.getUTCFullYear() - birth.getUTCFullYear();
    const beforeBirthday =
        today.getUTCMonth() < birth.getUTCMonth() ||
        (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
    return beforeBirthday ? age - 1 : age;
}
