const CACHE_NAME = "hoko-pwa-v15";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Always go to network - no caching
  event.respondWith(fetch(request).catch(() => {
    if (request.mode === "navigate") {
      return caches.match("/index.html") || new Response("Offline", { status: 503 });
    }
    return new Response("Offline", { status: 503 });
  }));
});