type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

// Mirrors the service-worker count through the window Badging API when available.
export async function applyNotificationBadgeCount(count: number): Promise<void> {
  const badgeNavigator = navigator as BadgeNavigator;
  try {
    if (count <= 0 && badgeNavigator.clearAppBadge) await badgeNavigator.clearAppBadge();
    else if (badgeNavigator.setAppBadge) await badgeNavigator.setAppBadge(count);
  } catch {
    // Badging is optional; notification delivery must continue when unsupported.
  }
}

// Opening the owner's Reminders page is treated as clearing unread notifications.
export async function clearNotificationBadge(): Promise<void> {
  await applyNotificationBadgeCount(0);
}
