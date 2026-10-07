/*
# Restore core authenticated API privileges

RLS decides which rows each signed-in owner may access. PostgREST also needs
table-level privileges before it can evaluate those RLS policies. Re-applying
these grants is idempotent and repairs 401/permission-denied responses when a
database restore or manual privilege change has removed them.
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
  public.whatsapp_config,
  public.notification_preferences,
  public.push_subscriptions,
  public.notification_devices
TO authenticated;

GRANT SELECT ON TABLE
  public.notification_delivery_logs,
  public.scheduled_notifications,
  public.scheduled_notification_deliveries,
  public.owner_daily_notifications
TO authenticated;

GRANT SELECT, UPDATE ON TABLE public.in_app_notifications TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_gym(text) TO authenticated;

