drop function public.get_my_item_analytics();
create function public.get_my_item_analytics(
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns table (smart_item_id uuid, opens bigint, clicks bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id,
    count(e.id) filter (where e.event_kind = 'open'),
    count(e.id) filter (where e.event_kind = 'click')
  from public.smart_items i
  left join public.smart_item_events e on e.smart_item_id = i.id
    and (p_since is null or e.created_at >= p_since)
    and (p_until is null or e.created_at < p_until)
  where i.owner_user_id = (select auth.uid())
  group by i.id;
$$;
revoke all on function public.get_my_item_analytics(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_my_item_analytics(timestamptz, timestamptz) to authenticated;

drop function public.get_my_page_analytics();
create function public.get_my_page_analytics(
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns table (landing_page_id uuid, opens bigint, clicks bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.landing_page_id,
    count(*) filter (where e.event_kind = 'open'),
    count(*) filter (where e.event_kind = 'click')
  from public.smart_item_events e
  join public.smart_items i on i.id = e.smart_item_id
  where e.landing_page_id is not null
    and i.owner_user_id = (select auth.uid())
    and (p_since is null or e.created_at >= p_since)
    and (p_until is null or e.created_at < p_until)
  group by e.landing_page_id;
$$;
revoke all on function public.get_my_page_analytics(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_my_page_analytics(timestamptz, timestamptz) to authenticated;
