-- =====================================================================
-- BRIXA — migration 007: check for unfinished tasks every 15 minutes.
--
-- First enable Cron in Supabase: Integrations → Cron → Enable.
-- Then run this once in SQL Editor.
-- (To stop it later:  select cron.unschedule('brixa-overdue-tasks');)
-- =====================================================================

select cron.schedule(
  'brixa-overdue-tasks',
  '*/15 * * * *',
  'select public.notify_overdue_tasks()'
);
