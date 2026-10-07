-- Use Supabase Cron instead of Google Cloud Scheduler. The queue itself stores
-- 09:00 Asia/Kolkata as UTC; this job only claims rows that are already due.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE OR REPLACE FUNCTION public.invoke_due_fcm_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_scheduler_secret text;
BEGIN
  SELECT decrypted_secret INTO v_scheduler_secret
  FROM vault.decrypted_secrets
  WHERE name = 'mfc_fcm_scheduler_secret'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_scheduler_secret IS NULL THEN
    RAISE WARNING 'FCM scheduler secret is not configured in Vault';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://fegxmniuiymjhnwquube.supabase.co/functions/v1/send-due-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scheduler-secret', v_scheduler_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_due_fcm_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_due_fcm_notifications() TO service_role;

-- Run once from the Supabase SQL editor with the same SCHEDULER_SECRET value
-- saved under Edge Function secrets. The secret is encrypted by Vault and is
-- never embedded in cron.job.command.
CREATE OR REPLACE FUNCTION public.install_fcm_notification_cron(p_scheduler_secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_job_id bigint;
  v_legacy_job_id bigint;
BEGIN
  IF p_scheduler_secret IS NULL OR length(p_scheduler_secret) < 32 THEN
    RAISE EXCEPTION 'Scheduler secret must be at least 32 characters';
  END IF;

  SELECT id INTO v_secret_id FROM vault.secrets
  WHERE name = 'mfc_fcm_scheduler_secret'
  ORDER BY created_at DESC LIMIT 1;

  IF v_secret_id IS NULL THEN
    PERFORM vault.create_secret(p_scheduler_secret, 'mfc_fcm_scheduler_secret', 'Calls the FCM due-notification Edge Function');
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_scheduler_secret, 'mfc_fcm_scheduler_secret', 'Calls the FCM due-notification Edge Function');
  END IF;

  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'fcm-due-notifications-every-minute';
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;

  PERFORM cron.schedule(
    'fcm-due-notifications-every-minute',
    '* * * * *',
    'SELECT public.invoke_due_fcm_notifications();'
  );

  -- Disable the previous once-daily dispatcher only after the replacement job
  -- has been created, preventing both a delivery gap and duplicate pushes.
  SELECT jobid INTO v_legacy_job_id FROM cron.job WHERE jobname = 'daily-reminders-job';
  IF v_legacy_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_legacy_job_id); END IF;

  RETURN 'FCM scheduler installed: every minute (UTC queue, 09:00 Asia/Kolkata reminders)';
END;
$$;

REVOKE ALL ON FUNCTION public.install_fcm_notification_cron(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.install_fcm_notification_cron(text) TO service_role;
