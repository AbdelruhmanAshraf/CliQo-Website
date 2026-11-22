-- Stable batch identity makes retries safe and exports exactly the requested units.
alter table public.smart_items add column if not exists production_batch_id uuid;
create index if not exists smart_items_production_batch_idx
  on public.smart_items(production_batch_id) where production_batch_id is not null;
notify pgrst, 'reload schema';
