/*
# Reliable account profile creation

Create the public profile in the same database transaction as the Auth user.
This also works when email confirmation is enabled and signup has no session.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'display_name'), '')
  )
  ON CONFLICT (id) DO UPDATE
  SET display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
