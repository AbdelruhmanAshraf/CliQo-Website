-- Supabase logical schema dump omits custom policies in its managed Storage schema.
-- Apply on a restored, isolated Supabase instance after roles/schema/data import.
begin;

drop policy if exists "design staff reads private order files" on storage.objects;
create policy "design staff reads private order files" on storage.objects
  for select to authenticated using (
    bucket_id = 'order-designs' and
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment')
  );

drop policy if exists "design staff uploads private order files" on storage.objects;
create policy "design staff uploads private order files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'order-designs' and
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment') and
    exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1])
  );

drop policy if exists "public reads published merchant assets" on storage.objects;
create policy "public reads published merchant assets" on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'merchant-assets' and app_private.is_public_landing_asset(name)
  );

drop policy if exists "public reads catalog images" on storage.objects;
create policy "public reads catalog images" on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'catalog-images'
  );

drop policy if exists "customers read their merchant assets" on storage.objects;
create policy "customers read their merchant assets" on storage.objects
  for select to authenticated using (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "customers upload their merchant assets" on storage.objects;
create policy "customers upload their merchant assets" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "customers update their merchant assets" on storage.objects;
create policy "customers update their merchant assets" on storage.objects
  for update to authenticated using (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "customers delete their merchant assets" on storage.objects;
create policy "customers delete their merchant assets" on storage.objects
  for delete to authenticated using (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
