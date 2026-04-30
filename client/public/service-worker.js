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

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Hoko", body: event.data.text() };
  }

  const title = payload.title || "Hoko";
  const options = {
    body: payload.body || "You have a new notification",
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-72.png",
    tag: payload.tag || "default",
    data: {
      url: payload.url || "/buyer/dashboard",
      ...payload.data
    },
    actions: payload.actions || [],
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/buyer/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(urlToOpen) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});