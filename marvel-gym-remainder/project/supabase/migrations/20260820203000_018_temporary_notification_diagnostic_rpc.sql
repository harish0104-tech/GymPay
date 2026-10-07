CREATE OR REPLACE FUNCTION public.get_notification_diagnostics()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT jsonb_build_object(
    'schedule', (SELECT schedule FROM cron.job WHERE jobname = 'daily-reminders-job'),
    'active', (SELECT active FROM cron.job WHERE jobname = 'daily-reminders-job'),
    'latest_run', (
      SELECT jsonb_build_object('status', status, 'message', return_message, 'started', start_time, 'ended', end_time)
      FROM cron.job_run_details
      WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-reminders-job')
      ORDER BY start_time DESC LIMIT 1
    ),
    'due_memberships', (
      SELECT count(*) FROM public.memberships m JOIN public.members member ON member.id = m.member_id
      WHERE m.expiry_date IN (CURRENT_DATE, CURRENT_DATE + 1)
        AND m.status IN ('active', 'expiring_soon', 'expired') AND member.is_active = true
    ),
    'today_reminders', (SELECT count(*) FROM public.reminders WHERE scheduled_date = CURRENT_DATE),
    'push_enabled_gyms', (SELECT count(*) FROM public.notification_preferences WHERE browser_push_enabled = true),
    'subscriptions', (SELECT count(*) FROM public.push_subscriptions),
    'push_sent_today', (SELECT count(*) FROM public.notification_delivery_logs WHERE channel = 'browser_push' AND status = 'sent' AND attempted_at::date = CURRENT_DATE),
    'push_failed_today', (SELECT count(*) FROM public.notification_delivery_logs WHERE channel = 'browser_push' AND status = 'failed' AND attempted_at::date = CURRENT_DATE)
  );
$$;

REVOKE ALL ON FUNCTION public.get_notification_diagnostics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_notification_diagnostics() TO anon;
