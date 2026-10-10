/* Notes Bazar service worker – app shell + offline support */
const VER = 'v1';
const SHELL = 'nb-shell-' + VER;      // index.html, manifest, icons
const STATIC = 'nb-static-' + VER;    // font-awesome, firebase sdk, fonts
const DATA = 'nb-data-' + VER;        // lists + opened files (so they open offline)
const FILE_LIMIT = 25;                // max opened files kept offline
const SHELL_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const STATIC_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.allSettled(SHELL_FILES.map(f => c.add(f)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('nb-') && ![SHELL, STATIC, DATA].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });

async function networkFirst(req, cacheName, ms, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await timeout(fetch(req), ms);
    if (res && res.ok) cache.put(fallbackKey || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(fallbackKey || req, { ignoreSearch: false }) || await cache.match(fallbackKey || req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function trimFiles(cache) {
  const keys = (await cache.keys()).filter(r => r.url.includes('/notes_bazar_files/'));
  for (let i = 0; i < keys.length - FILE_LIMIT; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) the page itself
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(networkFirst(req, SHELL, 3500, './index.html').catch(() => caches.match('./index.html')));
    return;
  }
  // 2) own static files (icons, manifest)
  if (url.origin === location.origin) {
    e.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }
  // 3) CDN assets (font-awesome, firebase sdk, fonts)
  if (STATIC_HOSTS.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req, STATIC));
    return;
  }
  // 4) Firebase Realtime DB (public REST only): list + files
  if (url.hostname.endsWith('firebaseio.com')) {
    if (url.pathname.startsWith('/notes_bazar_files/')) {          // opened files: cache-first
      e.respondWith((async () => {
        const cache = await caches.open(DATA);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok) { await cache.put(req, res.clone()); trimFiles(cache); }
        return res;
      })());
      return;
    }
    if (url.pathname.startsWith('/notes_bazar_data') || url.pathname.startsWith('/notes_bazar_stats')) {   // list: network-first
      e.respondWith(networkFirst(req, DATA, 4000));
      return;
    }
  }
  // everything else (auth, AI, writes) goes straight to the network
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
