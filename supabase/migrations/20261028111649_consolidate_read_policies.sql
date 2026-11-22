-- Combine duplicate authenticated SELECT policies without widening access.
drop policy if exists "public reads approved sale skus" on public.product_skus;
drop policy if exists "inventory staff reads all skus" on public.product_skus;

create policy "public reads approved sale skus" on public.product_skus
  for select to anon using (
    state = 'ready' and price_approved and sample_approved and fulfillment_approved and price_minor is not null
  );
create policy "authenticated reads catalog and staff skus" on public.product_skus
  for select to authenticated using (
    (state = 'ready' and price_approved and sample_approved and fulfillment_approved and price_minor is not null)
    or (select app_private.current_staff_role()) in ('owner', 'admin', 'operations', 'fulfillment')
  );

drop policy if exists "customers read their smart items" on public.smart_items;
drop policy if exists "staff reads smart item registry" on public.smart_items;

create policy "customers and staff read smart items" on public.smart_items
  for select to authenticated using (
    owner_user_id = (select auth.uid())
    or (select app_private.current_staff_role()) in ('owner', 'admin', 'operations', 'fulfillment', 'support')
  );
