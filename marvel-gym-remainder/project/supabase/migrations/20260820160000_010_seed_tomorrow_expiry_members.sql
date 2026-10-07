/*
# Seed ten tomorrow-expiry test members

Adds an idempotent, clearly labelled test set to the app's first gym. The daily
reminder function will create one-day-before reminders for these memberships.
*/

DO $$
DECLARE
  v_gym_id uuid;
  v_plan_id uuid;
  v_member_id uuid;
  v_index integer;
  v_name text;
BEGIN
  SELECT id INTO v_gym_id
  FROM public.gyms
  ORDER BY created_at, id
  LIMIT 1;

  IF v_gym_id IS NULL THEN
    RAISE EXCEPTION 'No gym exists; create an account and gym before loading test members';
  END IF;

  SELECT id INTO v_plan_id
  FROM public.plans
  WHERE gym_id = v_gym_id AND is_active = true
  ORDER BY created_at, id
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.plans (
      gym_id, name, membership_type, price, duration_value, duration_unit, is_active
    ) VALUES (
      v_gym_id, 'Monthly Gym', 'gym', 1200, 1, 'months', true
    ) RETURNING id INTO v_plan_id;
  END IF;

  FOR v_index IN 1..10 LOOP
    v_name := 'Tomorrow Expiry Test ' || lpad(v_index::text, 2, '0');

    SELECT id INTO v_member_id
    FROM public.members
    WHERE gym_id = v_gym_id AND name = v_name
    ORDER BY created_at, id
    LIMIT 1;

    IF v_member_id IS NULL THEN
      INSERT INTO public.members (
        gym_id, name, phone, membership_type, is_active
      ) VALUES (
        v_gym_id,
        v_name,
        '90000000' || lpad(v_index::text, 2, '0'),
        'gym',
        true
      ) RETURNING id INTO v_member_id;
    ELSE
      UPDATE public.members SET is_active = true WHERE id = v_member_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.memberships
      WHERE member_id = v_member_id AND expiry_date = CURRENT_DATE + 1
    ) THEN
      INSERT INTO public.memberships (
        gym_id, member_id, plan_id, start_date, expiry_date, status
      ) VALUES (
        v_gym_id,
        v_member_id,
        v_plan_id,
        CURRENT_DATE - 29,
        CURRENT_DATE + 1,
        'expiring_soon'
      );
    END IF;
  END LOOP;
END;
$$;
