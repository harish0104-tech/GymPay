/*
# Enable pg_cron and pg_net for scheduled daily reminders

1. Enables pg_cron extension for scheduling jobs in PostgreSQL
2. Enables pg_net extension for making HTTP requests from PostgreSQL
3. Creates a scheduled job that calls the daily-reminders edge function every day at 9:00 AM IST (3:30 AM UTC)
4. The edge function handles expiry checks, reminder creation, and WhatsApp delivery

## Notes
- pg_cron runs in the GMT timezone by default, so 9:00 AM IST = 03:30 UTC
- The job calls the edge function via HTTP using pg_net
- The edge function URL is constructed from the SUPABASE_URL env var
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT USAGE ON SCHEMA net TO postgres;

-- Create the scheduled job to run daily at 9:00 AM IST (03:30 UTC)
-- pg_cron uses GMT, so 03:30 GMT = 09:00 IST
SELECT cron.schedule(
  'daily-reminders-job',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pcfxrqvxtcilojwrpsal.supabase.co/functions/v1/daily-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjZnhycXZ4dGNpbG9qd3Jwc2FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNDA0NjAwMH0.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwic3ViIjoiYWNjZXNzX3Rva2VuIn0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
