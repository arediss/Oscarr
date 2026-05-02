// Push notification handler for Oscarr PWA
// This file is injected into the service worker by vite-plugin-pwa

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'Oscarr', {
        body: data.body || '',
        icon: data.icon || '/logo.png',
        badge: '/logo.png',
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

  const rawUrl = event.notification.data?.url || '/';
  const absoluteUrl = rawUrl.startsWith('http') ? rawUrl : self.location.origin + rawUrl;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          if (client.navigate) client.navigate(absoluteUrl); // Safari iOS doesn't support navigate()
          return;
        }
      }
      return clients.openWindow(absoluteUrl);
    })
  );
});
