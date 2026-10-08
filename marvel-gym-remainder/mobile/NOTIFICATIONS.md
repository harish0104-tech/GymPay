# Manual phone notifications (1.0.1)

The updated app uses Expo Notifications to display local system notifications on the phone where the owner presses Send now. The website first calls the existing authenticated reminder function, then reads the persisted reminders for the signed-in gym and sends them through an origin-checked WebView bridge. Native permission denial and scheduling errors are reported to the website. Repeated manual sends replace existing tray entries using the reminder ID. Tapping a notification opens Reminders.

Deploy the website changes to the existing Vercel project and install a newly built 1.0.1 APK (or signed iOS build). The old 1.0.0 APK cannot display these notifications and will prompt for an app update when Send now is used on the updated website.

On first Send now, allow phone notifications. Check the notification shade, repeat Send now to check duplicate replacement, deny permission to verify the error, and tap a notification to verify navigation. Verify with real due reminders on a physical device. Android/iOS may suppress sound or banners under Do Not Disturb or user channel settings.

This implements manual notifications on the current device. It does not register native remote-push tokens or deliver scheduled server reminders while the app is closed. Browser push remains separate. No FCM/APNs remote credentials are required for these local notifications.

Validation: `node --test notifications.test.cjs`, `npm run typecheck`, and `npm run build:bundles` in mobile; website typecheck/build in project. Physical-device notification delivery still requires testing after deployment and installation.
