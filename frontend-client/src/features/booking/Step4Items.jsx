import React, { useState } from 'react';
import { useBooking } from '../../context/BookingContext';
import PhotoUploader from '../../components/PhotoUploader';
import Button from '../../components/Button';
import { ITEM_CATALOG, itemsToText } from '../../data/itemCatalog';

/** Combină obiectele alese din catalog cu notele scrise, pentru câmpul itemsDescription al comenzii. */
function buildDescription(items, notes) {
    const list = itemsToText(items);
    const extra = notes.trim();
    if (list && extra) return `${list}. Notes: ${extra}`;
    return list || extra;
}

const Step4Items = () => {
    const { bookingData, updateBookingData, nextStep } = useBooking();
    const [items, setItems] = useState(bookingData.items || []);
    const [notes, setNotes] = useState(bookingData.itemsNotes || '');
    const [photos, setPhotos] = useState(bookingData.photos || []);

    const qtyOf = (id) => items.find((it) => it.id === id)?.qty || 0;
    const totalCount = items.reduce((n, it) => n + it.qty, 0);

    const changeQty = (item, delta) => {
        setItems((prev) => {
            const existing = prev.find((it) => it.id === item.id);
            const nextQty = Math.max(0, (existing?.qty || 0) + delta);
            if (nextQty === 0) return prev.filter((it) => it.id !== item.id);
            if (existing) return prev.map((it) => (it.id === item.id ? { ...it, qty: nextQty } : it));
            return [...prev, { id: item.id, label: item.label, size: item.size, qty: nextQty }];
        });
    };

    const handleContinue = () => {
        if (totalCount === 0) return;
        updateBookingData({
            items,
            itemsNotes: notes.trim(),
            itemsDescription: buildDescription(items, notes),
            photos,
            // dacă obiectele s-au schimbat, resetăm vehiculul ca să se recalculeze recomandarea
            vehicle: null,
            priceEstimate: null
        });
        nextStep();
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>What are we moving?</h1>
                <p className="subtitle">
                    Pick your items and we'll recommend the right vehicle. Swipe each row sideways to see more.
                </p>
            </div>

            <div className="catalog">
                {ITEM_CATALOG.map((group) => (
                    <div key={group.category} className="catalog-category">
                        <span className="picker-section-label">{group.category}</span>
                        <div className="catalog-row">
                            {group.items.map((item) => {
                                const qty = qtyOf(item.id);
                                return (
                                    <div key={item.id} className={`catalog-card ${qty > 0 ? 'active' : ''}`}>
                                        <button
                                            type="button"
                                            className="catalog-card-body"
                                            onClick={() => changeQty(item, 1)}
                                            aria-label={`Add ${item.label}`}
                                        >
                                            <span className="catalog-emoji" aria-hidden="true">{item.emoji}</span>
                                            <span className="catalog-label">{item.label}</span>
                                        </button>
                                        {qty > 0 ? (
                                            <div className="catalog-stepper">
                                                <button type="button" onClick={() => changeQty(item, -1)} aria-label={`Remove one ${item.label}`}>−</button>
                                                <span className="catalog-qty">{qty}</span>
                                                <button type="button" onClick={() => changeQty(item, 1)} aria-label={`Add one ${item.label}`}>+</button>
                                            </div>
                                        ) : (
                                            <button type="button" className="catalog-add" onClick={() => changeQty(item, 1)}>
                                                + Add
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="items-textarea-group">
                <label htmlFor="items-notes" className="picker-section-label">
                    ACCESS NOTES (OPTIONAL)
                </label>
                <textarea
                    id="items-notes"
                    className="items-textarea"
                    rows={3}
                    placeholder="e.g., 2nd floor pickup with elevator, narrow driveway, anything heavy or fragile."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>

            <PhotoUploader photos={photos} onChange={setPhotos} />

            <div className="step-footer">
                <Button onClick={handleContinue} disabled={totalCount === 0}>
                    {totalCount === 0 ? 'Add at least one item' : 'See recommended vehicle →'}
                </Button>
                <p className="trust-note">
                    {totalCount > 0
                        ? `${totalCount} item${totalCount > 1 ? 's' : ''} selected`
                        : 'Every Reloq truck comes equipped with shrink wrap, straps & moving blankets'}
                </p>
            </div>
        </div>
    );
};

export default Step4Items;
