-- Catalog presentation is independent from SKU approval and checkout readiness.
alter table public.product_families
  add column catalog_visible boolean not null default false,
  add column catalog_deleted_at timestamptz,
  add column catalog_category_ar text not null default '',
  add column catalog_category_en text not null default '',
  add column catalog_description_ar text not null default '',
  add column catalog_description_en text not null default '',
  add column catalog_images text[] not null default '{}',
  add column catalog_specs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(catalog_specs) = 'object');

update public.product_families set
  catalog_visible = family_key in ('stand','coaster','pvc-card'),
  catalog_category_ar = case family_key when 'stand' then 'ستاندات' when 'coaster' then 'كوسترات' when 'pvc-card' then 'كروت' else 'قيد التطوير' end,
  catalog_category_en = case family_key when 'stand' then 'Stands' when 'coaster' then 'Coasters' when 'pvc-card' then 'Cards' else 'In development' end,
  catalog_description_ar = case family_key
    when 'stand' then 'ستاند أكريليك للكاونتر، بتصميمات مختلفة للتقييم والدفع والتواصل وصفحة الروابط.'
    when 'coaster' then 'كوستر ذكي للطاولة، بتصميمات مختلفة ورابط ثابت لكل قطعة.'
    when 'pvc-card' then 'كارت PVC ذكي للتواصل أو التقييم أو الدفع، مع خيارات وجه متعددة.'
    else '' end,
  catalog_description_en = case family_key
    when 'stand' then 'Acrylic counter stand for reviews, payments, social links or a multi-link page.'
    when 'coaster' then 'Smart table coaster with distinct designs and a stable link per item.'
    when 'pvc-card' then 'Smart PVC card for contact, reviews or payment destinations.'
    else '' end,
  catalog_images = case family_key
    when 'stand' then array['/products/mockups/stand-google-white-v2.webp','/products/mockups/stand-studio-v1.webp']
    when 'coaster' then array['/products/mockups/coaster-cafe-v2.webp','/products/mockups/coaster-studio-v1.webp']
    when 'pvc-card' then array['/products/mockups/card-studio-v1.webp','/products/mockups/card-white-v1.webp']
    else '{}'::text[] end,
  catalog_specs = case family_key
    when 'stand' then '{"material":"أكريليك شفاف","size":"100 × 150 مم","connection":"NFC + QR ديناميكي","setup":"قالب جاهز أو تصميم مخصص"}'::jsonb
    when 'coaster' then '{"material":"حسب العينة المعتمدة","size":"120 × 120 مم","connection":"NFC + QR ديناميكي","setup":"قالب جاهز أو تصميم مخصص"}'::jsonb
    when 'pvc-card' then '{"material":"PVC","size":"مقاس بطاقة قياسي — يُراجع مع العينة","connection":"NFC + QR ديناميكي","setup":"قالب جاهز أو تصميم مخصص"}'::jsonb
    else '{}'::jsonb end;

-- Server-only catalog reads and owner-authenticated mutations use the existing
-- database pool. No new browser-facing grants are introduced.
