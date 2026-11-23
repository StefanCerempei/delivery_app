import React, { useEffect, useState } from 'react';

// Aplicațiile instalabile: aceleași reguli pentru „RELOQ Driver” (/driver) și „RELOQ Dispatch” (/admin)
const APPS = {
    driver: { name: 'RELOQ Driver', path: '/driver', icon: '/driver-icon-192.png', dismissKey: 'reloq_driver_install_dismissed' },
    admin: { name: 'RELOQ Dispatch', path: '/admin/dashboard', icon: '/admin-icon-192.png', dismissKey: 'reloq_admin_install_dismissed' }
};

const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
/** Safari „curat” pe iPhone (Chrome, Firefox, Edge, Opera și browserele din aplicații au alt identificator). */
const isIOSSafari = () => {
    const ua = navigator.userAgent;
    return /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|Instagram|FBAN|FBAV|Line\//.test(ua);
};
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/**
 * „Instalează aplicația” (fără Google Play / App Store) — `app`: 'driver' sau 'admin':
 *   - Android / Chrome: butonul deschide fereastra de instalare a browserului;
 *   - iPhone: instrucțiuni pentru Share → Add to Home Screen (Apple nu permite un buton).
 * Nu apare dacă aplicația rulează deja instalată sau dacă șoferul a ascuns-o.
 */
const InstallApp = ({ app = 'driver' }) => {
    const cfg = APPS[app];
    const [prompt, setPrompt] = useState(null);
    const [copied, setCopied] = useState(false);
    const [installed, setInstalled] = useState(isStandalone());
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(cfg.dismissKey) === '1';
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
            localStorage.setItem(cfg.dismissKey, '1');
        } catch {
            // stocare indisponibilă: ascuns doar acum
        }
    };

    if (installed || dismissed) return null;
    const ios = isIOS();
    if (!prompt && !ios) return null; // browserul nu permite instalarea (ex. deja instalată sau desktop fără suport)

    const copyLink = async () => {
        const url = `${window.location.origin}${cfg.path}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch {
            window.prompt('Copy this link and open it in Safari:', url);
        }
    };

    const install = async () => {
        prompt.prompt();
        const { outcome } = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
        if (outcome === 'accepted') setInstalled(true);
        setPrompt(null);
    };

    return (
        <div className="install-app">
            <img src={cfg.icon} alt="" width="44" height="44" />
            <div className="install-app-text">
                <strong>Add {cfg.name} to your phone</strong>
                {ios && !isIOSSafari() ? (
                    <>
                        <span>
                            Open this page in <b>Safari</b>, tap <b>Share</b> <span aria-hidden="true">⬆︎</span>, then <b>Add to Home Screen</b>.
                        </span>
                        <button type="button" className="install-copy" onClick={copyLink}>
                            {copied ? '✓ Link copied — paste it in Safari' : 'Copy link for Safari'}
                        </button>
                    </>
                ) : ios ? (
                    <span>
                        Tap <b>Share</b> <span aria-hidden="true">⬆︎</span> at the bottom of Safari, scroll down and choose <b>Add to Home Screen</b>.
                    </span>
                ) : (
                    <span>Opens full screen from your home screen — no app store needed.</span>
                )}
            </div>
            <div className="install-app-actions">
                {!ios && (
                    <button type="button" className="install-btn" onClick={install}>
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

export default InstallApp;
