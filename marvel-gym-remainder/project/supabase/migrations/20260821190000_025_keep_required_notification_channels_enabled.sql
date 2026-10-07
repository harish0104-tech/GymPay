/* In-app and browser-push delivery are required channels for every gym. */

ALTER TABLE public.notification_preferences
  ALTER COLUMN in_app_enabled SET DEFAULT true,
  ALTER COLUMN browser_push_enabled SET DEFAULT true;

INSERT INTO public.notification_preferences (gym_id, in_app_enabled, browser_push_enabled)
SELECT id, true, true FROM public.gyms
ON CONFLICT (gym_id) DO UPDATE SET
  in_app_enabled = true,
  browser_push_enabled = true,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.keep_required_notification_channels_enabled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.in_app_enabled := true;
  NEW.browser_push_enabled := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_required_notification_channels_enabled
  ON public.notification_preferences;

CREATE TRIGGER keep_required_notification_channels_enabled
BEFORE INSERT OR UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.keep_required_notification_channels_enabled();
