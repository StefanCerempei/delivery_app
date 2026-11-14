import React, { useMemo, useState } from 'react';
import { useBooking } from '../../context/BookingContext';
import PhotoUploader from '../../components/PhotoUploader';
import Button from '../../components/Button';
import { ALL_ITEMS, itemsToText } from '../../data/itemCatalog';

/** Combină obiectele alese cu notele scrise, pentru câmpul itemsDescription al comenzii. */
function buildDescription(items, notes) {
    const list = itemsToText(items);
    const extra = notes.trim();
    if (list && extra) return `${list}. Notes: ${extra}`;
    return list || extra;
}

/** Amestec stabil (Fisher–Yates) — obiectele apar în ordine aleatorie, dar fixă per vizită. */
function shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const Step4Items = () => {
    const { bookingData, updateBookingData, nextStep } = useBooking();
    const [items, setItems] = useState(bookingData.items || []);
    const [notes, setNotes] = useState(bookingData.itemsNotes || '');
    const [photos, setPhotos] = useState(bookingData.photos || []);
    const deck = useMemo(() => shuffled(ALL_ITEMS), []);

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
            vehicle: null,
            priceEstimate: null
        });
        nextStep();
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>What are we moving?</h1>
                <p className="subtitle">Tap your items — we'll recommend the right vehicle. Swipe sideways for more.</p>
            </div>

            <div className="item-grid">
                {deck.map((item) => {
                    const qty = qtyOf(item.id);
                    return (
                        <div
                            key={item.id}
                            className={`item-chip ${qty > 0 ? 'active' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => changeQty(item, 1)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && changeQty(item, 1)}
                        >
                            <span className="chip-emoji" aria-hidden="true">{item.emoji}</span>
                            <span className="chip-label">{item.label}</span>
                            {qty > 0 && (
                                <span className="chip-controls">
                                    <button
                                        type="button"
                                        className="chip-minus"
                                        onClick={(e) => { e.stopPropagation(); changeQty(item, -1); }}
                                        aria-label={`Remove one ${item.label}`}
                                    >
                                        −
                                    </button>
                                    <span className="chip-qty">{qty}</span>
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="items-textarea-group">
                <label htmlFor="items-notes" className="picker-section-label">ACCESS NOTES (OPTIONAL)</label>
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
                        : 'Every Reloq truck comes with shrink wrap, straps & moving blankets'}
                </p>
            </div>
        </div>
    );
};

export default Step4Items;
