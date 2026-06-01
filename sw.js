// ── SERVICE WORKER — NYS Clerk Exam PWA v4 ───────────────
// Cache-first strategy for all pages — full offline support
// Bump version number any time files change to force cache update

const CACHE_VERSION = 'clerk-exam-v4';
const OFFLINE_URL   = '/offline.html';

// ── ALL FILES TO PRECACHE ON INSTALL ─────────────────────
// Every file the app needs to work fully offline
const PRECACHE = [
  '/index.html',
  '/week1_schedule_final.html',
  '/week2_schedule.html',
  '/week1_notes_quiz.html',
  '/week1_quiz.html',
  '/study_dashboard.html',
  '/discipline_motivation.html',
  '/offline.html',
  '/clerk_sync.js',
  '/pwa-features.js',
  '/manifest.json',
  '/accusatory_instruments.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── INSTALL — cache everything immediately ────────────────
self.addEventListener('install', event => {
  console.log('[SW v4] Installing — caching all files');
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => {
        // Cache files one by one so one failure doesn't break all
        return Promise.allSettled(
          PRECACHE.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] Failed to cache:', url, err.message)
            )
          )
        );
      })
      .then(() => {
        console.log('[SW v4] Install complete');
        return self.skipWaiting(); // Activate immediately
      })
  );
});

// ── ACTIVATE — delete old caches ─────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW v4] Activating — clearing old caches');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim()) // Take control immediately
      .then(() => console.log('[SW v4] Active and in control'))
  );
});

// ── FETCH — cache first, network fallback ─────────────────
// This is what makes offline work:
// 1. Check cache first
// 2. If found — return cached version (works offline)
// 3. If not found — try network
// 4. If network succeeds — cache the response for next time
// 5. If network fails — show offline page

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (Supabase POST calls etc)
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests except Google Fonts
  const isGoogleFonts = url.hostname === 'fonts.googleapis.com' ||
                        url.hostname === 'fonts.gstatic.com';
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin && !isGoogleFonts) return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Cache hit — return immediately (offline works)
        if (cachedResponse) {
          // Background: also try to update cache with fresh version
          fetch(event.request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.ok) {
                const clone = networkResponse.clone();
                caches.open(CACHE_VERSION)
                  .then(cache => cache.put(event.request, clone));
              }
            })
            .catch(() => {}); // Ignore network errors during background update
          return cachedResponse;
        }

        // Not in cache — try network
        return fetch(event.request)
          .then(networkResponse => {
            if (!networkResponse || !networkResponse.ok) {
              return networkResponse;
            }
            // Cache the new response for next time
            const clone = networkResponse.clone();
            caches.open(CACHE_VERSION)
              .then(cache => cache.put(event.request, clone));
            return networkResponse;
          })
          .catch(() => {
            // Network failed — show offline page for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
            // For other assets return nothing (fail silently)
            return new Response('', { status: 408 });
          });
      })
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'NYS Clerk Exam Study', {
      body: data.body || 'Time to study!',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      vibrate: [100, 50, 100],
      tag: data.tag || 'study-reminder',
      renotify: true,
      data: { url: data.url || '/index.html' },
      actions: [
        { action: 'open',    title: '📖 Open now' },
        { action: 'snooze',  title: '⏰ 10 min'   },
        { action: 'dismiss', title: 'Dismiss'      }
      ]
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  if (event.action === 'snooze') {
    event.waitUntil(
      new Promise(resolve => {
        setTimeout(() => {
          self.registration.showNotification(event.notification.title, {
            body: event.notification.body,
            icon: '/icons/icon-192.png',
            tag: event.notification.tag + '-snoozed',
            data: event.notification.data
          });
          resolve();
        }, 10 * 60 * 1000); // 10 minutes
      })
    );
    return;
  }

  const url = event.notification.data?.url || '/index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});

// ── MESSAGES FROM APP ─────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CACHE_URLS') {
    // App can request additional URLs to be cached
    const urls = event.data.urls || [];
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(urls))
      .catch(err => console.warn('[SW] Cache URLs failed:', err));
  }
});

// ── BACKGROUND SYNC ───────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-checklist') {
    event.waitUntil(syncPending());
  }
});

async function syncPending() {
  // Supabase sync handled by clerk_sync.js when online
  console.log('[SW] Background sync triggered');
}
