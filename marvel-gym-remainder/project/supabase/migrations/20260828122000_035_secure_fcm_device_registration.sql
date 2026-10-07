-- A browser's FCM token remains the same when a user logs out and another gym
-- owner logs in on that device. A SECURITY DEFINER RPC safely reassigns only
-- the token presented by the authenticated caller after verifying gym ownership.
CREATE OR REPLACE FUNCTION public.register_notification_device(
  p_gym_id uuid,
  p_fcm_token text,
  p_platform text DEFAULT 'web',
  p_device_name text DEFAULT NULL
)
RETURNS public.notification_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_device public.notification_devices;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_fcm_token IS NULL OR length(trim(p_fcm_token)) < 20 THEN RAISE EXCEPTION 'Invalid FCM token'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.gyms g
    WHERE g.id = p_gym_id AND g.owner_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You do not own this gym';
  END IF;

  INSERT INTO public.notification_devices (
    user_id, gym_id, fcm_token, platform, device_name,
    enabled, last_seen_at, updated_at
  ) VALUES (
    v_user_id, p_gym_id, trim(p_fcm_token), COALESCE(NULLIF(p_platform, ''), 'web'),
    left(p_device_name, 250), true, now(), now()
  )
  ON CONFLICT (fcm_token) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    gym_id = EXCLUDED.gym_id,
    platform = EXCLUDED.platform,
    device_name = EXCLUDED.device_name,
    enabled = true,
    last_seen_at = now(),
    updated_at = now()
  RETURNING * INTO v_device;

  RETURN v_device;
END;
$$;

REVOKE ALL ON FUNCTION public.register_notification_device(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_notification_device(uuid,text,text,text) TO authenticated;

