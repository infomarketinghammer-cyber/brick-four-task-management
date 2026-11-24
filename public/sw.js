// BrickFour push service worker — shows a real OS-level notification (which rings/vibrates
// using the device's own notification sound) even while this tab is closed or backgrounded.
// Deliberately has no fetch/cache handling: this app is not an offline-first PWA, this
// worker exists purely to receive Web Push events.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'BrickFour', body: 'You have a new update.', data: {} };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Non-JSON push payload — fall back to the default text above.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/notification-icon.jpg',
      badge: '/notification-icon.jpg',
      vibrate: [200, 100, 200],
      data: payload.data || {},
      tag: payload.data?.taskId || undefined,
    })
  );
});

// Clicking the system notification focuses an already-open tab if there is one,
// otherwise opens a new one, instead of leaving the notification as a dead end.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.taskId
    ? `/tasks/${event.notification.data.taskId}`
    : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
