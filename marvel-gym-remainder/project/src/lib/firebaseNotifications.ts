import { getApp, getApps, initializeApp } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';
import { supabase } from '@/lib/supabase';
import { registerNotificationServiceWorker } from '@/lib/browserNotifications';

// Firebase Web App identifiers and the VAPID public key are public by design.
// Environment values remain the primary configuration; these deployed-project
// fallbacks prevent Preview/PWA builds from silently losing push support.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyD9wsFQAIbbWF1oMiO5GWGckpFFBKwNcoU',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'marvel-gym-remainder.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'marvel-gym-remainder',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'marvel-gym-remainder.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1092260295232',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1092260295232:web:9db184715203dcacea25a5',
};
const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BN7dXkyJcTdE9n3ND2Eb37gWbDj2WT4B1yELL3cXkIz7LKF-eyw9RuKarxqQrfkZ7D5l3cnwTIcb3a1VnrNAe44';
const configured = () => Boolean(config.apiKey && config.projectId && config.messagingSenderId && config.appId && vapidKey);
const messaging = async () => configured() && await isSupported() ? getMessaging(getApps().length ? getApp() : initializeApp(config)) : null;

export async function getFcmSupport() {
  if (!('Notification' in window)) return { supported: false, reason: 'Push notifications are unavailable in this app. You can still view reminders on the Reminders page.' };
  if (!window.isSecureContext) return { supported: false, reason: 'Notifications require HTTPS.' };
  if (!configured()) return { supported: false, reason: 'Firebase notifications are not configured on this deployment.' };
  if (!(await isSupported())) return { supported: false, reason: 'This browser does not support Firebase push notifications.' };
  if (Notification.permission === 'denied') return { supported: false, reason: 'Notifications are blocked in browser or device settings.' };
  return { supported: true, reason: null };
}

export async function enableFcmNotifications(gymId: string, _userId: string) {
  const support = await getFcmSupport();
  if (!support.supported) throw new Error(support.reason!);
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notification permission was not granted.');
  const registration = await registerNotificationServiceWorker();
  const instance = await messaging();
  if (!registration || !instance) throw new Error('Firebase messaging is unavailable.');
  const token = await getToken(instance, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error('Firebase did not return a device token.');
  const { error } = await supabase.rpc('register_notification_device', {
    p_gym_id: gymId,
    p_fcm_token: token,
    p_platform: /Android/i.test(navigator.userAgent) ? 'android-web' : /iPhone|iPad/i.test(navigator.userAgent) ? 'ios-pwa' : 'desktop-web',
    p_device_name: navigator.userAgent.slice(0, 250),
  });
  if (error) throw new Error(error.message);
}

export async function disableFcmNotifications() {
  const instance = await messaging();
  if (!instance) return;
  const registration = await registerNotificationServiceWorker();
  const token = await getToken(instance, { vapidKey, serviceWorkerRegistration: registration! }).catch(() => '');
  if (token) await supabase.from('notification_devices').update({ enabled: false, updated_at: new Date().toISOString() }).eq('fcm_token', token);
  await deleteToken(instance).catch(() => false);
}

export async function isCurrentFcmDeviceEnabled() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const instance = await messaging(); const registration = await registerNotificationServiceWorker();
  if (!instance || !registration) return false;
  const token = await getToken(instance, { vapidKey, serviceWorkerRegistration: registration }).catch(() => '');
  if (!token) return false;
  const { data } = await supabase.from('notification_devices').select('enabled').eq('fcm_token', token).maybeSingle();
  return Boolean(data?.enabled);
}

export async function subscribeToForegroundFcm(handler: (payload: MessagePayload) => void) {
  const instance = await messaging();
  return instance ? onMessage(instance, handler) : () => undefined;
}

export async function scheduleFcmTest(delayMinutes = 3) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) throw new Error('Your login session has expired. Please log in again.');
  const { data, error } = await supabase.functions.invoke('send-due-notifications', {
    body: { action: 'schedule_test', delay_minutes: delayMinutes },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response) {
      const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    }
    throw error;
  }
  return data as { id: string; scheduled_at: string };
}
