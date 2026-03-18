const CACHE = 'hotnote-1104121';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-512.png',
               '/css/style.css', '/js/hotnote.js', '/js/lib-markdown.js', '/js/lib-format.js'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
            .then(() => self.clients.matchAll({ type: 'window' }))
            .then(clients => clients.forEach(c => c.postMessage({ type: 'APP_UPDATED' })))
    );
});

self.addEventListener('fetch', e => {
    const { pathname } = new URL(e.request.url);
    if (pathname === '/version.json') {
        e.respondWith(fetch(e.request));
        return;
    }
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
