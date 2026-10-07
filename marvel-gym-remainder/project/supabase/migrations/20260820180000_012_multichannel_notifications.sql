/* Additive notification infrastructure; existing reminder/WhatsApp tables stay unchanged. */

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL UNIQUE REFERENCES public.gyms(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  browser_push_enabled boolean NOT NULL DEFAULT false,
  email_enabled boolean NOT NULL DEFAULT false,
  email_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id uuid NOT NULL REFERENCES public.reminders(id) ON DELETE CASCADE,
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('in_app', 'browser_push', 'email')),
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0,
  provider_message_id text,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reminder_id, channel)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_manage_notification_preferences" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gyms g WHERE g.id = gym_id AND g.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.gyms g WHERE g.id = gym_id AND g.owner_user_id = auth.uid()));

CREATE POLICY "owners_manage_push_subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.gyms g WHERE g.id = gym_id AND g.owner_user_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.gyms g WHERE g.id = gym_id AND g.owner_user_id = auth.uid()));

CREATE POLICY "owners_read_delivery_logs" ON public.notification_delivery_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gyms g WHERE g.id = gym_id AND g.owner_user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences, public.push_subscriptions TO authenticated;
GRANT SELECT ON public.notification_delivery_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences, public.push_subscriptions, public.notification_delivery_logs TO service_role;

INSERT INTO public.notification_preferences (gym_id)
SELECT id FROM public.gyms
ON CONFLICT (gym_id) DO NOTHING;

