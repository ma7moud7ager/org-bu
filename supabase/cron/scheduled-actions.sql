-- Applied on the hosted project only (pg_cron is not available in the local test database).
-- Runs scheduled terminations/transfers daily at 00:05 Riyadh (21:05 UTC).
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('org-bu-scheduled-actions', '5 21 * * *', 'select public.run_scheduled_actions()');
