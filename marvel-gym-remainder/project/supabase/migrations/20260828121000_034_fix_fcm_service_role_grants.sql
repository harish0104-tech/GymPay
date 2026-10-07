-- Edge Functions use service_role. RLS bypass does not replace PostgreSQL
-- table privileges, so explicitly grant the backend access to its queue.
GRANT ALL PRIVILEGES ON TABLE public.notification_devices TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.scheduled_notifications TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.in_app_notifications TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.scheduled_notification_deliveries TO service_role;

GRANT EXECUTE ON FUNCTION public.claim_due_fcm_notifications(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoke_due_fcm_notifications() TO service_role;
