import React, { useState, useEffect, useRef } from 'react';

const AddressInput = ({ placeholder, value, onSelect }) => {
    const [query, setQuery] = useState(value?.address || '');
    const [suggestions, setSuggestions] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const skipNextSearch = useRef(false);
    const wrapperRef = useRef(null);

    // Sincronizează textul dacă adresele sunt inversate (Swap)
    useEffect(() => {
        skipNextSearch.current = true;
        setQuery(value?.address || '');
    }, [value?.address]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (skipNextSearch.current) {
            skipNextSearch.current = false;
            return;
        }

        if (!query || query.trim().length < 3) {
            setSuggestions([]);
            setIsOpen(false);
            return;
        }

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                setLoading(true);
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                    query
                )}&limit=5&addressdetails=1`;

                const res = await fetch(url, {
                    signal: controller.signal,
                    headers: { 'Accept-Language': 'ro,en' }
                });
                const data = await res.json();
                setSuggestions(data);
                setIsOpen(data.length > 0);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Eroare căutare adresă:', err);
                }
            } finally {
                setLoading(false);
            }
        }, 350);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    const handleSelectSuggestion = (item) => {
        skipNextSearch.current = true;
        const selectedLocation = {
            address: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon)
        };
        setQuery(item.display_name);
        setSuggestions([]);
        setIsOpen(false);
        onSelect(selectedLocation);
    };

    const handleClear = () => {
        skipNextSearch.current = true;
        setQuery('');
        setSuggestions([]);
        setIsOpen(false);
        onSelect(null);
    };

    return (
        <div className="route-field-wrapper" ref={wrapperRef}>
            <input
                type="text"
                className="route-field-input"
                placeholder={placeholder}
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    if (!e.target.value) onSelect(null);
                }}
                onFocus={() => suggestions.length > 0 && setIsOpen(true)}
                autoComplete="off"
            />

            {loading && <span className="field-spinner" />}

            {!loading && query && (
                <button type="button" className="field-clear-btn" onClick={handleClear} title="Șterge">
                    ×
                </button>
            )}

            {isOpen && suggestions.length > 0 && (
                <ul className="address-dropdown">
                    {suggestions.map((item) => {
                        const parts = item.display_name.split(',');
                        const mainTitle = parts[0];
                        const subTitle = parts.slice(1, 4).join(',');
                        return (
                            <li key={item.place_id} onClick={() => handleSelectSuggestion(item)}>
                                <span className="dropdown-pin">📍</span>
                                <div className="dropdown-text">
                                    <strong>{mainTitle}</strong>
                                    {subTitle && <span>{subTitle}</span>}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default AddressInput;