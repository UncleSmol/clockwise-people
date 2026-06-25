self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);

      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SHOW_NOTIFICATION") return;

  const { title, body, url, tag } = event.data.payload || {};

  if (!title || !body) return;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url: url || "/dashboard" },
      icon: "/assets/android-chrome-192x192.png",
      badge: "/assets/favicon-32x32.png",
      tag,
    }),
  );
});
