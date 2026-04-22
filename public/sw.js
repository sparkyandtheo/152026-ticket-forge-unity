// public/sw.js
// Service worker for Hamburg Door staff portal.
// Strategy: network-first, fallback to cache. Caches the app shell so the
// app keeps working offline after first load.

const CACHE_NAME = 'hamburg-door-v2';

// Only cache files that actually exist in the build.
// If you add core CSS/JS shell files, add them here.
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/views/mobile/index.html',
    '/assets/css/forms.css'
];

// 1. INSTALL: Cache the core files immediately.
// Note: cache.addAll() is atomic — if any single URL 404s the whole install
// is rejected and the SW never activates. Keep ASSETS_TO_CACHE minimal and
// verified to exist.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching app shell (' + CACHE_NAME + ')');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. ACTIVATE: Clean up old caches when we bump the version.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});

// 3. FETCH: Network-first, fall back to cache when offline.
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .catch(() => caches.match(event.request))
    );
});
