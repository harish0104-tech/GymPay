/* Run once daily at 09:00 Asia/Kolkata (03:30 UTC) and store owner all-clear messages. */
CREATE TABLE IF NOT EXISTS public.owner_daily_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  notification_date date NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('no_clients_due')),
  title text NOT NULL,
  message text NOT NULL,
  push_status text NOT NULL DEFAULT 'pending' CHECK (push_status IN ('pending','sent','failed','skipped')),
  push_sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(gym_id, notification_date, notification_type)
);
ALTER TABLE public.owner_daily_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners_read_daily_notifications" ON public.owner_daily_notifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gyms g WHERE g.id=gym_id AND g.owner_user_id=auth.uid()));
GRANT SELECT ON public.owner_daily_notifications TO authenticated;
GRANT ALL ON public.owner_daily_notifications TO service_role;
CREATE INDEX IF NOT EXISTS owner_daily_notifications_gym_date_idx ON public.owner_daily_notifications(gym_id, notification_date DESC);

DO $$ DECLARE v_command text; v_job record; BEGIN
  SELECT command INTO v_command FROM cron.job WHERE jobname='daily-reminders-job' ORDER BY jobid DESC LIMIT 1;
  IF v_command IS NULL THEN RAISE EXCEPTION 'daily-reminders-job command was not found'; END IF;
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname='daily-reminders-job' LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
  PERFORM cron.schedule('daily-reminders-job','30 3 * * *',v_command);
END $$;
