const CACHE_NAME = 'hamburg-door-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/views/mobile/index.html',
    '/assets/css/mobile.css',
    '/assets/css/main.css',
    '/js/offline.js',
    '/manifest.json'
];

// 1. INSTALL: Cache the core files immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching App Shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. ACTIVATE: Clean up old caches if we update the version
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

// 3. FETCH: The "Network-First, Fallback to Cache" Strategy
// We try to get the fresh data. If offline, we grab the cached version.
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .catch(() => {
                return caches.match(event.request);
            })
    );
});