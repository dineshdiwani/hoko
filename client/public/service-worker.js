const CACHE_NAME = "hoko-pwa-v13";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/app-icon-192.png",
  "/app-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            responseClone.text().then((text) => {
              caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", new Response(text, responseClone)));
            }).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match("/index.html").then(
            (cachedShell) =>
              cachedShell ||
              new Response("Offline", {
                status: 503,
                statusText: "Service Unavailable",
                headers: {
                  "Content-Type": "text/plain; charset=utf-8"
                }
              })
          )
        )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Always go to network for API calls to avoid stale admin/dashboard data.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({
            message: "Network unavailable"
          }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      )
    );
    return;
  }

// Hashed JS/CSS assets should come from network first so deploys are visible immediately.
  if (
    (request.destination === "script" || request.destination === "style") &&
    /\/assets\/.+-[A-Za-z0-9_-]+\.(js|css)$/.test(url.pathname)
  ) {
    event.respondWith(
      fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const reader = response.body.getReader();
              return reader.read().then(({ done, value }) => {
                const body = new Uint8Array(value);
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, new Response(body, { status: 200, statusText: "OK", headers: response.headers }));
                });
                return new Response(body, { status: 200, statusText: "OK", headers: response.headers });
              }).catch(() => response);
            }
            return response;
          })
          .catch(
            () =>
              caches.match(request).then(
                (cachedAsset) =>
                  cachedAsset ||
                  new Response("Offline", {
                    status: 503,
                    statusText: "Service Unavailable",
                    headers: {
                      "Content-Type": "text/plain; charset=utf-8"
                    }
                  })
              )
          )
    );
    return;
  }

// Non-hashed JS/CSS can still use cache-first with background revalidation.
  if (request.destination === "script" || request.destination === "style") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkRequest = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === "basic") {
              const reader = response.body.getReader();
              return reader.read().then(({ done, value }) => {
                const body = new Uint8Array(value);
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, new Response(body, { status: 200, statusText: "OK", headers: response.headers }));
                });
                return new Response(body, { status: 200, statusText: "OK", headers: response.headers });
              }).catch(() => response);
            }
            return response;
          })
          .catch(
            () =>
              cached ||
              new Response("Offline", {
                status: 503,
                statusText: "Service Unavailable",
                headers: {
                  "Content-Type": "text/plain; charset=utf-8"
                }
              })
          );

        return cached || networkRequest;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== "basic") {
              return response;
            }
            const reader = response.body.getReader();
            return reader.read().then(({ done, value }) => {
              const body = new Uint8Array(value);
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, new Response(body, { status: 200, statusText: "OK", headers: response.headers }));
              });
              return new Response(body, { status: 200, statusText: "OK", headers: response.headers });
            }).catch(() => response);
          })
          .catch(
            () =>
              new Response("Offline", {
                status: 503,
                statusText: "Service Unavailable"
              })
          )
    )
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      body: event.data ? event.data.text() : ""
    };
  }

  const title = String(payload.title || "HOKO");
  const body = String(payload.body || "You have a new notification");
  const url = String(payload.url || payload?.data?.url || "/");
  const icon = String(payload.icon || "/app-icon-192.png");
  const badge = String(payload.badge || "/app-icon-192.png");
  const tag = String(payload.tag || "hoko-notification");

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: {
        ...payload.data,
        url
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawDestination = String(event.notification?.data?.url || "/");
  let destination = "/";
  try {
    const parsed = new URL(rawDestination, self.location.origin);
    if (parsed.origin === self.location.origin) {
      destination = `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
    }
  } catch {
    destination = "/";
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = String(client.url || "");
        if (!clientUrl.startsWith(self.location.origin)) {
          continue;
        }
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(destination);
          }
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(destination);
      }
      return null;
    })
  );
});
