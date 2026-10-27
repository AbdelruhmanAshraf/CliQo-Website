-- Customer page writes go through save_merchant_page, which validates the owner
-- and updates the page and links atomically. Keep browser table access read-only.
revoke all on public.merchant_pages, public.merchant_page_links from public, anon, authenticated;
grant select on public.merchant_pages, public.merchant_page_links to authenticated;

drop policy if exists "customers manage their landing pages" on public.merchant_pages;
drop policy if exists "customers manage links on their pages" on public.merchant_page_links;

create policy "customers read their landing pages" on public.merchant_pages
  for select to authenticated using (owner_user_id = (select auth.uid()));

create policy "customers read links on their pages" on public.merchant_page_links
  for select to authenticated using (exists (
    select 1 from public.merchant_pages p
    where p.id = merchant_page_links.page_id and p.owner_user_id = (select auth.uid())
  ));
