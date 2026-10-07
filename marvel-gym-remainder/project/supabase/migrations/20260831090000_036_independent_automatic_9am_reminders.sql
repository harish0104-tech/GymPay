-- Make 09:00 Asia/Kolkata reminders fully server-driven. The minute cron calls
-- this producer before dispatching, so no browser, PWA, or user click is needed.

ALTER TABLE public.scheduled_notifications
  DROP CONSTRAINT IF EXISTS scheduled_notifications_notification_type_check;
ALTER TABLE public.scheduled_notifications
  ADD CONSTRAINT scheduled_notifications_notification_type_check
  -- Keep the historical type valid for already-delivered audit rows; the
  -- producer and trigger below no longer create new one-day-before jobs.
  CHECK (notification_type IN ('one_day_before_expiry', 'on_expiry_date', 'no_clients_due', 'test'));

-- The owner requested expiry-day reminders only. Retire previously queued
-- one-day-before jobs without affecting delivery history.
UPDATE public.scheduled_notifications
SET status = 'cancelled', updated_at = now()
WHERE notification_type = 'one_day_before_expiry'
  AND status IN ('pending', 'failed', 'processing');

CREATE OR REPLACE FUNCTION public.sync_membership_fcm_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_name text;
  v_gym uuid;
  v_member uuid;
  v_membership uuid;
BEGIN
  v_gym := COALESCE(NEW.gym_id, OLD.gym_id);
  v_member := COALESCE(NEW.member_id, OLD.member_id);
  v_membership := COALESCE(NEW.id, OLD.id);

  SELECT owner_user_id INTO v_user FROM public.gyms WHERE id = v_gym;
  SELECT name INTO v_name FROM public.members WHERE id = v_member;

  UPDATE public.scheduled_notifications
  SET status = 'cancelled', updated_at = now()
  WHERE membership_id = v_membership
    AND status IN ('pending', 'failed', 'processing');

  IF TG_OP <> 'DELETE'
     AND NEW.status IN ('active', 'expiring_soon')
     AND NEW.expiry_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
     AND v_user IS NOT NULL THEN
    INSERT INTO public.scheduled_notifications (
      user_id, gym_id, member_id, membership_id, notification_type,
      title, message, scheduled_at, idempotency_key
    ) VALUES (
      v_user, v_gym, v_member, v_membership, 'on_expiry_date',
      'Membership expires today', v_name || '''s membership expires today.',
      (NEW.expiry_date::timestamp + time '09:00') AT TIME ZONE 'Asia/Kolkata',
      NEW.id || ':expiry:' || NEW.expiry_date
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      status = CASE WHEN public.scheduled_notifications.status = 'sent' THEN 'sent' ELSE 'pending' END,
      scheduled_at = EXCLUDED.scheduled_at,
      title = EXCLUDED.title,
      message = EXCLUDED.message,
      attempts = CASE WHEN public.scheduled_notifications.status = 'sent' THEN public.scheduled_notifications.attempts ELSE 0 END,
      next_attempt_at = NULL,
      error_message = NULL,
      updated_at = now();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_automatic_9am_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_scheduled_at timestamptz :=
    (v_today::timestamp + time '09:00') AT TIME ZONE 'Asia/Kolkata';
BEGIN
  -- Reconcile today's due memberships on every server-side scheduler pass.
  -- This repairs missing queue rows even when an earlier trigger was missed.
  INSERT INTO public.scheduled_notifications (
    user_id, gym_id, member_id, membership_id, notification_type,
    title, message, scheduled_at, idempotency_key
  )
  SELECT
    g.owner_user_id,
    m.gym_id,
    m.member_id,
    m.id,
    'on_expiry_date',
    'Membership expires today',
    member.name || '''s ' || COALESCE(plan.name, 'membership') || ' membership expires today.',
    v_scheduled_at,
    m.id || ':expiry:' || v_today
  FROM public.memberships m
  JOIN public.members member ON member.id = m.member_id AND member.is_active = true
  JOIN public.gyms g ON g.id = m.gym_id AND g.owner_user_id IS NOT NULL
  LEFT JOIN public.plans plan ON plan.id = m.plan_id
  LEFT JOIN public.notification_settings settings ON settings.gym_id = m.gym_id
  WHERE m.expiry_date = v_today
    AND COALESCE(settings.expiry_day_enabled, true) = true
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- Generate one owner status notification when the gym has nobody due today.
  INSERT INTO public.scheduled_notifications (
    user_id, gym_id, notification_type, title, message,
    scheduled_at, idempotency_key
  )
  SELECT
    g.owner_user_id,
    g.id,
    'no_clients_due',
    'No clients due today',
    'There are no clients with a membership plan due today.',
    v_scheduled_at,
    g.id || ':all-clear:' || v_today
  FROM public.gyms g
  WHERE g.owner_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.memberships m
      JOIN public.members member ON member.id = m.member_id
      WHERE m.gym_id = g.id
        AND member.is_active = true
        AND m.expiry_date = v_today
    )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_automatic_9am_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_automatic_9am_notifications() TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_due_fcm_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_scheduler_secret text;
BEGIN
  -- Produce/reconcile the automatic daily work entirely inside Supabase.
  PERFORM public.ensure_automatic_9am_notifications();

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

-- Seed today's queue now. Rows remain pending until their 09:00 IST timestamp.
SELECT public.ensure_automatic_9am_notifications();
