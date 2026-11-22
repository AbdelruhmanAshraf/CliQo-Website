-- A short public engraving ID identifies the item without exposing its claim secret.
create unique index if not exists smart_items_engraving_id_idx on public.smart_items
  ((upper(substr(replace(public_id::text, '-', ''), 1, 12))));
