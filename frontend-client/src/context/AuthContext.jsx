import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

// Starea contului clientului, disponibilă în toată aplicația.
// Sesiunea e un cookie httpOnly pe server; aici ținem doar datele publice ale utilizatorului.
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [authChecked, setAuthChecked] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const { user } = await api.me();
            setUser(user);
            return user;
        } catch {
            setUser(null);
            return null;
        } finally {
            setAuthChecked(true);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const registerUser = async (payload) => {
        const { user } = await api.register(payload);
        setUser(user);
        return user;
    };

    const loginUser = async (email, password) => {
        const { user } = await api.login(email, password);
        setUser(user);
        return user;
    };

    const logoutUser = async () => {
        try {
            await api.logout();
        } finally {
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, authChecked, registerUser, loginUser, logoutUser, refresh }}>
            {children}
        </AuthContext.Provider>
    );
};

/** Inițialele pentru avatar: „Maria Popescu” → „MP”. */
export const initials = (name = '') =>
    name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || '?';
