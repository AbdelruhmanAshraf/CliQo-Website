-- Allow inventory staff to inspect unapproved SKUs without exposing them to shoppers.
grant select (state, price_approved, sample_approved, fulfillment_approved)
  on public.product_skus to authenticated;

create policy "inventory staff reads all skus" on public.product_skus
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment')
  );
