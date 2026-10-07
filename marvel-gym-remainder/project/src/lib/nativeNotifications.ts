import { supabase } from '@/lib/supabase';

type NativeWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
  mfcNativeNotifications?: boolean;
  mfcNativePushRegistration?: boolean;
};

export function isNativeApp() {
  return Boolean((window as NativeWindow).ReactNativeWebView);
}

export async function showNativeReminders(items: { id: string; title: string; body: string }[]): Promise<number> {
  const nativeWindow = window as NativeWindow;
  if (!nativeWindow.mfcNativeNotifications) throw new Error('Install the latest app version to receive phone notifications.');
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const finish = (error?: string, count = 0) => {
      window.clearTimeout(timeout);
      window.removeEventListener('mfc-native-notifications', listener);
      if (error) reject(new Error(error)); else resolve(count);
    };
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.id === id) finish(detail.error, detail.count);
    };
    const timeout = window.setTimeout(() => finish('Notification request timed out. Check the phone notification permission and try again.'), 60000);
    window.addEventListener('mfc-native-notifications', listener);
    nativeWindow.ReactNativeWebView!.postMessage(JSON.stringify({ type: 'MFC_SHOW_REMINDERS', id, items }));
  });
}

export async function registerNativePushDevice(gymId: string): Promise<boolean> {
  const nativeWindow = window as NativeWindow;
  if (!nativeWindow.ReactNativeWebView || !nativeWindow.mfcNativePushRegistration) return false;
  const id = crypto.randomUUID();
  const registration = await new Promise<{ token: string; platform: string; deviceName: string }>((resolve, reject) => {
    const finish = (detail: { error?: string; token?: string; platform?: string; deviceName?: string }) => {
      window.clearTimeout(timeout);
      window.removeEventListener('mfc-native-push-registration', listener);
      if (detail.error || !detail.token || !detail.platform) reject(new Error(detail.error || 'Push registration failed.'));
      else resolve({ token: detail.token, platform: detail.platform, deviceName: detail.deviceName || 'MFC mobile app' });
    };
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.id === id) finish(detail);
    };
    const timeout = window.setTimeout(() => finish({ error: 'Phone notification registration timed out.' }), 60000);
    window.addEventListener('mfc-native-push-registration', listener);
    nativeWindow.ReactNativeWebView!.postMessage(JSON.stringify({ type: 'MFC_REGISTER_PUSH', id }));
  });
  const { error } = await supabase.rpc('register_notification_device', {
    p_gym_id: gymId,
    p_fcm_token: registration.token,
    p_platform: registration.platform,
    p_device_name: registration.deviceName,
  });
  if (error) throw new Error(error.message);
  return true;
}
