import { supabase } from '@/lib/supabase';

// VAPID public keys are designed to be shipped to browsers. Keep the
// environment override for key rotation, with the currently deployed key as a
// production-safe fallback. The matching private key remains in Supabase only.
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)
  || 'BMIJC6PkVGYSwdiX8KIpKhY3QvgXAyYdEgvIXdvwmEtdyTWb22fl6JGmcfxV3wrT9waA3qsEAy5eCTwIaqgPeDw';

interface BrowserNotificationSupport {
  supported: boolean;
  reason: string | null;
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isBrave(): boolean {
  return 'brave' in navigator;
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

export function getBrowserNotificationSupport(): BrowserNotificationSupport {
  if (!window.isSecureContext) return { supported: false, reason: 'Browser push requires HTTPS (localhost is allowed for development).' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { supported: false, reason: 'This browser does not support standards-based web push.' };
  }
  if (isIOS() && !isStandalone()) {
    return { supported: false, reason: 'On iPhone, first use Share → Add to Home Screen, then open Marvel Fitness Culture from its icon.' };
  }
  if (Notification.permission === 'denied') {
    return { supported: false, reason: 'Notifications are blocked. Allow Marvel Fitness Culture in your device or browser notification settings.' };
  }
  return { supported: true, reason: null };
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });
  await registration.update().catch(() => undefined);
  return navigator.serviceWorker.ready;
}

export async function isCurrentDeviceSubscribed(): Promise<boolean> {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  return Boolean(await registration?.pushManager.getSubscription());
}

function friendlyPushError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/push service error|registration failed|aborterror/i.test(message)) {
    if (isBrave()) {
      return new Error('Brave could not connect to push messaging. Open Brave Settings → Privacy and security, enable “Use Google services for push messaging”, restart Brave, and try again. In-app reminders remain active.');
    }
    if (isIOS()) {
      return new Error('On iPhone or iPad, update to iOS 16.4 or newer, add Marvel Fitness Culture to the Home Screen, and enable notifications from the installed app.');
    }
    return new Error('This browser could not connect to its system push service. Use a normal, non-private Chrome, Edge, Firefox, or Safari window and check that notifications are allowed in the operating-system settings. In-app reminders remain active.');
  }
  if (/notallowederror|permission/i.test(message)) {
    return new Error('Notification permission is blocked. Enable it in the browser or device settings, then try again.');
  }
  if (/invalidaccesserror|applicationserverkey|push key is invalid/i.test(message)) {
    return new Error('The deployed browser-push key is invalid or outdated. Redeploy with the current VITE_VAPID_PUBLIC_KEY.');
  }
  return new Error(message || 'Could not register browser notifications.');
}

export async function enableBrowserNotifications(gymId: string, userId: string): Promise<void> {
  const support = getBrowserNotificationSupport();
  if (!support.supported) throw new Error(support.reason ?? 'Browser notifications are unavailable.');
  try {
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    if (applicationServerKey.length !== 65 || applicationServerKey[0] !== 4) throw new Error('The deployed browser-push key is invalid.');

    const registration = await registerNotificationServiceWorker();
    if (!registration) throw new Error('The notification service worker could not be registered.');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted.');

    const existing = await registration.pushManager.getSubscription();
    let subscription = existing;
    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      } catch (firstError) {
        const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
        if (!/push service error|registration failed|aborterror/i.test(firstMessage)) throw firstError;
        await registration.update().catch(() => undefined);
        await new Promise(resolve => window.setTimeout(resolve, 500));
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      }
    }
    const json = subscription.toJSON();
    if (!json.keys?.p256dh || !json.keys?.auth) throw new Error('The browser returned an incomplete push subscription.');

    const { error } = await supabase.from('push_subscriptions').upsert({
      gym_id: gymId,
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) {
      await subscription.unsubscribe().catch(() => false);
      throw new Error(error.message);
    }
  } catch (error) {
    throw friendlyPushError(error);
  }
}

export async function disableBrowserNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  if (error) throw new Error(error.message);
  await subscription.unsubscribe();
}
