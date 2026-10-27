-- Move the stand-only prototype onto the per-unit smart item registry.
-- Public scans expose published content only; activation codes never leave this schema.

create table public.merchant_pages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  short_description text not null default '' check (char_length(short_description) <= 180),
  avatar_path text,
  cover_path text,
  is_published boolean not null default false,
  constraint merchant_page_avatar_owner_path check (avatar_path is null or avatar_path ~ ('^' || owner_user_id::text || '/')),
  constraint merchant_page_cover_owner_path check (cover_path is null or cover_path ~ ('^' || owner_user_id::text || '/')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.merchant_page_links (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.merchant_pages(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 50),
  destination_url text not null check (destination_url ~* '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'),
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.smart_items
  add column internal_name text not null default '' check (char_length(internal_name) <= 80),
  add column destination_url text check (destination_url is null or destination_url ~* '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'),
  add column payment_identifier text,
  add column recipient_label text,
  add column landing_page_id uuid references public.merchant_pages(id) on delete set null,
  add column claimed_at timestamptz;

create table public.smart_item_activation_tokens (
  id uuid primary key default gen_random_uuid(),
  smart_item_id uuid not null unique references public.smart_items(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.smart_item_events (
  id bigint generated always as identity primary key,
  smart_item_id uuid not null references public.smart_items(id) on delete cascade,
  event_kind text not null check (event_kind in ('open', 'click')),
  page_link_id uuid references public.merchant_page_links(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((event_kind = 'open' and page_link_id is null) or event_kind = 'click')
);

create index merchant_pages_owner_updated_idx on public.merchant_pages(owner_user_id, updated_at desc);
create index merchant_page_links_page_order_idx on public.merchant_page_links(page_id, sort_order, id);
create index smart_items_owner_created_idx on public.smart_items(owner_user_id, created_at desc);
create index smart_item_events_item_created_idx on public.smart_item_events(smart_item_id, created_at desc);

create trigger merchant_pages_touch_updated_at before update on public.merchant_pages
  for each row execute function app_private.touch_updated_at();
create trigger merchant_page_links_touch_updated_at before update on public.merchant_page_links
  for each row execute function app_private.touch_updated_at();

alter table public.merchant_pages enable row level security;
alter table public.merchant_page_links enable row level security;
alter table public.smart_item_activation_tokens enable row level security;
alter table public.smart_item_events enable row level security;

revoke all on public.merchant_pages, public.merchant_page_links,
  public.smart_item_activation_tokens, public.smart_item_events from anon, authenticated;
grant select, insert, update, delete on public.merchant_pages, public.merchant_page_links to authenticated;
grant select on public.smart_item_events to authenticated;
revoke insert, update, delete on public.smart_items from anon, authenticated;
grant select on public.smart_items to authenticated;
grant update (internal_name, destination_url, payment_identifier, recipient_label, landing_page_id, state)
  on public.smart_items to authenticated;

create policy "customers manage their landing pages" on public.merchant_pages
  for all to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy "customers manage links on their pages" on public.merchant_page_links
  for all to authenticated
  using (exists (
    select 1 from public.merchant_pages p
    where p.id = merchant_page_links.page_id and p.owner_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.merchant_pages p
    where p.id = merchant_page_links.page_id and p.owner_user_id = (select auth.uid())
  ));

create policy "customers read their smart items" on public.smart_items
  for select to authenticated using (owner_user_id = (select auth.uid()));
create policy "customers update their smart items" on public.smart_items
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy "customers read their item analytics" on public.smart_item_events
  for select to authenticated using (exists (
    select 1 from public.smart_items i
    where i.id = smart_item_events.smart_item_id and i.owner_user_id = (select auth.uid())
  ));

create function public.get_my_item_analytics()
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
  where i.owner_user_id = (select auth.uid())
  group by i.id;
$$;
revoke all on function public.get_my_item_analytics() from public, anon;
grant execute on function public.get_my_item_analytics() to authenticated;

create function app_private.validate_smart_item_customer_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_family_key text;
  v_face text;
  v_variant text;
  v_host text;
  v_allowed_state_change boolean := false;
begin
  if auth.uid() is not null then
    if old.public_id is distinct from new.public_id
       or old.sku_id is distinct from new.sku_id
       or old.order_line_id is distinct from new.order_line_id then
      raise exception 'Smart item identity cannot be changed by a customer';
    end if;
    v_allowed_state_change :=
      (old.owner_user_id is null and new.owner_user_id = (select auth.uid()) and old.state = 'ready' and new.state = 'claimed')
      or (old.owner_user_id = (select auth.uid()) and new.owner_user_id = old.owner_user_id
          and ((old.state = 'claimed' and new.state = 'disabled') or (old.state = 'disabled' and new.state = 'claimed')));
    if old.owner_user_id is distinct from new.owner_user_id and not v_allowed_state_change then
      raise exception 'Smart item ownership can only be set by a valid activation';
    end if;
    if old.state is distinct from new.state and not v_allowed_state_change then
      raise exception 'Invalid smart item state change';
    end if;
  end if;

  select f.family_key, s.options ->> 'face', lower(coalesce(s.options ->> 'variant', ''))
    into v_family_key, v_face, v_variant
  from public.product_skus s
  join public.product_families f on f.id = s.product_family_id
  where s.id = new.sku_id;
  if v_family_key is null then raise exception 'Smart item SKU is unavailable'; end if;

  if new.destination_url is not null then
    if new.destination_url !~* '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
      raise exception 'Destination must use HTTPS';
    end if;
    v_host := lower(substring(new.destination_url from '^https://([^/:?#]+)'));
    if v_family_key = 'stand' and v_face = 'review'
      and not (v_host = 'google.com' or v_host like '%.google.com' or v_host = 'g.page' or v_host = 'maps.app.goo.gl') then
      raise exception 'Review stands only accept a Google review destination';
    end if;
    if v_family_key = 'stand' and v_face in ('instagram', 'tiktok', 'facebook') and (
      (v_variant like '%instagram%' and not (v_host = 'instagram.com' or v_host like '%.instagram.com'))
      or (v_variant like '%tiktok%' and not (v_host = 'tiktok.com' or v_host like '%.tiktok.com'))
      or (v_variant like '%facebook%' and not (v_host = 'facebook.com' or v_host like '%.facebook.com' or v_host = 'fb.me'))
      or (v_variant not like '%instagram%' and v_variant not like '%tiktok%' and v_variant not like '%facebook%')
    ) then raise exception 'Social destination must match the printed platform'; end if;
  end if;

  if new.payment_identifier is not null or new.recipient_label is not null then
    if v_family_key <> 'stand' or v_face not in ('instapay', 'vodafone')
      or coalesce(new.recipient_label, '') = ''
      or new.payment_identifier !~ '^[A-Za-z0-9@._+ -]{5,64}$' then
      raise exception 'Payment details must match the printed payment method';
    end if;
  end if;

  if new.landing_page_id is not null and not exists (
    select 1 from public.merchant_pages p
    where p.id = new.landing_page_id and p.owner_user_id = new.owner_user_id
      and exists (
        select 1 from public.product_skus s join public.product_families f on f.id = s.product_family_id
        where s.id = new.sku_id and f.supports_landing_page
          and (f.family_key <> 'stand' or s.options ->> 'face' = 'all-in-one')
      )
  ) then raise exception 'Landing page is not available for this item'; end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger smart_items_customer_guard before update on public.smart_items
  for each row execute function app_private.validate_smart_item_customer_update();

create function app_private.publish_landing_page_timestamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_published then
    if tg_op = 'INSERT' then
      new.published_at := now();
    else
      new.published_at := coalesce(old.published_at, now());
    end if;
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;
create trigger merchant_pages_publish_timestamp before insert or update on public.merchant_pages
  for each row execute function app_private.publish_landing_page_timestamp();

create function public.save_merchant_page(
  p_page_id uuid,
  p_display_name text,
  p_short_description text,
  p_avatar_path text,
  p_cover_path text,
  p_is_published boolean,
  p_links jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_page_id uuid := p_page_id;
  v_link jsonb;
  v_link_id uuid;
  v_saved_link_id uuid;
  v_keep_ids uuid[] := '{}'::uuid[];
  v_order integer := 0;
  v_label text;
  v_url text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 1 and 100 then
    raise exception 'Page name must contain 1 to 100 characters';
  end if;
  if char_length(coalesce(p_short_description, '')) > 180 then
    raise exception 'Page description is too long';
  end if;
  if jsonb_typeof(coalesce(p_links, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_links, '[]'::jsonb)) > 12 then
    raise exception 'A page can contain at most 12 links';
  end if;
  if p_avatar_path is not null and p_avatar_path !~ ('^' || v_user_id::text || '/[^/]+/avatar-[^/]+$') then
    raise exception 'Invalid avatar path';
  end if;
  if p_cover_path is not null and p_cover_path !~ ('^' || v_user_id::text || '/[^/]+/cover-[^/]+$') then
    raise exception 'Invalid cover path';
  end if;

  if v_page_id is null then
    insert into public.merchant_pages(owner_user_id, display_name, short_description, avatar_path, cover_path, is_published)
    values (v_user_id, btrim(p_display_name), btrim(coalesce(p_short_description, '')), p_avatar_path, p_cover_path, false)
    returning id into v_page_id;
  else
    update public.merchant_pages p set
      display_name = btrim(p_display_name),
      short_description = btrim(coalesce(p_short_description, '')),
      avatar_path = p_avatar_path,
      cover_path = p_cover_path
    where p.id = v_page_id and p.owner_user_id = v_user_id;
    if not found then raise exception 'Landing page is unavailable'; end if;
  end if;

  for v_link in
    select value from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) with ordinality as links(value, ordinality)
    order by ordinality
  loop
    v_order := v_order + 1;
    v_label := btrim(coalesce(v_link ->> 'label', ''));
    v_url := btrim(coalesce(v_link ->> 'destination_url', ''));
    if char_length(v_label) not between 1 and 50 then raise exception 'Link labels must contain 1 to 50 characters'; end if;
    if v_url !~* '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then raise exception 'Links must use HTTPS'; end if;

    v_link_id := nullif(v_link ->> 'id', '')::uuid;
    if v_link_id is null then
      insert into public.merchant_page_links(page_id, label, destination_url, sort_order, is_enabled)
      values (v_page_id, v_label, v_url, v_order, coalesce((v_link ->> 'is_enabled')::boolean, true))
      returning id into v_saved_link_id;
    else
      update public.merchant_page_links l set
        label = v_label,
        destination_url = v_url,
        sort_order = v_order,
        is_enabled = coalesce((v_link ->> 'is_enabled')::boolean, true)
      where l.id = v_link_id and l.page_id = v_page_id
      returning l.id into v_saved_link_id;
      if v_saved_link_id is null then raise exception 'Link does not belong to this page'; end if;
    end if;
    v_keep_ids := array_append(v_keep_ids, v_saved_link_id);
  end loop;

  delete from public.merchant_page_links l
  where l.page_id = v_page_id and not (l.id = any(v_keep_ids));
  if p_is_published and not exists (
    select 1 from public.merchant_page_links l where l.page_id = v_page_id and l.is_enabled
  ) then raise exception 'Publish a page only after adding an active link'; end if;
  update public.merchant_pages p set is_published = coalesce(p_is_published, false)
  where p.id = v_page_id and p.owner_user_id = v_user_id;
  return v_page_id;
end;
$$;
revoke all on function public.save_merchant_page(uuid, text, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.save_merchant_page(uuid, text, text, text, text, boolean, jsonb) to authenticated;

create function public.claim_stand_activation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_item_id uuid;
  v_claimed_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_token_hash !~ '^[a-fA-F0-9]{64}$' then raise exception 'Invalid activation code'; end if;

  update public.smart_item_activation_tokens t set consumed_at = now()
  where t.id = (
    select token.id from public.smart_item_activation_tokens token
    where token.token_hash = lower(p_token_hash) and token.consumed_at is null
      and (token.expires_at is null or token.expires_at > now())
    for update
  ) returning t.smart_item_id into v_item_id;
  if v_item_id is null then raise exception 'Activation token is invalid, expired, or already used'; end if;

  update public.smart_items i set owner_user_id = v_user_id, state = 'claimed', claimed_at = now()
  where i.id = v_item_id and i.owner_user_id is null and i.state = 'ready'
  returning i.id into v_claimed_id;
  if v_claimed_id is null then raise exception 'Smart item is no longer available'; end if;
  return v_claimed_id;
end;
$$;
revoke all on function public.claim_stand_activation(text) from public, anon;
grant execute on function public.claim_stand_activation(text) to authenticated;

create function public.resolve_stand(p_public_id text)
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

  insert into public.smart_item_events(smart_item_id, event_kind) values (v_item.id, 'open');
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
revoke all on function public.resolve_stand(text) from public;
grant execute on function public.resolve_stand(text) to anon, authenticated;

create function public.track_smart_item_click(p_public_id text, p_link_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_destination text;
begin
  select i.id, l.destination_url into v_item_id, v_destination
  from public.smart_items i
  join public.merchant_pages p on p.id = i.landing_page_id and p.owner_user_id = i.owner_user_id and p.is_published
  join public.merchant_page_links l on l.page_id = p.id and l.id = p_link_id and l.is_enabled
  where i.public_id::text = p_public_id and i.state = 'claimed' and i.owner_user_id is not null
  limit 1;
  if v_destination is null or v_destination !~* '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then return null; end if;
  insert into public.smart_item_events(smart_item_id, event_kind, page_link_id)
  values (v_item_id, 'click', p_link_id);
  return v_destination;
end;
$$;
revoke all on function public.track_smart_item_click(text, uuid) from public;
grant execute on function public.track_smart_item_click(text, uuid) to anon, authenticated;

-- Only profile assets currently published by a customer page can be read publicly.
create function app_private.is_public_landing_asset(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.merchant_pages p
    where p.is_published and (p.avatar_path = p_path or p.cover_path = p_path)
  );
$$;
grant usage on schema app_private to anon;
grant execute on function app_private.is_public_landing_asset(text) to anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-assets', 'merchant-assets', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public reads published merchant assets" on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'merchant-assets' and app_private.is_public_landing_asset(name)
  );
create policy "customers read their merchant assets" on storage.objects
  for select to authenticated using (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "customers upload their merchant assets" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "customers update their merchant assets" on storage.objects
  for update to authenticated using (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "customers delete their merchant assets" on storage.objects
  for delete to authenticated using (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
