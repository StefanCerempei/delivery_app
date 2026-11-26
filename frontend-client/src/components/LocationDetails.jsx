import React from 'react';

// Aceleași valori ca pe server (validation.js → FLOORS)
export const FLOOR_OPTIONS = [
    { id: 'house', label: 'Private home / townhome' },
    { id: 'storage', label: 'Storage' },
    { id: 'ground', label: 'Ground floor' },
    { id: '2', label: '2nd floor' },
    { id: '3', label: '3rd floor' },
    { id: '4', label: '4th floor' },
    { id: '5', label: '5th floor' },
    { id: '6', label: '6th floor' },
    { id: '7', label: '7th floor' },
    { id: '8', label: '8th floor' },
    { id: '9', label: '9th floor' },
    { id: '10+', label: '10th floor or above' }
];
// Valori din comenzi mai vechi (nu mai apar în formular, doar dacă erau deja alese)
const LEGACY_FLOORS = [
    { id: 'basement', label: 'Basement' }
];
const floorLabel = (id) => [...FLOOR_OPTIONS, ...LEGACY_FLOORS].find((f) => f.id === id)?.label || '';

/** Casă, storage și parter nu au întrebarea de acces; etajele 2+ cer lift sau scări. */
export const needsAccess = (floor) => Boolean(floor) && !['house', 'storage', 'ground'].includes(floor);

/** „Unit 4B · 3rd floor · walk-up stairs (no elevator)” — același text ca în emailuri. */
export function describeDetails(d) {
    if (!d?.floor) return '';
    const access = needsAccess(d.floor)
        ? d.elevator === 'yes'
            ? 'elevator'
            : d.elevator === 'no'
              ? 'walk-up stairs (no elevator)'
              : ''
        : '';
    return [d.unit ? `Unit ${d.unit}` : '', floorLabel(d.floor), access].filter(Boolean).join(' · ');
}

export const EMPTY_DETAILS = { unit: '', floor: '', elevator: null, notes: '' };

/** Detaliile sunt complete: tipul locației / etajul ales și, pentru etajele 2+, tipul de acces. */
export const detailsComplete = (d) => Boolean(d?.floor) && (!needsAccess(d.floor) || Boolean(d.elevator));

/** Etaj, lift, apartament / unitate și note de acces pentru o adresă (pickup sau drop-off). */
const LocationDetails = ({ prefix, value, onChange }) => {
    const d = { ...EMPTY_DETAILS, ...value };
    const set = (patch) => onChange({ ...d, ...patch });
    const needsElevator = needsAccess(d.floor);
    const legacy = LEGACY_FLOORS.find((f) => f.id === d.floor);

    return (
        <div className="loc-details">
            <div className="loc-row">
                <label className="loc-field">
                    <span>Property / floor</span>
                    <select
                        name={`${prefix}-floor`}
                        value={d.floor}
                        onChange={(e) => set({ floor: e.target.value, elevator: needsAccess(e.target.value) ? d.elevator : null })}
                        className={!d.floor ? 'loc-empty' : ''}
                    >
                        <option value="" disabled>
                            Choose…
                        </option>
                        {legacy && <option value={legacy.id}>{legacy.label}</option>}
                        {FLOOR_OPTIONS.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="loc-field loc-unit">
                    <span>Apt / Unit</span>
                    <input
                        name={`${prefix}-unit`}
                        value={d.unit}
                        maxLength={40}
                        placeholder="Optional"
                        onChange={(e) => set({ unit: e.target.value })}
                    />
                </label>
            </div>

            {needsElevator && (
                <div className="loc-elevator" role="radiogroup" aria-label="Access type">
                    <span>Access type</span>
                    {[
                        ['yes', 'Elevator'],
                        ['no', 'Walk up stairs']
                    ].map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={d.elevator === id}
                            className={`loc-choice ${d.elevator === id ? 'active' : ''}`}
                            onClick={() => set({ elevator: id })}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            <label className="loc-field">
                <span>Access notes</span>
                <input
                    name={`${prefix}-notes`}
                    value={d.notes}
                    maxLength={300}
                    placeholder="Gate code, parking, long walk from the truck… (optional)"
                    onChange={(e) => set({ notes: e.target.value })}
                />
            </label>
        </div>
    );
};

export default LocationDetails;
