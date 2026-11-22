create policy "owner reads hidden product families" on public.product_families
  for select to authenticated using ((select app_private.current_staff_role())='owner');
