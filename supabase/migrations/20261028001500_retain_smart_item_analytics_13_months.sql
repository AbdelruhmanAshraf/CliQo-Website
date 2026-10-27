-- Keep raw open/click events for thirteen months. The dashboard reports
-- available history, not a permanent lifetime total.
create index smart_item_events_created_at_idx
  on public.smart_item_events(created_at);

create extension if not exists pg_cron;

select cron.schedule(
  'cliqo-prune-smart-item-events',
  '17 3 * * *',
  $$delete from public.smart_item_events
    where created_at < now() - interval '13 months'$$
);
