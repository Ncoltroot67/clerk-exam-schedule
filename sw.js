// ── SERVICE WORKER — NYS Clerk Exam PWA v5 ───────────────
// Simplified for maximum Safari compatibility

const CACHE = 'clerk-exam-v9';

const FILES = [
  './',
  './index.html',
  './week1_schedule_final.html',
  './week2_schedule.html',
  './week1_notes.html',
  './week1_quiz.html',
  './study_dashboard.html',
  './game.html',
  './jeopardy.html',
  './offline.html',
  './clerk_sync.js',
  './pwa-features.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(FILES.map(f => c.add(f))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(e.request)
          .then(res => {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
            return res;
          })
          .catch(() => caches.match('./offline.html'));
      })
  );
});

self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(d.title || 'Study reminder', {
      body: d.body || 'Time to study!',
      icon: './icons/icon-192.png',
      tag: d.tag || 'study',
      data: { url: d.url || './index.html' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || './index.html'));
});
