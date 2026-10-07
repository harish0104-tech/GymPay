/* Read-only deployment diagnostics for the 9:50 PM notification run. */

DO $$
DECLARE
  v_job_schedule text;
  v_job_active boolean;
  v_run_status text;
  v_run_message text;
  v_run_started timestamptz;
  v_due_memberships integer;
  v_today_reminders integer;
  v_push_gyms integer;
  v_subscriptions integer;
  v_push_sent integer;
  v_push_failed integer;
BEGIN
  SELECT schedule, active INTO v_job_schedule, v_job_active
  FROM cron.job WHERE jobname = 'daily-reminders-job';

  SELECT status, return_message, start_time
  INTO v_run_status, v_run_message, v_run_started
  FROM cron.job_run_details
  WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-reminders-job')
  ORDER BY start_time DESC
  LIMIT 1;

  SELECT count(*) INTO v_due_memberships
  FROM public.memberships m
  JOIN public.members member ON member.id = m.member_id
  WHERE m.expiry_date IN (CURRENT_DATE, CURRENT_DATE + 1)
    AND m.status IN ('active', 'expiring_soon', 'expired')
    AND member.is_active = true;

  SELECT count(*) INTO v_today_reminders FROM public.reminders WHERE scheduled_date = CURRENT_DATE;
  SELECT count(*) INTO v_push_gyms FROM public.notification_preferences WHERE browser_push_enabled = true;
  SELECT count(*) INTO v_subscriptions FROM public.push_subscriptions;
  SELECT count(*) INTO v_push_sent FROM public.notification_delivery_logs WHERE channel = 'browser_push' AND status = 'sent' AND attempted_at::date = CURRENT_DATE;
  SELECT count(*) INTO v_push_failed FROM public.notification_delivery_logs WHERE channel = 'browser_push' AND status = 'failed' AND attempted_at::date = CURRENT_DATE;

  RAISE NOTICE 'notification_diagnostic schedule=% active=% latest_status=% latest_start=% latest_message=% due_memberships=% today_reminders=% push_enabled_gyms=% subscriptions=% push_sent=% push_failed=%',
    v_job_schedule, v_job_active, v_run_status, v_run_started, v_run_message,
    v_due_memberships, v_today_reminders, v_push_gyms, v_subscriptions, v_push_sent, v_push_failed;
END;
$$;
