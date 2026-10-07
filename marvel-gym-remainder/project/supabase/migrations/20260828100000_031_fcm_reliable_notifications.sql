-- Reliable FCM queue. All scheduled_at values are UTC timestamptz; 09:00 is
-- calculated in Asia/Kolkata before PostgreSQL converts it to UTC.
CREATE TABLE IF NOT EXISTS public.notification_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  fcm_token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web', device_name text,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scheduled_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES public.memberships(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('one_day_before_expiry','on_expiry_date','test')),
  title text NOT NULL, message text NOT NULL, click_url text NOT NULL DEFAULT '/reminders',
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0), next_attempt_at timestamptz,
  processing_started_at timestamptz, sent_at timestamptz, failed_at timestamptz,
  error_message text, idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  scheduled_notification_id uuid UNIQUE REFERENCES public.scheduled_notifications(id) ON DELETE SET NULL,
  title text NOT NULL, message text NOT NULL, click_url text NOT NULL DEFAULT '/reminders',
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scheduled_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_notification_id uuid NOT NULL REFERENCES public.scheduled_notifications(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.notification_devices(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('sent','failed','invalid')),
  provider_message_id text, error_message text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scheduled_notification_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_due ON public.scheduled_notifications(status, next_attempt_at, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notification_devices_owner ON public.notification_devices(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_owner ON public.in_app_notifications(user_id, read_at, created_at DESC);

ALTER TABLE public.notification_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage own fcm devices" ON public.notification_devices FOR ALL TO authenticated
  USING (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.gyms g WHERE g.id=gym_id AND g.owner_user_id=auth.uid()))
  WITH CHECK (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.gyms g WHERE g.id=gym_id AND g.owner_user_id=auth.uid()));
CREATE POLICY "owners view own scheduled notifications" ON public.scheduled_notifications FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "owners view own in app notifications" ON public.in_app_notifications FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "owners update own in app notifications" ON public.in_app_notifications FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "owners view own delivery logs" ON public.scheduled_notification_deliveries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scheduled_notifications n WHERE n.id=scheduled_notification_id AND n.user_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.sync_membership_fcm_notifications() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid; v_name text; v_expiry date; v_gym uuid; v_member uuid; v_membership uuid;
BEGIN
  v_expiry := COALESCE(NEW.expiry_date, OLD.expiry_date); v_gym := COALESCE(NEW.gym_id, OLD.gym_id);
  v_member := COALESCE(NEW.member_id, OLD.member_id); v_membership := COALESCE(NEW.id, OLD.id);
  SELECT owner_user_id INTO v_user FROM public.gyms WHERE id=v_gym;
  SELECT name INTO v_name FROM public.members WHERE id=v_member;
  UPDATE public.scheduled_notifications SET status='cancelled', updated_at=now()
   WHERE membership_id=v_membership AND status IN ('pending','failed','processing');
  IF TG_OP <> 'DELETE' AND NEW.status='active' AND v_user IS NOT NULL THEN
    INSERT INTO public.scheduled_notifications(user_id,gym_id,member_id,membership_id,notification_type,title,message,scheduled_at,idempotency_key)
    VALUES
      (v_user,v_gym,v_member,v_membership,'one_day_before_expiry','Membership expires tomorrow',v_name||'''s membership expires tomorrow.',((NEW.expiry_date-1)::timestamp + time '09:00') AT TIME ZONE 'Asia/Kolkata',NEW.id||':before:'||NEW.expiry_date),
      (v_user,v_gym,v_member,v_membership,'on_expiry_date','Membership expires today',v_name||'''s membership expires today.',(NEW.expiry_date::timestamp + time '09:00') AT TIME ZONE 'Asia/Kolkata',NEW.id||':expiry:'||NEW.expiry_date)
    ON CONFLICT(idempotency_key) DO UPDATE SET status='pending',scheduled_at=EXCLUDED.scheduled_at,title=EXCLUDED.title,message=EXCLUDED.message,attempts=0,next_attempt_at=NULL,error_message=NULL,updated_at=now();
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS sync_membership_fcm_notifications_trigger ON public.memberships;
CREATE TRIGGER sync_membership_fcm_notifications_trigger AFTER INSERT OR UPDATE OF expiry_date,status OR DELETE ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.sync_membership_fcm_notifications();

CREATE OR REPLACE FUNCTION public.claim_due_fcm_notifications(p_limit integer DEFAULT 100)
RETURNS SETOF public.scheduled_notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.scheduled_notifications SET status='failed',processing_started_at=NULL,next_attempt_at=now(),error_message='Recovered stale processing claim',updated_at=now()
   WHERE status='processing' AND processing_started_at < now()-interval '10 minutes';
  RETURN QUERY WITH due AS (
    SELECT id FROM public.scheduled_notifications
    WHERE ((status='pending' AND scheduled_at<=now()) OR (status='failed' AND attempts<3 AND COALESCE(next_attempt_at,scheduled_at)<=now()))
    ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT LEAST(p_limit,500)
  ) UPDATE public.scheduled_notifications n SET status='processing',attempts=n.attempts+1,processing_started_at=now(),updated_at=now()
    FROM due WHERE n.id=due.id RETURNING n.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_due_fcm_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_fcm_notifications(integer) TO service_role;

-- Queue existing active memberships idempotently.
INSERT INTO public.scheduled_notifications(user_id,gym_id,member_id,membership_id,notification_type,title,message,scheduled_at,idempotency_key)
SELECT g.owner_user_id,m.gym_id,m.member_id,m.id,x.kind,x.title,member.name||x.suffix,
       ((m.expiry_date+x.day_offset)::timestamp+time '09:00') AT TIME ZONE 'Asia/Kolkata',
       m.id||x.key_suffix||m.expiry_date
FROM public.memberships m JOIN public.members member ON member.id=m.member_id JOIN public.gyms g ON g.id=m.gym_id
CROSS JOIN (VALUES ('one_day_before_expiry','Membership expires tomorrow','''s membership expires tomorrow.',-1,':before:'),('on_expiry_date','Membership expires today','''s membership expires today.',0,':expiry:')) x(kind,title,suffix,day_offset,key_suffix)
WHERE m.status='active' AND g.owner_user_id IS NOT NULL
ON CONFLICT(idempotency_key) DO NOTHING;
