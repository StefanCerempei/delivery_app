import React, { useState } from 'react';
import { useBooking } from '../../context/BookingContext';
import PhotoUploader from '../../components/PhotoUploader';
import Button from '../../components/Button';

const QUICK_ITEMS = [
    'Canapea 3 locuri',
    'Frigider',
    'Mașină de spălat',
    'Saltea + pat',
    'Birou',
    'Televizor',
    '5–10 cutii',
    'Dulap demontat'
];

const Step4Items = () => {
    const { bookingData, updateBookingData, nextStep } = useBooking();
    const [description, setDescription] = useState(bookingData.itemsDescription || '');
    const [photos, setPhotos] = useState(bookingData.photos || []);

    const handleAddQuickItem = (itemLabel) => {
        const trimmed = description.trim();
        if (!trimmed) {
            setDescription(itemLabel);
            return;
        }
        if (trimmed.toLowerCase().includes(itemLabel.toLowerCase())) {
            return;
        }
        setDescription(`${trimmed}, ${itemLabel}`);
    };

    const handleContinue = () => {
        if (!description.trim()) {
            alert('Te rugăm să descrii pe scurt ce obiecte transportăm.');
            return;
        }

        updateBookingData({
            itemsDescription: description.trim(),
            photos
        });
        nextStep();
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>Ce transportăm?</h1>
                <p className="subtitle">
                    Spune-ne ce obiecte ai și dacă există scări înguste sau detalii de acces.
                </p>
            </div>

            {/* Sugestii rapide */}
            <div className="quick-items-section">
                <span className="picker-section-label">ADĂUGARE RAPIDĂ</span>
                <div className="quick-chips-wrap">
                    {QUICK_ITEMS.map((item) => {
                        const isIncluded = description.toLowerCase().includes(item.toLowerCase());
                        return (
                            <button
                                key={item}
                                type="button"
                                className={`quick-item-chip ${isIncluded ? 'active' : ''}`}
                                onClick={() => handleAddQuickItem(item)}
                            >
                                {isIncluded ? '✓ ' : '+ '}
                                {item}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Descriere detaliată */}
            <div className="items-textarea-group">
                <label htmlFor="items-desc" className="picker-section-label">
                    LISTA OBIECTELOR & DETALII ACCES
                </label>
                <textarea
                    id="items-desc"
                    className="items-textarea"
                    rows={4}
                    placeholder="Ex: O canapea extensibilă, 6 cutii cu haine și o măsuță de cafea. Preluare de la etajul 2, există lift."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>

            {/* Upload poze */}
            <PhotoUploader photos={photos} onChange={setPhotos} />

            <div className="step-footer">
                <Button onClick={handleContinue} disabled={!description.trim()}>
                    Continuă la plată →
                </Button>
                <p className="trust-note">
                    Echipajul Reloq aduce folie stretch, chingi și pături de protecție
                </p>
            </div>
        </div>
    );
};

export default Step4Items;