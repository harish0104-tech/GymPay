# Multi-channel notifications

The existing `reminders` table remains the source of notification events. The
existing WhatsApp code and data are preserved, but active WhatsApp delivery is
off unless the `ENABLE_WHATSAPP_DELIVERY=true` Edge Function secret is set.

## Channels

- **In-app:** Enabled by default. A reminder remains visible in the Reminders page.
- **Browser push:** Opt-in per gym and per browser/device.

Owners configure these channels under **Settings → Notifications**.

Browser push has two levels: a gym-wide master switch and a per-device
subscription. After the master switch is on, open Settings on each Windows PC,
Mac, laptop, Android phone, or installed iPhone/iPad web app and choose **Enable
device**. Browser security rules require permission to be granted separately on
every browser/device; one device cannot grant it for another.

## Added data

No existing table was altered. Migration `012_multichannel_notifications.sql`
adds:

- `notification_preferences`: one preference row per gym.
- `push_subscriptions`: Web Push subscriptions per browser and owner.
- `notification_delivery_logs`: one result per reminder/channel.

All three tables use owner-scoped RLS. The dispatcher writes logs with the
Supabase service role.

## Browser push setup

Generate VAPID keys once:

```sh
npx web-push generate-vapid-keys --json
```

Set the public key in the frontend environment:

```text
VITE_VAPID_PUBLIC_KEY=<public-key>
```

Set server-only values as Supabase Edge Function secrets:

```sh
npx supabase secrets set VAPID_PUBLIC_KEY=<public-key> VAPID_PRIVATE_KEY=<private-key> VAPID_SUBJECT=mailto:admin@example.com
```

Never add the private key to `VITE_*` or commit it. Push requires HTTPS in
production (localhost is allowed for development). The service worker is
`public/sw.js`.

## Dispatcher

`dispatch-notifications` accepts an optional JSON body:

```json
{
  "reminder_ids": ["reminder-uuid"]
}
```

An empty object dispatches reminders scheduled for today:

```json
{}
```

Response:

```json
{
  "success": true,
  "processed": 10,
  "sent": 10,
  "failed": 0,
  "skipped": 20
}
```

Browser push payload:

```json
{
  "title": "Member Name expires tomorrow",
  "body": "Member Name's Monthly Gym membership expires tomorrow...",
  "tag": "reminder-<uuid>",
  "url": "/?page=reminders"
}
```

## Error handling and logs

External channel failures never delete or hide the source reminder. Each
attempt is upserted into `notification_delivery_logs` with:

- channel and status (`sent`, `failed`, or `skipped`)
- attempt count and timestamps
- provider message ID when available
- payload and sanitized error message

The Reminders page displays these statuses per channel. Retrying the dispatcher
updates the same `(reminder_id, channel)` log instead of creating duplicates.

## Deployment

```sh
npx supabase db push
npx supabase functions deploy dispatch-notifications
npx supabase functions deploy daily-reminders
npm run build
```

The existing daily reminder function invokes the dispatcher automatically after
creating/updating reminders.

## Vercel and iPhone deployment checklist

Vercel's free `*.vercel.app` domain uses HTTPS and is suitable for service
workers and Web Push.

1. In Vercel project settings, add the same Supabase frontend values used
   locally: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. The current VAPID public key is safely bundled in the frontend because it is
   public by design. `VITE_VAPID_PUBLIC_KEY` is optional and can override it
   during future key rotation. The private key stays only in Supabase.
3. Redeploy after changing any `VITE_*` variable; Vite embeds these at build
   time.
4. Verify `/manifest.json` and `/sw.js` return HTTP 200 on the deployed domain.
5. On iPhone/iPad, use iOS/iPadOS 16.4 or later, open the HTTPS domain, choose
   **Share → Add to Home Screen**, then launch Marvel Fitness Culture from its Home Screen
   icon. Push cannot be enabled from an ordinary iPhone browser tab.
6. In the installed app, sign in and enable **Settings → Browser Push
   Notifications**. The permission request must follow this direct tap.
7. Use **Reminders → Send Reminders Now** and move the app to the background.

In-app reminders do not require installation or notification permission; they
work in any supported browser as long as the owner is signed in.
