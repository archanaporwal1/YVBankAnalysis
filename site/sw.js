/* Offline support: app shell + reading libraries are cached after the first visit. Nothing about your statements is ever stored. */
var V = 'yv-siq-v21';
var SHELL = ['./', 'index.html', 'style.css', 'app.js', 'engine.js', 'xlsxout.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (x) { return x !== V; }).map(function (x) { return caches.delete(x); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET') return;
  var u = new URL(r.url), own = u.origin === location.origin, lib = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|tessdata|unpkg\.com/.test(u.hostname);
  if (!own && !lib) return;
  e.respondWith(caches.open(V).then(function (c) {
    return c.match(r).then(function (hit) {
      var net = fetch(r).then(function (res) { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res; }).catch(function () { return hit; });
      return own ? net.then(function (res) { return res || hit; }) : (hit || net);
    });
  }));
});
