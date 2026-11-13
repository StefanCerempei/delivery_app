export function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

/** Doar numere din SUA: 10 cifre (opțional cu 1 / +1 în față), fără prefix zonal/centrală care începe cu 0 sau 1. */
export function isValidPhone(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return false;
    return !(digits[1] === '1' && digits[2] === '1'); // fără N11 (211, 911…)
}

/** Formatează pe măsură ce se tastează: 5085550192 → (508) 555-0192. Ignoră +1 din față. */
export function formatUsPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.length > 10 && digits.startsWith('1')) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length < 4) return `(${digits}`;
    if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatCardNumber(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function formatCardExpiry(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) {
        return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return digits;
}
export const MIN_AGE = 18;

/** Vârsta în ani împliniți pentru o dată de forma YYYY-MM-DD (null dacă e invalidă). */
export function ageFromBirthDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const birth = new Date(Date.UTC(y, mo - 1, d));
    if (birth.getUTCFullYear() !== y || birth.getUTCMonth() !== mo - 1 || birth.getUTCDate() !== d) return null;
    const now = new Date();
    let age = now.getUTCFullYear() - y;
    if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age -= 1;
    return age;
}

/** Ultima dată de naștere permisă (azi minus 18 ani), pentru atributul max al câmpului. */
export function maxBirthDate() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear() - MIN_AGE, now.getUTCMonth(), now.getUTCDate()));
    return d.toISOString().slice(0, 10);
}

/** Mesaj de eroare pentru data nașterii, sau '' dacă e în regulă. */
export function birthDateError(value) {
    if (!value) return 'Please enter your date of birth.';
    const age = ageFromBirthDate(value);
    if (age === null || age > 120) return 'Please enter a valid date of birth.';
    if (age < MIN_AGE) return `You must be at least ${MIN_AGE} years old to create a RELOQ account.`;
    return '';
}
