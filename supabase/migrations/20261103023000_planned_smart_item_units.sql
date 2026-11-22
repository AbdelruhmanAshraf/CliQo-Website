-- Reserve a public ID for each unit before artwork is sent to production.
-- Planned units do not increase sellable stock until physical receipt.
alter table public.smart_items
  add column if not exists production_planned_at timestamptz;

create index if not exists smart_items_planned_sku_idx
  on public.smart_items (sku_id, created_at, id)
  where production_planned_at is not null and state = 'unassigned';

-- The founder-approved launch variants start as editable drafts with no price or stock.
with variants(family_key, face, variant, face_name) as (
  values
    ('stand','all-in-one','All-in-One','All-in-One'),
    ('stand','review','أبيض','Google'),('stand','review','شفاف','Google'),
    ('stand','facebook','Facebook','Facebook'),('stand','instagram','Instagram','Instagram'),
    ('stand','instapay','InstaPay','InstaPay'),('stand','tiktok','TikTok','TikTok'),
    ('stand','vodafone','Vodafone Cash','Vodafone Cash'),
    ('coaster','all-in-one','All-in-One','All-in-One'),
    ('coaster','review','أبيض','Google'),('coaster','review','شفاف','Google'),
    ('coaster','facebook','Facebook','Facebook'),('coaster','instagram','Instagram','Instagram'),
    ('coaster','instapay','InstaPay','InstaPay'),('coaster','tiktok','TikTok','TikTok'),
    ('coaster','vodafone','Vodafone Cash','Vodafone Cash'),
    ('pvc-card','facebook','Facebook','Facebook'),('pvc-card','review','Google Review','Google'),
    ('pvc-card','instagram','Instagram','Instagram'),('pvc-card','instapay','InstaPay','InstaPay'),
    ('pvc-card','all-in-one','أسود','All-in-One'),('pvc-card','all-in-one','أبيض','All-in-One')
)
insert into public.product_skus(product_family_id,sku_code,display_name,options,state)
select f.id, 'CQ-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  f.name_ar || ' · ' || v.face_name || ' · ' || v.variant,
  jsonb_build_object('face',v.face,'variant',v.variant,'design','T0'), 'preparing'
from variants v join public.product_families f on f.family_key=v.family_key
where not exists (
  select 1 from public.product_skus s
  where s.product_family_id=f.id
    and s.options @> jsonb_build_object('face',v.face,'variant',v.variant,'design','T0')
);

notify pgrst, 'reload schema';
