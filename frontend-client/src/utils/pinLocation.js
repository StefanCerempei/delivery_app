import { api } from '../api/client';

export const DEFAULT_CENTER = { lat: 42.3601, lng: -71.0589 }; // Boston, MA

const coordsLabel = (lat, lng) => `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
const round = (v) => Number(Number(v).toFixed(6));

/** Completează adresa unui loc ales pe hartă din punct (OpenStreetMap); altfel rămân coordonatele. */
function fillAddressFromPoint(updateBookingData, kind, lat, lng) {
    api.reverseGeocode(lat, lng)
        .then(({ result }) => result?.address || coordsLabel(lat, lng))
        .catch(() => coordsLabel(lat, lng))
        .then((address) =>
            updateBookingData((prev) => {
                const current = prev[kind];
                // între timp pinul s-a mutat din nou: ultima căutare decide
                if (!current || current.lat !== lat || current.lng !== lng) return {};
                return { [kind]: { ...current, address } };
            })
        );
}

/**
 * Mută pinul unei adrese (tras sau atingere pe hartă). Adresa scrisă rămâne;
 * pentru locurile alese direct pe hartă (`current.manual`) adresa se ia din punct.
 */
export function movePin(updateBookingData, kind, latlng, current) {
    if (!current) return;
    const lat = round(latlng.lat);
    const lng = round(latlng.lng);
    updateBookingData((prev) =>
        prev[kind]
            ? { [kind]: { ...prev[kind], lat, lng, pinned: true, needsPin: false, ...(current.manual ? { address: 'Finding address…' } : {}) } }
            : {}
    );
    if (current.manual) fillAddressFromPoint(updateBookingData, kind, lat, lng);
}

/** Un loc nou, ales direct pe hartă: pornește lângă cealaltă adresă sau din Boston; clientul îl mută pe clădire. */
export function startManualPin(updateBookingData, kind, near) {
    const lat = round(near?.lat ? near.lat + 0.002 : DEFAULT_CENTER.lat);
    const lng = round(near?.lat ? near.lng + 0.002 : DEFAULT_CENTER.lng);
    updateBookingData({ [kind]: { address: 'Tap the map to place the pin', lat, lng, manual: true, pinned: false, needsPin: true } });
}
