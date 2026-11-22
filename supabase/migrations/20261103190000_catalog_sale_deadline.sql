-- Optional real sale deadline. NULL keeps the product available under normal gates.
alter table public.product_families
  add column if not exists catalog_sale_ends_at timestamptz;
