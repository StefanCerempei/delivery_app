import React from 'react';
import Spinner from './Spinner';

/** `loading`: butonul se dezactivează și arată un spinner lângă text. */
const Button = ({ children, onClick, disabled = false, loading = false, variant = 'primary', type = 'button' }) => {
    return (
        <button
            type={type}
            className={`lugg-btn lugg-btn-${variant} ${loading ? 'is-loading' : ''}`}
            onClick={onClick}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
        >
            {loading && <Spinner size={18} className="btn-spinner" />}
            {children}
        </button>
    );
};

export default Button;