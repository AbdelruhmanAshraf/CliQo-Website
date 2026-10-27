-- Preserve which landing page a visit used, even if the owner later reassigns an item.
alter table public.smart_item_events
  add column landing_page_id uuid references public.merchant_pages(id) on delete set null;

create index smart_item_events_page_created_idx
  on public.smart_item_events(landing_page_id, created_at desc)
  where landing_page_id is not null;

create or replace function public.resolve_stand(p_public_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_page record;
  v_kind text;
begin
  select i.id, i.public_id, i.state, i.owner_user_id, i.destination_url,
    i.payment_identifier, i.recipient_label, i.landing_page_id,
    s.options ->> 'face' as face, s.options ->> 'variant' as variant,
    f.family_key
  into v_item
  from public.smart_items i
  join public.product_skus s on s.id = i.sku_id
  join public.product_families f on f.id = s.product_family_id
  where i.public_id::text = p_public_id
  limit 1;
  if not found then return null; end if;
  if v_item.state = 'disabled' then return jsonb_build_object('kind', 'paused'); end if;
  if v_item.state <> 'claimed' or v_item.owner_user_id is null then
    return jsonb_build_object('kind', 'unclaimed');
  end if;

  insert into public.smart_item_events(smart_item_id, event_kind, landing_page_id)
  values (v_item.id, 'open', (
    select p.id from public.merchant_pages p
    where p.id = v_item.landing_page_id and p.owner_user_id = v_item.owner_user_id and p.is_published
  ));
  v_kind := case
    when v_item.family_key = 'stand' and v_item.face = 'review' then 'review'
    when v_item.family_key = 'stand' and v_item.face in ('instapay', 'vodafone') then 'payment'
    when v_item.family_key = 'stand' and v_item.face in ('instagram', 'tiktok', 'facebook') then 'social'
    when v_item.landing_page_id is not null then 'all_in_one'
    else 'single'
  end;

  if v_item.landing_page_id is not null then
    select p.id, p.display_name, p.short_description, p.avatar_path, p.cover_path
      into v_page from public.merchant_pages p
      where p.id = v_item.landing_page_id and p.owner_user_id = v_item.owner_user_id and p.is_published;
    if found then
      return jsonb_build_object(
        'kind', 'all_in_one', 'printed_variant', v_item.variant,
        'page', jsonb_build_object(
          'display_name', v_page.display_name,
          'short_description', v_page.short_description,
          'avatar_path', v_page.avatar_path,
          'cover_path', v_page.cover_path,
          'links', coalesce((
            select jsonb_agg(jsonb_build_object('id', l.id, 'label', l.label) order by l.sort_order, l.id)
            from public.merchant_page_links l where l.page_id = v_page.id and l.is_enabled
          ), '[]'::jsonb)
        )
      );
    end if;
    return jsonb_build_object('kind', 'setup');
  end if;

  if v_kind = 'payment' and v_item.payment_identifier is not null and v_item.recipient_label is not null then
    return jsonb_build_object('kind', v_kind, 'printed_variant', v_item.variant,
      'payment_identifier', v_item.payment_identifier, 'recipient_label', v_item.recipient_label);
  end if;
  if v_item.destination_url is not null then
    return jsonb_build_object('kind', v_kind, 'printed_variant', v_item.variant, 'destination_url', v_item.destination_url);
  end if;
  return jsonb_build_object('kind', 'setup');
end;
$$;

create or replace function public.track_smart_item_click(p_public_id text, p_link_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_page_id uuid;
  v_destination text;
begin
  select i.id, p.id, l.destination_url into v_item_id, v_page_id, v_destination
  from public.smart_items i
  join public.merchant_pages p on p.id = i.landing_page_id and p.owner_user_id = i.owner_user_id and p.is_published
  join public.merchant_page_links l on l.page_id = p.id and l.id = p_link_id and l.is_enabled
  where i.public_id::text = p_public_id and i.state = 'claimed' and i.owner_user_id is not null
  limit 1;
  if v_destination is null or v_destination !~* '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then return null; end if;
  insert into public.smart_item_events(smart_item_id, event_kind, page_link_id, landing_page_id)
  values (v_item_id, 'click', p_link_id, v_page_id);
  return v_destination;
end;
$$;

create function public.get_my_page_analytics()
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
  where e.landing_page_id is not null and i.owner_user_id = (select auth.uid())
  group by e.landing_page_id;
$$;
revoke all on function public.get_my_page_analytics() from public, anon;
grant execute on function public.get_my_page_analytics() to authenticated;
