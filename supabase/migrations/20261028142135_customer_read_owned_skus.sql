-- Customers need product labels and options for the smart items they own,
-- including items whose SKU is no longer approved for new sales.
create policy "customers read SKUs attached to owned items"
on public.product_skus
for select
to authenticated
using (
  exists (
    select 1
    from public.smart_items as item
    where item.sku_id = product_skus.id
      and item.owner_user_id = (select auth.uid())
  )
);
