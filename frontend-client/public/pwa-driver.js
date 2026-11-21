// Doar pe paginile șoferului (/driver…): aplicația instalabilă „RELOQ Driver”.
// Fișier separat (nu script inline), ca să respecte politica de securitate (CSP) a site-ului.
(function () {
    if (location.pathname.indexOf('/driver') !== 0) return;
    var head = document.head;
    function add(tag, attrs) {
        var el = document.createElement(tag);
        for (var k in attrs) el.setAttribute(k, attrs[k]);
        head.appendChild(el);
    }
    add('link', { rel: 'manifest', href: '/driver.webmanifest' });
    // iPhone: „Add to Home Screen” deschide aplicația pe tot ecranul, cu numele și iconița ei
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'RELOQ Driver' });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/driver-sw.js', { scope: '/driver' }).catch(function () {});
        });
    }
})();
