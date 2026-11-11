import React, { useState } from 'react';
import { useBooking } from '../../context/BookingContext';
import PhotoUploader from '../../components/PhotoUploader';
import Button from '../../components/Button';

const QUICK_ITEMS = [
    '3-seat sofa',
    'Refrigerator',
    'Washer / Dryer',
    'Mattress & bed',
    'Office desk',
    'Large TV',
    '5–10 boxes',
    'Dresser'
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
        if (!description.trim()) return;

        updateBookingData({
            itemsDescription: description.trim(),
            photos
        });
        nextStep();
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>What are we moving?</h1>
                <p className="subtitle">
                    List your items and mention any stairs, elevators, or parking notes.
                </p>
            </div>

            <div className="quick-items-section">
                <span className="picker-section-label">QUICK ADD</span>
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

            <div className="items-textarea-group">
                <label htmlFor="items-desc" className="picker-section-label">
                    ITEM LIST & ACCESS DETAILS
                </label>
                <textarea
                    id="items-desc"
                    className="items-textarea"
                    rows={4}
                    placeholder="e.g., Sectional sofa, 6 moving boxes, and a coffee table. 2nd floor pickup with elevator access."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>

            <PhotoUploader photos={photos} onChange={setPhotos} />

            <div className="step-footer">
                <Button onClick={handleContinue} disabled={!description.trim()}>
                    Continue to payment →
                </Button>
                <p className="trust-note">
                    Every Reloq truck comes equipped with shrink wrap, straps & moving blankets
                </p>
            </div>
        </div>
    );
};

export default Step4Items;