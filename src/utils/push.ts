/**
 * Web Push — rings a real OS-level notification (with sound/vibration) on a subscribed
 * device even when the browser tab is closed or the phone screen is locked, unlike the
 * in-tab chime which only plays while the page is open and focused.
 */
import * as webpush from 'web-push';
import { tasksStore } from '../db/tasksStore';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@brickfour.com',
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return ensureConfigured();
}

/**
 * Sends a push notification to every device the given user has subscribed from.
 * Fire-and-forget from the caller's perspective — failures are logged, never thrown,
 * so a dead/expired subscription can't break the in-app notification it rides alongside.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = Array.from(tasksStore.pushSubscriptions.values()).filter(
    (s) => s.user_id === userId
  );
  if (subs.length === 0) return;

  const payload = JSON.stringify({ title, body, data: data || {} });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys } as any,
          payload
        );
      } catch (err: any) {
        // 404/410 = the push service says this subscription no longer exists (device
        // unsubscribed, cleared site data, or uninstalled) — stop sending to it.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          tasksStore.pushSubscriptions.delete(sub.endpoint);
        } else {
          console.error('[push] Failed to send to', sub.endpoint, err?.message || err);
        }
      }
    })
  );
}
