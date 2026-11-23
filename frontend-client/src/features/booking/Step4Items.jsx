import React, { useMemo, useState } from 'react';
import { useBooking } from '../../context/BookingContext';
import PhotoUploader from '../../components/PhotoUploader';
import Button from '../../components/Button';
import { ITEM_CATALOG, itemsToText } from '../../data/itemCatalog';

/** Combină obiectele alese cu notele scrise, pentru câmpul itemsDescription al comenzii. */
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
    // Pozele stau în rezervare (și în IndexedDB), ca să nu se piardă la reîncărcare sau la intrarea în cont
    const photos = bookingData.photos || [];
    const setPhotos = (list) => updateBookingData({ photos: list });
    const [query, setQuery] = useState('');
    // Obiectele pe categorii; căutarea filtrează după nume
    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        return ITEM_CATALOG.map((g) => ({
            ...g,
            items: q ? g.items.filter((it) => it.label.toLowerCase().includes(q)) : g.items
        })).filter((g) => g.items.length > 0);
    }, [query]);

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
            vehicle: null,
            priceEstimate: null
        });
        nextStep();
    };

    return (
        <div className="step-container">
            <div className="step-heading">
                <h1>What are we moving?</h1>
                <p className="subtitle">Tap what you're moving — we'll pick the right vehicle.</p>
            </div>

            <input
                type="search"
                className="item-search"
                name="item-search"
                placeholder="Search items (sofa, boxes, fridge…)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search items"
            />

            <div className="item-groups">
                {groups.length === 0 && (
                    <p className="item-empty">No match — describe it in the notes below and we'll bring the right gear.</p>
                )}
                {groups.map((group) => (
                    <section key={group.category} className="item-group">
                        <h2 className="item-group-title">{group.category}</h2>
                        <div className="item-grid">
                            {group.items.map((item) => {
                                const qty = qtyOf(item.id);
                                return (
                                    <div
                                        key={item.id}
                                        className={`item-chip ${qty > 0 ? 'active' : ''}`}
                                        role="button"
                                        tabIndex={0}
                                        aria-pressed={qty > 0}
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
                    </section>
                ))}
            </div>

            <div className="items-textarea-group">
                <label htmlFor="items-notes" className="picker-section-label">Anything else? (optional)</label>
                <textarea
                    id="items-notes"
                    className="items-textarea"
                    rows={3}
                    placeholder="e.g., anything heavy or fragile, items that need disassembly, narrow driveway."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>

            <PhotoUploader photos={photos} onChange={setPhotos} />

            <div className="step-footer">
                <Button onClick={handleContinue} disabled={totalCount === 0}>
                    {totalCount === 0 ? 'Add at least one item' : 'See recommended vehicle →'}
                </Button>
            </div>
            <div className="step-notes">
                <p className="trust-note">
                    {totalCount > 0
                        ? `${totalCount} item${totalCount > 1 ? 's' : ''} selected`
                        : 'Every RELOQ truck comes with shrink wrap, straps & moving blankets'}
                </p>
            </div>
        </div>
    );
};

export default Step4Items;
