-- Guarantee that the server-side producer/dispatcher is active independently
-- of any browser session or manual Send Now action.
DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid FROM cron.job WHERE jobname = 'fcm-due-notifications-every-minute'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'fcm-due-notifications-every-minute',
    '* * * * *',
    'SELECT public.invoke_due_fcm_notifications();'
  );
END;
$$;
