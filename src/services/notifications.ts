const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

export async function registerForPushNotifications(teamId: string): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('Push notifications are not supported');
      return false;
    }

    // Request notification permission first
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      console.log('Notification permission status:', permission);
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        return false;
      }
    }

    // Register service worker
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('Service Worker registered');

    // Get VAPID public key
    const response = await fetch(`${SERVER_URL}/api/push/vapid-public-key`);
    const { key: vapidPublicKey } = await response.json();

    // Get push subscription
    let subscription = await registration.pushManager.getSubscription();

    // If no subscription exists, create one
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
      console.log('Created new push subscription:', subscription);
    }

    // Send subscription to server
    await fetch(`${SERVER_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        teamId,
        subscription
      })
    });

    return true;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return false;
  }
}

export async function unregisterFromPushNotifications(teamId: string): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      // Unsubscribe from push notifications
      await subscription.unsubscribe();
      
      // Remove subscription from server
      await fetch(`${SERVER_URL}/api/push/unsubscribe`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          endpoint: subscription.endpoint
        })
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error unregistering from push notifications:', error);
    return false;
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
} 