// Aplicațiile instalabile pe telefon (fără app store):
//   /driver… → „RELOQ Driver” (șoferi)   ·   /admin… → „RELOQ Dispatch” (dispecerat)
// Fișier separat (nu script inline), ca să respecte politica de securitate (CSP) a site-ului.
(function () {
    var apps = [
        { prefix: '/driver', manifest: '/driver.webmanifest', sw: '/driver-sw.js', title: 'RELOQ Driver', icon: '/apple-touch-icon.png' },
        { prefix: '/admin', manifest: '/admin.webmanifest', sw: '/admin-sw.js', title: 'RELOQ Dispatch', icon: '/admin-apple-touch-icon.png' }
    ];
    var app = null;
    for (var i = 0; i < apps.length; i++) if (location.pathname.indexOf(apps[i].prefix) === 0) app = apps[i];
    if (!app) return;
    var head = document.head;
    function add(tag, attrs) {
        var el = document.createElement(tag);
        for (var k in attrs) el.setAttribute(k, attrs[k]);
        head.appendChild(el);
    }
    add('link', { rel: 'manifest', href: app.manifest });
    // iPhone: „Add to Home Screen” folosește aceste valori (nume, iconiță, ecran complet)
    var touch = document.querySelector('link[rel="apple-touch-icon"]');
    if (touch) touch.setAttribute('href', app.icon);
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: app.title });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register(app.sw, { scope: app.prefix }).catch(function () {});
        });
    }
})();
