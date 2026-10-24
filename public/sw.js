self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function createNotificationOptions(payload) {
  const { body, url, tag } = payload || {};
  return {
    body: body || "You have an update in ClockWise People.",
    icon: "/assets/android-chrome-192x192.png",
    badge: "/assets/favicon-32x32.png",
    vibrate: [250, 100, 250, 100, 250], // WhatsApp-style mobile vibration pattern
    tag: tag || "clockwise-notification",
    renotify: true,
    requireInteraction: false,
    data: {
      url: url || "/dashboard",
      timestamp: Date.now(),
    },
    actions: [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") {
    return;
  }

  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Find an existing ClockWise window
      const existing = clients.find((client) => "focus" in client);

      if (existing) {
        if ("navigate" in existing) {
          existing.navigate(targetUrl);
        }
        return existing.focus();
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

self.addEventListener("push", (event) => {
  let title = "ClockWise People";
  let body = "You have a new update.";
  let url = "/dashboard";
  let tag = "clockwise-alert";

  if (event.data) {
    try {
      const json = event.data.json();
      title = json.title || title;
      body = json.body || body;
      url = json.url || url;
      tag = json.tag || tag;
    } catch {
      body = event.data.text() || body;
    }
  }

  const options = createNotificationOptions({ body, url, tag });
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SHOW_NOTIFICATION") return;

  const payload = event.data.payload || {};
  const title = payload.title || "ClockWise People";

  const options = createNotificationOptions(payload);
  event.waitUntil(self.registration.showNotification(title, options));
});

