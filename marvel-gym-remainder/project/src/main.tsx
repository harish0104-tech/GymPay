import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerNotificationServiceWorker } from '@/lib/browserNotifications';
import { applyNotificationBadgeCount } from '@/lib/notificationBadge';

if ('serviceWorker' in navigator) {
  // Update checks never force a reload. An activated worker notifies the UI,
  // allowing the owner to refresh after saving any work in progress.
  registerNotificationServiceWorker().then((registration) => {
    if (!registration) return;
    // Restore the persisted unread count after opening or updating the PWA.
    registration.active?.postMessage({ type: 'MFC_SYNC_BADGE' });
    const checkForUpdate = () => registration.update().catch(() => undefined);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
    window.setInterval(checkForUpdate, 60 * 60 * 1000);
  }).catch(error => {
    console.warn('Notification service worker registration failed:', error);
  });

  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'MFC_BADGE_COUNT') {
      applyNotificationBadgeCount(Number(event.data.count) || 0);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
