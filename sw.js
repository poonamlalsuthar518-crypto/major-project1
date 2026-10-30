/* SecureStep PWA service worker.
   Only the offline fallback is cached. User pages and all dynamic/sensitive
   traffic are deliberately network-only. */
const CACHE_NAME = "securestep-pwa-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith("securestep-pwa-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Do not intercept APIs, PHP endpoints, database exports, personal datasets,
  // or routes associated with emergency/location/user data.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.endsWith(".php") ||
    url.pathname === "/database" ||
    /\.(json|csv|kml|pdf)$/i.test(url.pathname) ||
    /(sos|emergency|location|users|contacts)/i.test(url.pathname)
  ) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE_URL)) || new Response(
          "You are offline. Reconnect to use SecureStep.",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
    })());
  }
});
