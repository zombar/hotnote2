const CACHE = 'hotnote-v1';
const SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon-512.png',
    '/css/style.css',
    '/js/hotnote.js',
    '/js/lib-markdown.js',
    '/js/lib-format.js',
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(r => r || fetch(e.request))
    );
});
