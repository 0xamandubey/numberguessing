const CACHE_NAME = 'number-duel-cache-v1';

// Install event - skip waiting
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing legacy cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Network-First for HTML/navigation, Stale-While-Revalidate for static assets
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and local scope origins
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip Socket.IO polling/connection calls
  if (event.request.url.includes('/socket.io/')) {
    return;
  }

  // Network-First for main page navigation to ensure users get the latest update immediately when online
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Stale-While-Revalidate for other static assets
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch((err) => {
            console.log('Service Worker: Static fetch failed, using cache fallback', err);
            return cachedResponse;
          });

        return cachedResponse || fetchPromise;
      });
    })
  );
});
