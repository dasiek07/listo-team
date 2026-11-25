// Listo Team – działanie offline + powiadomienia push.
// Przy każdej nowej wersji numer poniżej zmienia się automatycznie (scripts/build-dist.ps1).
const VERSION = 'listo-team-dev';
const SHELL = ['./', 'index.html', 'app.js', 'styles.css', 'config.js', 'manifest.webmanifest', 'icon.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // biblioteka Supabase i czcionki z CDN – zapamiętaj, żeby aplikacja startowała też bez internetu
  if (['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
    e.respondWith(caches.open(VERSION).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return; // zapytania do serwera danych zawsze przez sieć
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

// ---------- powiadomienia push ----------
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (er) { d = { title: 'Listo Team', body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Listo Team';
  const opts = {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, renotify: !!d.tag,
    data: { taskId: d.taskId || null, url: d.url || './' }, timestamp: Date.now(),
  };
  e.waitUntil(self.registration.showNotification(title, opts).then(() => {
    if (self.navigator && 'setAppBadge' in self.navigator && d.badge) return self.navigator.setAppBadge(d.badge).catch(() => {});
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.taskId;
  const target = new URL(id ? './#task-' + id : './#home', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'open-task', taskId: id }); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
self.addEventListener('pushsubscriptionchange', e => {
  // przeglądarka odnowiła subskrypcję – aplikacja zapisze nową przy następnym uruchomieniu
  e.waitUntil(Promise.resolve());
});
