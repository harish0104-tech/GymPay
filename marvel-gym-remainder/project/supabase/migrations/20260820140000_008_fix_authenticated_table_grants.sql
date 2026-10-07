/*
# Restore authenticated API access

RLS policies decide which rows a signed-in user may access, but PostgREST also
requires role-level table privileges. Explicit grants prevent legitimate gym
creation from failing with HTTP 403 before the RLS policy is evaluated.
*/

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.gyms,
  public.plans,
  public.members,
  public.memberships,
  public.payments,
  public.reminders,
  public.notification_settings,
  public.whatsapp_config
TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
