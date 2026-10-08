import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function ensureReminderChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('membership-reminders', {
    name: 'Membership reminders',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
}

async function ensureNotificationPermission() {
  await ensureReminderChannel();
  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted && permissions.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
    throw new Error('Notifications are blocked. Open phone Settings → MFC → Notifications and allow notifications.');
  }
}

export async function getNativePushRegistration() {
  if (!Device.isDevice) throw new Error('Push notifications require a physical phone.');
  await ensureNotificationPermission();
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Expo project ID is missing.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!/^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(token)) {
    throw new Error('Expo returned an invalid push token.');
  }
  return {
    token,
    platform: Platform.OS === 'ios' ? 'expo-ios' : 'expo-android',
    deviceName: Device.modelName || `${Platform.OS} device`,
  };
}

export async function showReminders(items: unknown): Promise<number> {
  if (!Array.isArray(items) || items.length > 50 || items.some(item =>
    !item || typeof item.id !== 'string' || item.id.length > 100 ||
    typeof item.title !== 'string' || !item.title || item.title.length > 250 ||
    typeof item.body !== 'string' || !item.body || item.body.length > 2000)) {
    throw new Error('Invalid reminder notification request.');
  }
  if (!items.length) return 0;
  await ensureNotificationPermission();
  let count = 0;
  for (const item of items) {
    // A repeated manual request replaces an existing tray entry for this reminder.
    await Notifications.dismissNotificationAsync(item.id);
    await Notifications.scheduleNotificationAsync({
      identifier: item.id,
      content: { title: item.title, body: item.body, sound: 'default', data: { path: '/reminders' } },
      trigger: Platform.OS === 'android' ? { channelId: 'membership-reminders' } : null,
    });
    count++;
  }
  return count;
}
