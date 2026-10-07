/*
# Fix pg_cron daily reminders URL and Key

Updates the daily-reminders-job with the correct project URL and anon key.
*/

-- Remove the old job if it exists
SELECT cron.unschedule('daily-reminders-job');

-- Create the new scheduled job
SELECT cron.schedule(
  'daily-reminders-job',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fegxmniuiymjhnwquube.supabase.co/functions/v1/daily-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZ3htbml1aXltamhud3F1dWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjY4OTQsImV4cCI6MjEwMjcwMjg5NH0.liVUdOefkDdTN3Yx8ak80SoPvce00LqwHs_AIrA1PgQ"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
