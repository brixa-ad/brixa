// BRIXA service worker: shows push notifications and opens the right page when one is tapped.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const work = [
    self.registration.showNotification(data.title || "BRIXA", {
      body: data.body || "",
      icon: "/icon/192",
      tag: data.tag,
      // a new message in the same conversation still rings
      renotify: Boolean(data.renotify && data.tag),
      // stays on screen until it's tapped (Android, computers — the iPhone keeps it in the list)
      requireInteraction: Boolean(data.requireInteraction),
      // "Call" / "Viber" / "E-mail" buttons where the phone supports them (not on iPhone)
      actions: (data.actions || []).slice(0, (self.Notification && self.Notification.maxActions) || 0),
      data: { url: data.url || "/", links: data.links || {} },
    }),
  ];
  // the morning brief: a badge on the app's icon until the day is opened
  if (data.badge && self.navigator.setAppBadge) work.push(self.navigator.setAppBadge(1).catch(() => {}));
  event.waitUntil(Promise.all(work));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  // A button opens the task with ?contact=call|viber|email — the page starts that right away.
  const target = (event.action && data.links && data.links[event.action]) || data.url || "/";
  const url = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      // Reuse an open BRIXA window if there is one.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
