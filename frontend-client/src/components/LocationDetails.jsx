import React from 'react';

// Aceleași valori ca pe server (validation.js → FLOORS)
export const FLOOR_OPTIONS = [
    { id: 'ground', label: 'Ground / house' },
    { id: 'basement', label: 'Basement' },
    { id: '2', label: '2nd floor' },
    { id: '3', label: '3rd floor' },
    { id: '4', label: '4th floor' },
    { id: '5', label: '5th floor' },
    { id: '6', label: '6th floor' },
    { id: '7', label: '7th floor' },
    { id: '8', label: '8th floor' },
    { id: '9', label: '9th floor' },
    { id: '10+', label: '10th floor or higher' }
];

/** „Unit 4B · 3rd floor · no elevator (stairs)” — același text ca în emailuri. */
export function describeDetails(d) {
    if (!d?.floor) return '';
    const floor = FLOOR_OPTIONS.find((f) => f.id === d.floor)?.label || '';
    const elevator = d.floor !== 'ground' ? (d.elevator === 'yes' ? 'elevator' : d.elevator === 'no' ? 'no elevator (stairs)' : '') : '';
    return [d.unit ? `Unit ${d.unit}` : '', floor, elevator].filter(Boolean).join(' · ');
}

export const EMPTY_DETAILS = { unit: '', floor: '', elevator: null, notes: '' };

/** Detaliile sunt complete: etajul ales și, dacă nu e parter / casă, dacă există lift. */
export const detailsComplete = (d) => Boolean(d?.floor) && (d.floor === 'ground' || Boolean(d.elevator));

/** Etaj, lift, apartament / unitate și note de acces pentru o adresă (pickup sau drop-off). */
const LocationDetails = ({ prefix, value, onChange }) => {
    const d = { ...EMPTY_DETAILS, ...value };
    const set = (patch) => onChange({ ...d, ...patch });
    const needsElevator = d.floor && d.floor !== 'ground';

    return (
        <div className="loc-details">
            <div className="loc-row">
                <label className="loc-field">
                    <span>Floor</span>
                    <select
                        name={`${prefix}-floor`}
                        value={d.floor}
                        onChange={(e) => set({ floor: e.target.value, elevator: e.target.value === 'ground' ? null : d.elevator })}
                        className={!d.floor ? 'loc-empty' : ''}
                    >
                        <option value="" disabled>
                            Choose…
                        </option>
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
                <div className="loc-elevator" role="radiogroup" aria-label="Elevator">
                    <span>Elevator?</span>
                    {[
                        ['yes', 'Yes'],
                        ['no', 'No, stairs']
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
