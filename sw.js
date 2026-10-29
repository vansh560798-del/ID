/**
 * St. Arnold's High School Portal - Service Worker
 * Enables PWA installation, offline shell caching, and offline PDF viewing.
 */

const STATIC_CACHE = 'st-arnolds-shell-v2';
const PDF_CACHE = 'st-arnolds-pdfs-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];

// Install: Pre-cache static shell & libraries
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Precache partial warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up older cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== PDF_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Smart routing for PDFs vs app shell
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = req.url;
  const isPdf = url.endsWith('.pdf') || url.includes('.pdf?') || url.includes('firebasestorage') || url.includes('/uploads/');

  // 1. PDF Documents: Cache-first with network fallback & auto-caching
  // This guarantees already-viewed PDFs are always available offline
  if (isPdf) {
    event.respondWith(
      caches.open(PDF_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(req);
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(req);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(req, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          if (cachedResponse) return cachedResponse;
          throw err;
        }
      })
    );
    return;
  }

  // 2. App Shell & Assets: Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone));
        }
        return networkRes;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
