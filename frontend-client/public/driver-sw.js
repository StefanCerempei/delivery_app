// Service worker pentru aplicația RELOQ Driver (instalabilă de pe /driver).
// Nu păstrează date: joburile vin mereu de la server. Fără internet arată o pagină de avertizare.
const CACHE = 'reloq-driver-v3';
const OFFLINE_URL = '/driver-offline.html';

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/driver-icon-192.png'])));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
    );
});

const OFFLINE_ASSETS = ['/driver-icon-192.png'];

// Navigările: întâi rețeaua, iar fără internet pagina offline. Iconița paginii offline: din cache dacă nu e rețea.
self.addEventListener('fetch', (event) => {
    if (event.request.mode === 'navigate') {
        event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
        return;
    }
    const url = new URL(event.request.url);
    if (url.origin === location.origin && OFFLINE_ASSETS.includes(url.pathname)) {
        event.respondWith(fetch(event.request).catch(() => caches.match(url.pathname)));
    }
});
