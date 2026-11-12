import React, { useState } from 'react';

/** Câmp de parolă cu buton Show/Hide. */
const PasswordField = ({ id, name, label, value, onChange, autoComplete = 'new-password', placeholder }) => {
    const [show, setShow] = useState(false);
    return (
        <label className="auth-field">
            <span>{label}</span>
            <div className="password-wrap">
                <input
                    id={id}
                    name={name}
                    className="reloq-input"
                    type={show ? 'text' : 'password'}
                    autoComplete={autoComplete}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                />
                <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                >
                    {show ? 'Hide' : 'Show'}
                </button>
            </div>
        </label>
    );
};

export default PasswordField;
