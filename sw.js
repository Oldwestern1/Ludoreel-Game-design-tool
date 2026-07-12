// SW.JS — Minimal offline cache so the installed app still works without a
// connection. Cache-first for everything the app ships; bump CACHE_NAME any
// time you want previously-installed users to pick up fresh files.
const CACHE_NAME = 'ludoreel-v1';

const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/styles.css',
    './js/main.js',
    './js/persistence.js',
    './js/data.js',
    './js/pools.js',
    './js/cards.js',
    './js/prompt.js',
    './js/icons.js',
    './js/sound.js',
    './js/theme.js',
    './audio/button-press.mp3',
    './audio/copy-chime.mp3',
    './audio/error.mp3',
    './audio/land-thud.mp3',
    './audio/lock-click.mp3',
    './audio/tick.wav',
    './audio/whoosh.mp3',
    './icons/app/icon-192.png',
    './icons/app/icon-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Cache-first for same-origin files; network passthrough for the Google
// Fonts CDN request (that's the one thing that needs a live connection —
// once fetched once, the browser's own HTTP cache handles it after that).
self.addEventListener('fetch', (event) => {
    if (new URL(event.request.url).origin !== self.location.origin) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return response;
            });
        })
    );
});
