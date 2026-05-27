// ── SERVICE WORKER — NYS Clerk Exam PWA v2 ──────────────────
const CACHE_NAME = 'clerk-exam-v2';
const OFFLINE_URL = 'offline.html';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/week1_schedule_final.html',
  '/week1_notes_quiz.html',
  '/discipline_motivation.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap'
];

// ── NOTIFICATION SCHEDULE ──────────────────────────────────
const NOTIFICATIONS = [
  {
    id: 'morning',
    hour: 8, minute: 15,
    title: '📚 Morning commute — CPL Art. 1',
    body: 'Open ClerkOne. 30 min. Stop when you get off. You know what to do.',
    url: '/week1_schedule_final.html',
    tag: 'morning-study'
  },
  {
    id: 'lunch',
    hour: 13, minute: 15,
    title: '✍️ Lunch blurt time',
    body: 'Blank paper. Write everything you remember. No notes open. Go.',
    url: '/week1_schedule_final.html',
    tag: 'lunch-study'
  },
  {
    id: 'winddown',
    hour: 20, minute: 0,
    title: '📖 Wind-down — NO SCREEN after this',
    body: 'Pick up the book. Open it to tonight\'s article. 15 minutes.',
    url: '/week1_schedule_final.html',
    tag: 'winddown-study'
  }
];

// ── INSTALL ────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => scheduleAllNotifications())
  );
});

// ── FETCH — cache first, network fallback ──────────────────
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match(OFFLINE_URL));
    })
  );
});

// ── PUSH NOTIFICATIONS ─────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Time to study!',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [100, 50, 100],
    tag: data.tag || 'study-reminder',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || '/index.html' },
    actions: [
      { action: 'open', title: '📖 Open now', icon: '/icons/icon-72.png' },
      { action: 'snooze', title: '⏰ 10 min', icon: '/icons/icon-72.png' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'NYS Clerk Exam Study', options)
  );
});

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
            badge: '/icons/badge-72.png',
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
          if ('focus' in client) { client.focus(); return; }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});

// ── SCHEDULED NOTIFICATIONS (client-side scheduling) ───────
// Called from the app to schedule daily reminders
self.addEventListener('message', event => {
  if (event.data?.type === 'SCHEDULE_NOTIFICATIONS') {
    scheduleAllNotifications();
  }
  if (event.data?.type === 'UPDATE_BADGE') {
    updateBadge(event.data.count);
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function scheduleAllNotifications() {
  // Notifications are triggered by the app's scheduler in pwa-features.js
  // SW handles delivery and actions
  console.log('SW: notification schedule ready');
}

// ── BADGE API ──────────────────────────────────────────────
async function updateBadge(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) {
      await navigator.setAppBadge(count);
    } else {
      await navigator.clearAppBadge();
    }
  }
}

// ── BACKGROUND SYNC ────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-checklist') {
    event.waitUntil(syncPendingData());
  }
  if (event.tag === 'sync-quiz') {
    event.waitUntil(syncQuizData());
  }
});

async function syncPendingData() {
  try {
    const cache = await caches.open('pending-sync');
    const keys = await cache.keys();
    for (const req of keys) {
      const res = await cache.match(req);
      const data = await res.json();
      console.log('Syncing pending checklist data:', data);
      // Future: POST to Supabase when connected
      await cache.delete(req);
    }
  } catch (e) {
    console.log('Sync failed, will retry:', e);
  }
}

async function syncQuizData() {
  console.log('Syncing quiz data...');
  // Future: POST to Supabase when connected
}

// ── SHARE TARGET ───────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (
    event.request.method === 'POST' &&
    url.pathname === '/share-target'
  ) {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        const title = formData.get('title') || '';
        const text = formData.get('text') || '';
        const sharedUrl = formData.get('url') || '';
        const combined = [title, text, sharedUrl].filter(Boolean).join('\n');
        // Store shared content for the app to pick up
        const cache = await caches.open('shared-content');
        await cache.put(
          '/shared-latest',
          new Response(JSON.stringify({ title, text, url: sharedUrl, combined, timestamp: Date.now() }))
        );
        return Response.redirect('/index.html?shared=1', 303);
      })()
    );
  }
});
