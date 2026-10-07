/* Run daily reminders at exactly 9:00 AM Asia/Kolkata (03:30 UTC). */

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'daily-reminders-job';

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'daily-reminders-job does not exist';
  END IF;

  PERFORM cron.alter_job(v_job_id, schedule := '30 3 * * *');
END;
$$;
