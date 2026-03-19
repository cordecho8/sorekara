// それから Service Worker
// BUILD_DATE is injected by the GitHub Action deploy script.
// It changes on every push, so the cache key auto-busts each deploy.
const BUILD_DATE = '__BUILD_DATE__';
const CACHE = 'sorekara-' + BUILD_DATE;

// ── INSTALL ───────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(['/', '/index.html', '/sw.js', '/manifest.json']))
      .catch(() => {})
  );
});

// ── ACTIVATE: nuke all old caches ─────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: network-first, fallback to cache ───────────────────────────
self.addEventListener('fetch', e => {
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

// ── PUSH (future server-sent push) ────────────────────────────────────
self.addEventListener('push', e => {
  const data  = e.data ? e.data.json() : {};
  const title = data.title || 'それから';
  const body  = data.body  || 'Time to study!';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:      '/icon-192.png',
      badge:     '/icon-96.png',
      tag:       'sorekara-daily',
      renotify:  true,
      data:      { url: data.url || '/' },
      actions:   [{ action: 'study', title: 'Study now' }]
    })
  );
});

// ── NOTIFICATION CLICK ─────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      })
  );
});

// ── LOCAL SCHEDULE (postMessage from app) ─────────────────────────────
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'SCHEDULE_NOTIFICATION') return;
  const { title, body, delayMs, tag } = e.data;
  if (!delayMs || delayMs < 0) return;
  setTimeout(() => {
    self.registration.showNotification(title, {
      body,
      icon:     '/icon-192.png',
      badge:    '/icon-96.png',
      tag:      tag || 'sorekara-daily',
      renotify: true,
      data:     { url: '/' },
      silent:   false
    });
  }, delayMs);
});
