import React, { useEffect, useState } from 'react';

const DISMISS_KEY = 'reloq_driver_install_dismissed';

const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/**
 * „Instalează aplicația” în panoul șoferului (fără Google Play / App Store):
 *   - Android / Chrome: butonul deschide fereastra de instalare a browserului;
 *   - iPhone: instrucțiuni pentru Share → Add to Home Screen (Apple nu permite un buton).
 * Nu apare dacă aplicația rulează deja instalată sau dacă șoferul a ascuns-o.
 */
const InstallDriverApp = () => {
    const [prompt, setPrompt] = useState(null);
    const [installed, setInstalled] = useState(isStandalone());
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(DISMISS_KEY) === '1';
        } catch {
            return false;
        }
    });

    useEffect(() => {
        const onPrompt = (e) => {
            e.preventDefault(); // îl arătăm noi, la apăsarea butonului
            setPrompt(e);
        };
        const onInstalled = () => setInstalled(true);
        window.addEventListener('beforeinstallprompt', onPrompt);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onPrompt);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            // stocare indisponibilă: ascuns doar acum
        }
    };

    if (installed || dismissed) return null;
    const ios = isIOS();
    if (!prompt && !ios) return null; // browserul nu permite instalarea (ex. deja instalată sau desktop fără suport)

    const install = async () => {
        prompt.prompt();
        const { outcome } = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
        if (outcome === 'accepted') setInstalled(true);
        setPrompt(null);
    };

    return (
        <div className="install-app">
            <img src="/driver-icon-192.png" alt="" width="44" height="44" />
            <div className="install-app-text">
                <strong>Add RELOQ Driver to your phone</strong>
                {ios ? (
                    <span>
                        In Safari tap <b>Share</b> <span aria-hidden="true">⬆︎</span>, then <b>Add to Home Screen</b>.
                    </span>
                ) : (
                    <span>Opens full screen from your home screen — no app store needed.</span>
                )}
            </div>
            <div className="install-app-actions">
                {!ios && (
                    <button type="button" className="job-btn primary" onClick={install}>
                        Install
                    </button>
                )}
                <button type="button" className="install-app-close" onClick={dismiss} aria-label="Hide">
                    ×
                </button>
            </div>
        </div>
    );
};

export default InstallDriverApp;
