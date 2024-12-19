self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon,
        data: data.data,
        vibrate: [200, 100, 200],
        badge: '/icon-192x192.png',
        tag: data.data?.event?.type // Group similar notifications
      })
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // Handle notification click
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
}); 