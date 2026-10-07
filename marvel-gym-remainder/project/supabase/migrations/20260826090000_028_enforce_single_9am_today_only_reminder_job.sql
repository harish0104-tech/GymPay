/* Keep exactly one reminder job at 09:00 IST (03:30 UTC). */
DO $$
DECLARE
  v_command text;
  v_job record;
BEGIN
  SELECT command INTO v_command
  FROM cron.job
  WHERE jobname = 'daily-reminders-job'
  ORDER BY jobid DESC
  LIMIT 1;

  IF v_command IS NULL THEN
    RAISE EXCEPTION 'daily-reminders-job command was not found';
  END IF;

  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname = 'daily-reminders-job'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule('daily-reminders-job', '30 3 * * *', v_command);
END;
$$;
