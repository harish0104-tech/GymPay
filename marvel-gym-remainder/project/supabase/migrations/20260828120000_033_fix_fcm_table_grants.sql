-- RLS policies restrict rows, while table grants permit the authenticated API
-- role to attempt the operation. Both layers are required by PostgREST.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_devices TO authenticated;
GRANT SELECT ON TABLE public.scheduled_notifications TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.in_app_notifications TO authenticated;
GRANT SELECT ON TABLE public.scheduled_notification_deliveries TO authenticated;

-- Explicitly keep browser roles away from server-owned queue mutations.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.scheduled_notifications FROM authenticated, anon;
REVOKE INSERT, DELETE ON TABLE public.in_app_notifications FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.scheduled_notification_deliveries FROM authenticated, anon;
