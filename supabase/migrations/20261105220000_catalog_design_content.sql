-- Editable customer-facing details for each existing catalog design.
alter table public.product_families
  add column catalog_design_content jsonb not null default '{}'::jsonb
  check (jsonb_typeof(catalog_design_content) = 'object');
