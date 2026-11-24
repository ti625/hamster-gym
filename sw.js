/* Hamster Gym – Service Worker: macht die App offline-fähig.
   Bei jeder neuen Version CACHE hochzählen, damit Geräte das Update laden. */
const CACHE = 'hamster-gym-v7';
const FONT_CACHE = 'hamster-gym-fonts';
const DATA_CACHE = 'hamster-gym-data';

/* Erinnerungen im Hintergrund (Periodic Background Sync – nur wo der Browser es erlaubt,
   z. B. Chrome auf Android bei installierter App). Die App legt die Liste in reminders.json ab. */
async function fireDueReminders() {
  const c = await caches.open(DATA_CACHE);
  const res = await c.match('reminders.json'); if (!res) return;
  const data = await res.json(), now = Date.now(), sent = new Set(data.sent || []);
  for (const r of data.items || []) {
    if (sent.has(r.key) || now < r.ts || now > r.ts + 45 * 60000 || (data.blocked || []).includes(r.day)) continue;
    sent.add(r.key);
    await self.registration.showNotification(r.title, { body: r.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'hg-' + r.id, vibrate: [200, 100, 200], data: { url: './' } });
  }
  data.sent = [...sent];
  await c.put('reminders.json', new Response(JSON.stringify(data)));
}
self.addEventListener('periodicsync', e => { if (e.tag === 'hamster-reminders') e.waitUntil(fireDueReminders()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const cl of list) if ('focus' in cl) return cl.focus();
    return self.clients.openWindow('./');
  }));
});
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONT_CACHE && k !== DATA_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: aus dem Cache, im Hintergrund aktualisieren
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // App-Seite: erst Netz (für Updates), offline aus dem Cache
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // Sonstige Dateien: Cache zuerst
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
