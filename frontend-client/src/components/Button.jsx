import React from 'react';

const Button = ({ children, onClick, disabled = false, variant = 'primary', type = 'button' }) => {
    return (
        <button
            type={type}
            className={`lugg-btn lugg-btn-${variant}`}
            onClick={onClick}
            disabled={disabled}
        >
            {children}
        </button>
    );
};

export default Button;