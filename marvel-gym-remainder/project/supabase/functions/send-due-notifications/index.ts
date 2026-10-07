import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-scheduler-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const b64url = (value: Uint8Array | string) => btoa(typeof value === 'string' ? value : String.fromCharCode(...value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function firebaseAccessToken() {
  const project = Deno.env.get('FIREBASE_PROJECT_ID')!;
  const email = Deno.env.get('FIREBASE_CLIENT_EMAIL')!;
  const pem = Deno.env.get('FIREBASE_PRIVATE_KEY')!.replace(/\\n/g, '\n');
  const keyBytes = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`;
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(signature)}` }) });
  if (!response.ok) throw new Error(`Firebase OAuth failed (${response.status})`);
  return { token: (await response.json()).access_token as string, project };
}

async function sendExpoPush(token: string, job: Record<string, unknown>) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      to: token,
      title: job.title,
      body: job.message,
      sound: 'default',
      priority: 'high',
      channelId: 'membership-reminders',
      data: { path: job.click_url, notification_id: job.id },
    }),
  });
  const payload = await response.json().catch(() => ({})) as { data?: { status?: string; id?: string; message?: string; details?: { error?: string } } };
  const ticket = payload.data;
  const ok = response.ok && ticket?.status === 'ok';
  return {
    ok,
    invalid: ticket?.details?.error === 'DeviceNotRegistered',
    providerMessageId: ticket?.id,
    error: ok ? undefined : `Expo ${response.status}: ${ticket?.message || JSON.stringify(payload).slice(0, 500)}`,
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const suppliedSchedulerSecret = req.headers.get('x-scheduler-secret')?.trim();
  const configuredSchedulerSecret = Deno.env.get('SCHEDULER_SECRET')?.trim();
  const scheduler = Boolean(
    suppliedSchedulerSecret
    && configuredSchedulerSecret
    && suppliedSchedulerSecret === configuredSchedulerSecret,
  );
  let body: { action?: string; delay_minutes?: number } = {};
  try { body = await req.json(); } catch { /* scheduler may send no body */ }

  if (body.action === 'schedule_test') {
    const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null }, error: new Error('Missing authorization token') };
    if (!user) return json({ error: userError?.message || 'Your login session is invalid. Please log in again.' }, 401);
    const { data: gym } = await supabase.from('gyms').select('id').eq('owner_user_id', user.id).single();
    if (!gym) return json({ error: 'Gym not found' }, 404);
    const delay = Math.min(5, Math.max(2, Number(body.delay_minutes) || 3));
    const idempotency = `test:${user.id}:${crypto.randomUUID()}`;
    const { data, error } = await supabase.from('scheduled_notifications').insert({ user_id: user.id, gym_id: gym.id, notification_type: 'test', title: 'Test reminder', message: `Firebase test notification scheduled for delivery in ${delay} minutes.`, click_url: '/reminders', scheduled_at: new Date(Date.now() + delay * 60000).toISOString(), idempotency_key: idempotency }).select('id,scheduled_at').single();
    return error ? json({ error: error.message }, 400) : json(data, 201);
  }
  if (!scheduler) return json({ error: 'Unauthorized' }, 401);

  const summary = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  const { data: jobs, error: claimError } = await supabase.rpc('claim_due_fcm_notifications', { p_limit: 100 });
  if (claimError) return json({ error: claimError.message }, 500);
  if (!jobs?.length) return json(summary);
  let auth: Awaited<ReturnType<typeof firebaseAccessToken>> | null = null;
  for (const job of jobs) {
    summary.processed++;
    const { data: devices } = await supabase.from('notification_devices').select('id,fcm_token,platform').eq('user_id', job.user_id).eq('enabled', true);
    await supabase.from('in_app_notifications').upsert({ user_id: job.user_id, gym_id: job.gym_id, member_id: job.member_id, scheduled_notification_id: job.id, title: job.title, message: job.message, click_url: job.click_url }, { onConflict: 'scheduled_notification_id' });
    if (!devices?.length) {
      await supabase.from('scheduled_notifications').update({ status: 'sent', sent_at: new Date().toISOString(), processing_started_at: null, error_message: 'Saved in-app; no enabled push devices' }).eq('id', job.id);
      summary.skipped++; continue;
    }
    let temporaryFailure = false;
    for (const device of devices) {
      const { data: prior } = await supabase.from('scheduled_notification_deliveries').select('status').eq('scheduled_notification_id', job.id).eq('device_id', device.id).maybeSingle();
      if (prior?.status === 'sent') continue;
      if (device.platform === 'expo-android' || device.platform === 'expo-ios') {
        const result = await sendExpoPush(device.fcm_token, job);
        if (result.ok) {
          await supabase.from('scheduled_notification_deliveries').upsert({ scheduled_notification_id: job.id, device_id: device.id, status: 'sent', provider_message_id: result.providerMessageId }, { onConflict: 'scheduled_notification_id,device_id' });
        } else {
          if (result.invalid) await supabase.from('notification_devices').update({ enabled: false }).eq('id', device.id);
          else temporaryFailure = true;
          await supabase.from('scheduled_notification_deliveries').upsert({ scheduled_notification_id: job.id, device_id: device.id, status: result.invalid ? 'invalid' : 'failed', error_message: result.error }, { onConflict: 'scheduled_notification_id,device_id' });
        }
        continue;
      }
      auth ??= await firebaseAccessToken();
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.project}/messages:send`, { method: 'POST', headers: { authorization: `Bearer ${auth.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ message: { token: device.fcm_token, data: { title: job.title, body: job.message, click_url: job.click_url, notification_id: job.id }, webpush: { headers: { Urgency: 'high', TTL: '86400' }, fcm_options: { link: job.click_url } } } }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok) await supabase.from('scheduled_notification_deliveries').upsert({ scheduled_notification_id: job.id, device_id: device.id, status: 'sent', provider_message_id: result.name }, { onConflict: 'scheduled_notification_id,device_id' });
      else {
        const invalid = response.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(JSON.stringify(result));
        if (invalid) await supabase.from('notification_devices').update({ enabled: false }).eq('id', device.id);
        else temporaryFailure = true;
        await supabase.from('scheduled_notification_deliveries').upsert({ scheduled_notification_id: job.id, device_id: device.id, status: invalid ? 'invalid' : 'failed', error_message: `FCM ${response.status}: ${JSON.stringify(result).slice(0, 500)}` }, { onConflict: 'scheduled_notification_id,device_id' });
      }
    }
    if (temporaryFailure && job.attempts < 3) {
      const retryAt = new Date(Date.now() + 2 ** job.attempts * 60000).toISOString();
      await supabase.from('scheduled_notifications').update({ status: 'failed', failed_at: new Date().toISOString(), next_attempt_at: retryAt, processing_started_at: null, error_message: 'Temporary FCM failure; retry scheduled' }).eq('id', job.id); summary.failed++;
    } else {
      await supabase.from('scheduled_notifications').update({ status: 'sent', sent_at: new Date().toISOString(), processing_started_at: null, error_message: null }).eq('id', job.id); summary.sent++;
    }
  }
  console.log(JSON.stringify({ event: 'fcm_dispatch_complete', ...summary }));
  return json(summary);
});
