begin;

alter table public.smart_items
  add column archived_at timestamptz,
  add constraint smart_items_archive_requires_disabled
    check (archived_at is null or (state = 'disabled' and owner_user_id is not null));

grant update (archived_at) on public.smart_items to authenticated;

create function public.get_my_analytics_trend(p_period text)
returns table (bucket timestamp, opens bigint, clicks bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with settings as (
    select
      case p_period when '24h' then 'hour' when 'all' then 'month' else 'day' end as unit,
      case p_period when '24h' then interval '1 hour' when 'all' then interval '1 month' else interval '1 day' end as step,
      case p_period
        when '24h' then now() - interval '24 hours'
        when '7d' then now() - interval '7 days'
        when '30d' then now() - interval '30 days'
        when 'all' then now() - interval '13 months'
      end as since,
      now() as until
  ), counts as (
    select date_trunc(s.unit, e.created_at at time zone 'Africa/Cairo') as bucket,
      count(*) filter (where e.event_kind = 'open') as opens,
      count(*) filter (where e.event_kind = 'click') as clicks
    from settings s
    join public.smart_item_events e on e.created_at >= s.since and e.created_at < s.until
    join public.smart_items i on i.id = e.smart_item_id and i.owner_user_id = (select auth.uid())
    group by 1
  )
  select b.bucket, coalesce(c.opens, 0), coalesce(c.clicks, 0)
  from settings s
  cross join lateral generate_series(
    date_trunc(s.unit, s.since at time zone 'Africa/Cairo'),
    date_trunc(s.unit, s.until at time zone 'Africa/Cairo'),
    s.step
  ) b(bucket)
  left join counts c on c.bucket = b.bucket
  order by b.bucket;
$$;

revoke all on function public.get_my_analytics_trend(text) from public, anon;
grant execute on function public.get_my_analytics_trend(text) to authenticated;

commit;
