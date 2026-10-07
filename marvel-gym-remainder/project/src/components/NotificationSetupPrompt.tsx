import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { subscribeToForegroundFcm } from '@/lib/firebaseNotifications';

// Notification setup is available in Settings. Do not interrupt login with a modal.
export default function NotificationSetupPrompt() {
  const { toast } = useToast();
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    subscribeToForegroundFcm(payload => {
      if (!cancelled) toast(payload.data?.body || payload.notification?.body || 'You have a new membership reminder.');
    }).then(stop => {
      if (cancelled) stop(); else unsubscribe = stop;
    }).catch(() => { /* Browser push is optional, particularly inside native apps. */ });
    return () => { cancelled = true; unsubscribe(); };
  }, [toast]);
  return null;
}
