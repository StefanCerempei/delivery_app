// Service worker pentru aplicația RELOQ Dispatch (instalabilă de pe /admin).
// Nu păstrează date: comenzile vin mereu de la server. Fără internet arată o pagină de avertizare.
const CACHE = 'reloq-admin-v1';
const OFFLINE_URL = '/admin-offline.html';

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, '/admin-icon-192.png'])));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
    );
});

const OFFLINE_ASSETS = ['/admin-icon-192.png'];

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
