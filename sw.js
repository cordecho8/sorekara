// それから Service Worker — handles push notifications + offline cache
const CACHE = 'sorekara-v1';

// ── INSTALL: cache the app shell ──────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['/', '/index.html']))
      .catch(() => {}) // fail silently if paths differ
  );
});

// ── ACTIVATE: clean old caches ────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: network-first, cache fallback ─────────────────────────────
self.addEventListener('fetch', e => {
  // Only cache same-origin GET requests
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── PUSH: receive push from server (future use) ───────────────────────
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'それから';
  const body  = data.body  || 'Time to study!';
  const icon  = data.icon  || '/icon-192.png';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/icon-96.png',
      tag: 'sorekara-daily',
      renotify: true,
      data: { url: data.url || '/' },
      actions: [{ action: 'study', title: 'Study now' }]
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// ── SCHEDULED LOCAL NOTIFICATIONS via postMessage ────────────────────
// The app sends us the schedule via postMessage; we store it and
// use a periodic check (when SW wakes for other reasons) to fire it.
// For reliable daily notifications we use the Notification API directly
// from the app when it opens, scheduling future ones via setTimeout.
// The SW handles the actual showNotification call.

self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'SCHEDULE_NOTIFICATION') return;

  const { title, body, delayMs, tag } = e.data;
  if (!delayMs || delayMs < 0) return;

  // Use a self-terminating setTimeout — works as long as SW stays alive
  // (iOS keeps SW alive long enough for same-day scheduling)
  setTimeout(() => {
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      tag: tag || 'sorekara-daily',
      renotify: true,
      data: { url: '/' },
      silent: false
    });
  }, delayMs);
});
