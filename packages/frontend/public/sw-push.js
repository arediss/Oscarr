// Push notification handler for Oscarr PWA
// This file is injected into the service worker by vite-plugin-pwa

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'Oscarr', {
        body: data.body || '',
        icon: data.icon || '/favicon.svg',
        badge: '/favicon.svg',
        data: { url: data.url || '/' },
        tag: data.url || 'oscarr-notification', // prevents duplicate notifications
        renotify: true,
      })
    );
  } catch (e) {
    console.error('[SW] Push parse error:', e);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If app is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window
      return clients.openWindow(url);
    })
  );
});
