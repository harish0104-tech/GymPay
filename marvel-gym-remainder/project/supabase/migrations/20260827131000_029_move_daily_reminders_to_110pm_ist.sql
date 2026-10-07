/* Run daily reminders at 1:10 PM Asia/Kolkata (07:40 UTC). */
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

  /* Remove every duplicate historical job before installing the new time. */
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname = 'daily-reminders-job'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  /* pg_cron uses UTC: 07:40 UTC equals 13:10 IST. */
  PERFORM cron.schedule('daily-reminders-job', '40 7 * * *', v_command);
END;
$$;
