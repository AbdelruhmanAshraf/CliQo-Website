alter table public.product_families
  add column if not exists catalog_design_images jsonb not null default '{}'::jsonb,
  add column if not exists catalog_subcategory_ar text not null default '',
  add column if not exists catalog_subcategory_en text not null default '',
  add column if not exists catalog_badge_ar text not null default '',
  add column if not exists catalog_badge_en text not null default '',
  add column if not exists catalog_compare_at_minor integer;

alter table public.product_families
  add constraint catalog_design_images_object check (jsonb_typeof(catalog_design_images) = 'object'),
  add constraint catalog_compare_at_positive check (catalog_compare_at_minor is null or catalog_compare_at_minor > 0);
