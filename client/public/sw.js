const CACHE_NAME = 'chattybooks-v1';
const STATIC_CACHE_NAME = 'chattybooks-static-v1';
const API_CACHE_NAME = 'chattybooks-api-v1';

// Files to cache immediately (critical resources)
const STATIC_ASSETS = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js',
  '/manifest.json',
  '/book-logo-light.png',
  '/book-logo-dark.png'
];

// API endpoints to cache
const CACHEABLE_API_ROUTES = [
  '/books',
  '/characters/top',
  '/book/'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      }),
      caches.open(API_CACHE_NAME)
    ]).then(() => {
      console.log('Service Worker: Static assets cached');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName.startsWith('chattybooks-') && 
                   ![CACHE_NAME, STATIC_CACHE_NAME, API_CACHE_NAME].includes(cacheName);
          })
          .map((cacheName) => {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      console.log('Service Worker: Activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache when possible
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Let range requests (audio/video streaming) pass through; the Cache API rejects 206 responses
  if (request.headers.get('range')) {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/') || url.origin !== location.origin) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static assets
  event.respondWith(handleStaticRequest(request));
});

// Handle API requests with network-first strategy for fresh data
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const isCacheable = CACHEABLE_API_ROUTES.some(route => url.pathname.includes(route));

  if (!isCacheable) {
    // Don't cache user-specific or sensitive data
    return fetch(request);
  }

  try {
    // Try network first for fresh data
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok && networkResponse.status !== 206) {
      // Cache successful responses (skip partial/range responses)
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Fallback to cache if network fails
    console.log('Service Worker: Network failed, trying cache');
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    
    throw error;
  }
}

// Handle static requests with cache-first strategy
async function handleStaticRequest(request) {
  try {
    // Try cache first for static assets
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback to network
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok && networkResponse.status !== 206) {
      // Cache successful responses (skip partial/range responses)
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Request failed', error);
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    
    throw error;
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(handleBackgroundSync());
  }
});

async function handleBackgroundSync() {
  // Handle offline actions when back online
  console.log('Service Worker: Background sync triggered');
  
  // You can implement offline action queue here
  // For example, sync reading progress, chat messages, etc.
}

// Push notification support (for future features)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: '/book-logo-light.png',
      badge: '/book-logo-light.png',
      tag: data.tag || 'general',
      requireInteraction: false,
      actions: data.actions || []
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll().then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

// Periodically clean up old cache entries
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAN_CACHE') {
    event.waitUntil(cleanOldCacheEntries());
  }
});

async function cleanOldCacheEntries() {
  const cache = await caches.open(API_CACHE_NAME);
  const requests = await cache.keys();
  
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const request of requests) {
    const response = await cache.match(request);
    const cachedDate = new Date(response.headers.get('date')).getTime();
    
    if (now - cachedDate > maxAge) {
      await cache.delete(request);
    }
  }
  
  console.log('Service Worker: Old cache entries cleaned');
} 