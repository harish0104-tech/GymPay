/* New accounts receive the required gym container, then create their own plan in onboarding. */
CREATE OR REPLACE FUNCTION public.ensure_user_gym(p_gym_name text DEFAULT 'My Gym')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_gym_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  SELECT id INTO v_gym_id
  FROM public.gyms
  WHERE owner_user_id = v_user_id
  ORDER BY created_at
  LIMIT 1;

  IF v_gym_id IS NULL THEN
    INSERT INTO public.gyms (name, owner_user_id, owner_name, timezone)
    VALUES (
      COALESCE(NULLIF(btrim(p_gym_name), ''), 'My Gym'),
      v_user_id,
      COALESCE(
        NULLIF(btrim((SELECT raw_user_meta_data ->> 'display_name' FROM auth.users WHERE id = v_user_id)), ''),
        'Gym Owner'
      ),
      'Asia/Kolkata'
    )
    RETURNING id INTO v_gym_id;
  END IF;

  RETURN v_gym_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_gym(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_gym(text) TO authenticated;
