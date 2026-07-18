const CACHE_NAME = 'gulati-store-pos-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './initial-data.js',
  './pos_app_icon.png',
  './manifest.json'
];

// Install Service Worker and cache app shell resources
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching app shell assets...');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Service Worker and clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Clearing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercept requests and serve from cache if available, falling back to network
self.addEventListener('fetch', (e) => {
  // Only handle HTTP/HTTPS, skip other schemes (like chrome-extension or file)
  if (!e.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  // Skip intercepting POST API calls (e.g. database sync or login)
  if (e.request.method !== 'GET') {
    return;
  }

  // Skip caching API GET calls (e.g. /api/data) to prevent stale data
  if (e.request.url.includes('/api/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in background to keep cache updated (stale-while-revalidate)
        fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => { /* ignore offline fetch errors */ });
        
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
});
