import React, { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';

/**
 * Zonă de semnătură cu degetul / mouse-ul (canvas). ref.current.toDataURL() → PNG sau null dacă e goală.
 * Funcționează cu Pointer Events (iPhone, Android, laptop) și nu derulează pagina cât semnezi.
 */
const SignaturePad = forwardRef(({ onChange, height = 180 }, ref) => {
    const canvasRef = useRef(null);
    const drawing = useRef(false);
    const last = useRef(null);
    const strokes = useRef(0);
    const [empty, setEmpty] = useState(true);

    const setup = useCallback(() => {
        const c = canvasRef.current;
        if (!c) return;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const { width } = c.getBoundingClientRect();
        c.width = Math.round(width * ratio);
        c.height = Math.round(height * ratio);
        const ctx = c.getContext('2d');
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0b1f3b';
        strokes.current = 0;
        setEmpty(true);
    }, [height]);

    useEffect(() => {
        setup();
        const onResize = () => strokes.current === 0 && setup();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [setup]);

    const point = (e) => {
        const r = canvasRef.current.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const down = (e) => {
        e.preventDefault();
        canvasRef.current.setPointerCapture?.(e.pointerId);
        drawing.current = true;
        last.current = point(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.beginPath();
        ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#0b1f3b';
        ctx.fill();
    };
    const move = (e) => {
        if (!drawing.current) return;
        e.preventDefault();
        const p = point(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(last.current.x, last.current.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        last.current = p;
    };
    const up = () => {
        if (!drawing.current) return;
        drawing.current = false;
        strokes.current += 1;
        if (empty) {
            setEmpty(false);
            onChange?.(true);
        }
    };

    const clear = () => {
        setup();
        onChange?.(false);
    };

    useImperativeHandle(ref, () => ({
        clear,
        isEmpty: () => strokes.current === 0,
        toDataURL: () => (strokes.current === 0 ? null : canvasRef.current.toDataURL('image/png'))
    }));

    return (
        <div className="sig-pad">
            <canvas
                ref={canvasRef}
                style={{ height }}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onPointerLeave={up}
                aria-label="Signature area"
            />
            {empty && <span className="sig-placeholder">Sign here with your finger</span>}
            <span className="sig-line" aria-hidden="true" />
            <button type="button" className="sig-clear" onClick={clear} disabled={empty}>
                Clear
            </button>
        </div>
    );
});

export default SignaturePad;
