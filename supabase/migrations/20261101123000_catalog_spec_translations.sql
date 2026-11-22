alter table public.product_families add column catalog_specs_en jsonb not null default '{}'::jsonb
  check (jsonb_typeof(catalog_specs_en)='object');
update public.product_families set catalog_specs_en=case family_key
  when 'stand' then '{"material":"Clear acrylic","size":"100 × 150 mm","connection":"NFC + dynamic QR","setup":"Ready template or custom design"}'::jsonb
  when 'coaster' then '{"material":"Pending sample approval","size":"120 × 120 mm","connection":"NFC + dynamic QR","setup":"Ready template or custom design"}'::jsonb
  when 'pvc-card' then '{"material":"PVC","size":"Standard card size — confirm with sample","connection":"NFC + dynamic QR","setup":"Ready template or custom design"}'::jsonb
  else '{}'::jsonb end;
