import React, { useCallback, useEffect, useState } from 'react';

/** Miniaturi + vizualizare mare (săgeți / swipe / Esc). `urls`: linkurile pozelor. */
const PhotoGallery = ({ urls, emptyText = 'No photos.' }) => {
    const [open, setOpen] = useState(null);
    const [failed, setFailed] = useState({});

    const close = useCallback(() => setOpen(null), []);
    const step = useCallback((d) => setOpen((i) => (i === null ? null : (i + d + urls.length) % urls.length)), [urls.length]);

    useEffect(() => {
        if (open === null) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowRight') step(1);
            if (e.key === 'ArrowLeft') step(-1);
        };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, close, step]);

    if (!urls.length) return <p className="gallery-empty">{emptyText}</p>;

    let touchX = null;
    return (
        <>
            <div className="gallery-grid">
                {urls.map((url, i) => (
                    <button key={url} type="button" className="gallery-thumb" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1}`}>
                        {failed[url] ? (
                            <span className="gallery-broken">Photo unavailable</span>
                        ) : (
                            <img src={url} alt={`Item photo ${i + 1}`} loading="lazy" onError={() => setFailed((f) => ({ ...f, [url]: true }))} />
                        )}
                    </button>
                ))}
            </div>

            {open !== null && (
                <div
                    className="lightbox"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Photo ${open + 1} of ${urls.length}`}
                    onClick={close}
                    onTouchStart={(e) => (touchX = e.touches[0].clientX)}
                    onTouchEnd={(e) => {
                        if (touchX === null) return;
                        const dx = e.changedTouches[0].clientX - touchX;
                        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
                        touchX = null;
                    }}
                >
                    <img src={urls[open]} alt={`Item photo ${open + 1}`} onClick={(e) => e.stopPropagation()} />
                    <button type="button" className="lightbox-close" onClick={close} aria-label="Close">
                        ×
                    </button>
                    {urls.length > 1 && (
                        <>
                            <button type="button" className="lightbox-nav prev" onClick={(e) => (e.stopPropagation(), step(-1))} aria-label="Previous photo">
                                ‹
                            </button>
                            <button type="button" className="lightbox-nav next" onClick={(e) => (e.stopPropagation(), step(1))} aria-label="Next photo">
                                ›
                            </button>
                            <span className="lightbox-count">
                                {open + 1} / {urls.length}
                            </span>
                        </>
                    )}
                    <a className="lightbox-open" href={urls[open]} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        Open full size ↗
                    </a>
                </div>
            )}
        </>
    );
};

export default PhotoGallery;
