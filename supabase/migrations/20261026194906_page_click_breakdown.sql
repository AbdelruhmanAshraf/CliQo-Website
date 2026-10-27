create function public.get_my_page_click_breakdown(
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns table (
  landing_page_id uuid,
  page_link_id uuid,
  smart_item_id uuid,
  clicks bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.landing_page_id, e.page_link_id, e.smart_item_id, count(*)
  from public.smart_item_events e
  join public.smart_items i on i.id = e.smart_item_id
  join public.merchant_pages p on p.id = e.landing_page_id
  where e.event_kind = 'click'
    and e.landing_page_id is not null
    and i.owner_user_id = (select auth.uid())
    and p.owner_user_id = (select auth.uid())
    and (p_since is null or e.created_at >= p_since)
    and (p_until is null or e.created_at < p_until)
  group by e.landing_page_id, e.page_link_id, e.smart_item_id;
$$;
revoke all on function public.get_my_page_click_breakdown(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_my_page_click_breakdown(timestamptz, timestamptz) to authenticated;
