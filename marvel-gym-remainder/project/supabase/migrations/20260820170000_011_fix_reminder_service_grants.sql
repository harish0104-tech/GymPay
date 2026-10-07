/* Allow the reminder Edge Function's service-role client to process records. */

GRANT USAGE ON SCHEMA public TO service_role;

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
TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
