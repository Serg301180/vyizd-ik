// «Виїзд ІК»: офлайн-кеш + фонова відправка черги (Background Sync, Chrome Android).
importScripts('outbox.js');
const C = 'vyizd-ik-v9';
const FILES = ['./', './index.html', './outbox.js', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
async function notify(msg) { (await self.clients.matchAll({ includeUncontrolled: true })).forEach(c => c.postMessage(msg)); }
self.addEventListener('sync', e => {
  if (e.tag !== 'outbox') return;
  e.waitUntil(flushOutbox().then(async r => {
    await notify({ type: 'flushed', r });
    if (r.err) throw new Error(r.err); // Chrome повторить пізніше
  }));
});
