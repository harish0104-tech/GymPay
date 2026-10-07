/* Run daily reminders at exactly 9:00 AM Asia/Kolkata (03:30 UTC). */

SELECT cron.unschedule('daily-reminders-job');

SELECT cron.schedule(
  'daily-reminders-job',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fegxmniuiymjhnwquube.supabase.co/functions/v1/daily-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImZlZ3htbml1aXltamhud3F1dWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjY4OTQsImV4cCI6MjEwMjcwMjg5NH0.liVUdOefkDdTN3Yx8ak80SoPvce00LqwHs_AIrA1PgQ"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
