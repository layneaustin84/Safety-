/*
 * CSP Drill service worker.
 *
 * - App files: network-first with a short timeout, falling back to the cache, so an
 *   online launch always gets the latest questions and an offline launch still works.
 * - Google Fonts: cache-first, refreshed in the background (fonts fall back to system
 *   faces if they were never cached).
 *
 * VERSION must equal CSP_DATA.version in questions.js (CI enforces this). Changing it
 * changes this file's bytes, which is what makes browsers install the new worker and
 * show the "new version" banner.
 */
const VERSION = "1.1.0";
const APP_CACHE = `csp-drill-app-${VERSION}`;
const FONT_CACHE = "csp-drill-fonts-v1";
const NETWORK_TIMEOUT_MS = 4000;

const PRECACHE = [
  "./",
  "./index.html",
  "./questions.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: "reload" }))))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("csp-drill-app-") && k !== APP_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** Resolves with the network response, or rejects after `ms` so the cache can answer. */
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      res => { clearTimeout(timer); resolve(res); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (_) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === "navigate") {
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    }
    return new Response("Offline and not cached yet.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function fontCacheFirst(request) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then(res => { if (res.ok || res.type === "opaque") cache.put(request, res.clone()); return res; })
    .catch(() => undefined);
  if (hit) return hit;
  const res = await refresh;
  return res || new Response("", { status: 504 });
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(fontCacheFirst(request));
  }
});
