import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Apikey',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

type Channel = 'in_app' | 'browser_push';
type DeliveryStatus = 'sent' | 'failed' | 'skipped';

interface DispatchResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

function describePushError(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'object' && reason !== null) {
    const value = reason as { statusCode?: number; body?: string; message?: string };
    const body = value.body ? value.body.slice(0, 300) : '';
    return [`HTTP ${value.statusCode ?? 'unknown'}`, value.message, body].filter(Boolean).join(': ');
  }
  return String(reason);
}

async function logDelivery(
  reminder: Record<string, unknown>, channel: Channel, status: DeliveryStatus,
  payload: Record<string, unknown>, errorMessage?: string, providerMessageId?: string,
) {
  await supabase.from('notification_delivery_logs').upsert({
    reminder_id: reminder.id,
    gym_id: reminder.gym_id,
    channel,
    status,
    attempt_count: status === 'skipped' ? 0 : 1,
    provider_message_id: providerMessageId ?? null,
    error_message: errorMessage ?? null,
    payload,
    attempted_at: new Date().toISOString(),
    delivered_at: status === 'sent' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'reminder_id,channel' });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  const result: DispatchResult = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  try {
    const body = await request.json().catch(() => ({})) as {
      reminder_ids?: string[];
      gym_id?: string;
      reminder_type?: 'one_day_before_expiry' | 'on_expiry_date';
      all_clear_gym_ids?: string[];
    };
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    let query = supabase.from('reminders')
      .select('*, member:members(*), gym:gyms(*)')
      .eq('scheduled_date', today);
    if (body.reminder_ids?.length) query = query.in('id', body.reminder_ids);
    if (body.gym_id) query = query.eq('gym_id', body.gym_id);
    if (body.reminder_type) query = query.eq('reminder_type', body.reminder_type);
    const { data: reminders, error } = await query;
    if (error) throw new Error(error.message);

    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
    if (vapidPublic && vapidPrivate) webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    for (const reminder of reminders ?? []) {
      result.processed++;
      const { data: preference } = await supabase.from('notification_preferences')
        .select('*').eq('gym_id', reminder.gym_id).maybeSingle();
      const preferences = preference ?? { in_app_enabled: true, browser_push_enabled: false };
      const title = reminder.reminder_type === 'one_day_before_expiry'
        ? `${reminder.member?.name ?? 'Member'} expires tomorrow`
        : `${reminder.member?.name ?? 'Member'} expires today`;
      const payload = { title, body: reminder.message ?? title, tag: `reminder-${reminder.id}`, url: '/reminders' };

      if (preferences.in_app_enabled) {
        await logDelivery(reminder, 'in_app', 'sent', payload);
        result.sent++;
      } else {
        await logDelivery(reminder, 'in_app', 'skipped', payload, 'Disabled by gym owner');
        result.skipped++;
      }

      if (preferences.browser_push_enabled) {
        const { data: subscriptions } = await supabase.from('push_subscriptions').select('*').eq('gym_id', reminder.gym_id);
        if (!vapidPublic || !vapidPrivate) {
          await logDelivery(reminder, 'browser_push', 'failed', payload, 'VAPID secrets are not configured');
          result.failed++;
        } else if (!subscriptions?.length) {
          await logDelivery(reminder, 'browser_push', 'failed', payload, 'No browser subscription is registered');
          result.failed++;
        } else {
          const sends = await Promise.allSettled(subscriptions.map(subscription => webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, JSON.stringify(payload), {
            // Retain notifications while a phone is offline and deliver on reconnect.
            TTL: 60 * 60 * 24 * 7,
            urgency: 'high',
          })));
          const failures = sends.filter(item => item.status === 'rejected');
          if (failures.length === sends.length) {
            const reasons = [...new Set(failures.map(item => describePushError(item.reason)))];
            await logDelivery(reminder, 'browser_push', 'failed', payload, reasons.join(' | '));
            result.failed++;
          } else {
            const partialError = failures.length
              ? `${failures.length} subscription(s) failed: ${describePushError(failures[0].reason)}`
              : undefined;
            await logDelivery(reminder, 'browser_push', 'sent', payload, partialError);
            result.sent++;
          }
        }
      } else {
        await logDelivery(reminder, 'browser_push', 'skipped', payload, 'Disabled by gym owner');
        result.skipped++;
      }

    }

    // Daily all-clear messages are stored separately because they do not belong
    // to a member or membership. push_status prevents duplicate delivery.
    if (body.all_clear_gym_ids?.length) {
      const { data: allClearRows } = await supabase.from('owner_daily_notifications')
        .select('*').in('gym_id', body.all_clear_gym_ids).eq('notification_date', today)
        .eq('notification_type', 'no_clients_due').neq('push_status', 'sent');

      for (const notification of allClearRows ?? []) {
        result.processed++;
        const payload = {
          title: notification.title,
          body: notification.message,
          tag: `daily-all-clear-${notification.gym_id}-${today}`,
          url: '/reminders',
        };
        const { data: preference } = await supabase.from('notification_preferences')
          .select('browser_push_enabled').eq('gym_id', notification.gym_id).maybeSingle();
        if (preference && !preference.browser_push_enabled) {
          await supabase.from('owner_daily_notifications').update({
            push_status: 'skipped', error_message: 'Browser push disabled by gym owner', updated_at: new Date().toISOString(),
          }).eq('id', notification.id);
          result.skipped++;
          continue;
        }
        const { data: subscriptions } = await supabase.from('push_subscriptions').select('*').eq('gym_id', notification.gym_id);
        if (!vapidPublic || !vapidPrivate || !subscriptions?.length) {
          const errorMessage = !vapidPublic || !vapidPrivate ? 'VAPID secrets are not configured' : 'No browser subscription is registered';
          await supabase.from('owner_daily_notifications').update({
            push_status: 'failed', error_message: errorMessage, updated_at: new Date().toISOString(),
          }).eq('id', notification.id);
          result.failed++;
          continue;
        }
        const sends = await Promise.allSettled(subscriptions.map(subscription => webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify(payload), {
          TTL: 60 * 60 * 24 * 7,
          urgency: 'high',
        })));
        const failures = sends.filter(item => item.status === 'rejected');
        if (failures.length === sends.length) {
          const errorMessage = [...new Set(failures.map(item => describePushError(item.reason)))].join(' | ');
          await supabase.from('owner_daily_notifications').update({
            push_status: 'failed', error_message: errorMessage, updated_at: new Date().toISOString(),
          }).eq('id', notification.id);
          result.failed++;
        } else {
          await supabase.from('owner_daily_notifications').update({
            push_status: 'sent', push_sent_at: new Date().toISOString(), error_message: failures.length ? `${failures.length} subscription(s) failed` : null,
            updated_at: new Date().toISOString(),
          }).eq('id', notification.id);
          result.sent++;
        }
      }
    }

    return Response.json({ success: true, ...result }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message, ...result }, { status: 500, headers: corsHeaders });
  }
});
