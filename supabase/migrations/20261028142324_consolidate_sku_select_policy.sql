-- Keep the authenticated SKU-read rule in one policy while including
-- catalog details for items the current customer owns.
drop policy "customers read SKUs attached to owned items"
on public.product_skus;

drop policy "authenticated reads catalog and staff skus"
on public.product_skus;

create policy "authenticated reads catalog and staff skus"
on public.product_skus
for select
to authenticated
using (
  (
    state = 'ready'
    and price_approved
    and sample_approved
    and fulfillment_approved
    and price_minor is not null
  )
  or (select app_private.current_staff_role()) in ('owner', 'admin', 'operations', 'fulfillment')
  or exists (
    select 1
    from public.smart_items as item
    where item.sku_id = product_skus.id
      and item.owner_user_id = (select auth.uid())
  )
);
