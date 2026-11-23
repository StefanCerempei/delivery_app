import React, { useEffect, useState } from 'react';
import { subscribeLoading } from '../api/loadingTracker';

const SHOW_AFTER_MS = 350; // cererile rapide nu clipesc bara

/** Bară subțire sus pe pagină cât timp aplicația așteaptă după server mai mult de o clipă. */
const GlobalLoadingBar = () => {
    const [busy, setBusy] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => subscribeLoading((n) => setBusy(n > 0)), []);

    useEffect(() => {
        if (!busy) {
            setVisible(false);
            return undefined;
        }
        const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
        return () => clearTimeout(timer);
    }, [busy]);

    return (
        <div className={`global-loading-bar ${visible ? 'visible' : ''}`} role="progressbar" aria-hidden={!visible} aria-label="Loading">
            <span />
        </div>
    );
};

export default GlobalLoadingBar;
