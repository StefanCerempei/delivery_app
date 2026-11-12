import React from 'react';
import wordmarkOnDark from '../assets/brand/logo-wordmark-on-dark.svg';
import wordmarkOnLight from '../assets/brand/logo-wordmark-on-light.svg';
import fullOnDark from '../assets/brand/logo-full-on-dark.svg';
import fullOnLight from '../assets/brand/logo-full-on-light.svg';

const SOURCES = {
    wordmark: { dark: wordmarkOnDark, light: wordmarkOnLight },
    full: { dark: fullOnDark, light: fullOnLight }
};

/**
 * Logo-ul oficial Reloq.
 * variant: 'wordmark' (fără slogan, pentru header-e mici) | 'full' (cu „MOVING SERVICES”)
 * on: 'dark' (fundal închis — Q alb) | 'light' (fundal deschis — Q bleumarin)
 */
const Logo = ({ variant = 'wordmark', on = 'dark', height = 24, className = '' }) => (
    <img
        src={SOURCES[variant][on]}
        alt={variant === 'full' ? 'Reloq Moving Services' : 'Reloq'}
        className={`reloq-logo ${className}`}
        style={{ height }}
        draggable="false"
    />
);

export default Logo;
