-- Supabase's logical dump excludes pg_cron jobs. Recreate CliQo's job after restore.
-- pg_cron identifies a named job by (jobname, username); scheduling the same name
-- again updates it instead of creating a duplicate.
select cron.schedule(
  'cliqo-prune-smart-item-events',
  '17 3 * * *',
  $$delete from public.smart_item_events
    where created_at < now() - interval '13 months'$$
);
