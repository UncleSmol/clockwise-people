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

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let title = "ClockWise People";
  let body = "You have a new update.";
  let url = "/dashboard";
  let tag = "general";

  try {
    const json = event.data.json();
    title = json.title || title;
    body = json.body || body;
    url = json.url || url;
    tag = json.tag || tag;
  } catch {
    body = event.data.text() || body;
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
      icon: "/assets/android-chrome-192x192.png",
      badge: "/assets/favicon-32x32.png",
      tag,
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
