/**
 * Browser-side Web Push registration. Subscribes this device (phone or laptop) so the
 * server can ring a real OS-level notification on it even when this tab is closed or the
 * phone is locked — the in-tab chime (notificationSound.ts) only ever covers a tab that's
 * open and foregrounded right now.
 */
import { apiClient } from '../api/client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Registers the service worker, asks for notification permission if not already decided,
 * and subscribes this device with the server's VAPID key. Safe to call repeatedly (e.g. on
 * every login) — it's a no-op once already subscribed, and never throws past its own catch.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!isPushSupported()) return;
  // Respects a previous explicit "Block" — re-prompting would just be a silent no-op anyway,
  // but skip the subscribe attempt entirely rather than hitting the backend for nothing.
  if (Notification.permission === 'denied') return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');

    const existing = await registration.pushManager.getSubscription();
    if (existing) return;

    const permission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return;

    const res: any = await apiClient.get('/push/vapid-public-key');
    const publicKey = res?.data?.publicKey || res?.publicKey;
    if (!publicKey) return; // Server has no VAPID keys configured yet.

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const subJson = subscription.toJSON();
    await apiClient.post('/push/subscribe', {
      endpoint: subJson.endpoint,
      keys: subJson.keys,
    });
  } catch (err) {
    console.error('[push] Registration failed:', err);
  }
}
