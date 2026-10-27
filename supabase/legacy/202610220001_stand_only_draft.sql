-- RANK1 first-release schema. Apply to a development Supabase project only.
create type public.stand_kind as enum ('review', 'payment', 'social', 'all_in_one');
create type public.stand_status as enum ('active', 'disabled');

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.merchant_members (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (merchant_id, user_id)
);

create table public.stands (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (length(public_id) >= 24),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  internal_name text not null default '',
  kind public.stand_kind not null,
  printed_variant text not null,
  status public.stand_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stand_destinations (
  stand_id uuid primary key references public.stands (id) on delete cascade,
  destination_url text,
  payment_identifier text,
  recipient_label text,
  check ((destination_url is null) <> (payment_identifier is null)),
  updated_at timestamptz not null default now()
);

create table public.merchant_pages (
  id uuid primary key default gen_random_uuid(),
  stand_id uuid not null unique references public.stands (id) on delete cascade,
  display_name text not null default '',
  short_description text not null default '' check (char_length(short_description) <= 180),
  avatar_path text,
  cover_path text,
  is_published boolean not null default false,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.page_links (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.merchant_pages (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 50),
  destination_url text not null check (destination_url ~* '^https://'),
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activation_tokens (
  id uuid primary key default gen_random_uuid(),
  stand_id uuid not null references public.stands (id) on delete cascade,
  token_hash text not null unique,
  member_role text not null default 'owner' check (member_role in ('owner', 'editor')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.change_log (
  id bigint generated always as identity primary key,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  stand_id uuid references public.stands (id) on delete set null,
  entity text not null,
  entity_id text not null,
  changed_by uuid references auth.users (id) on delete set null,
  change_summary text not null,
  created_at timestamptz not null default now()
);

create index stands_merchant_id_idx on public.stands (merchant_id);
create index page_links_page_order_idx on public.page_links (page_id, sort_order);
create index change_log_merchant_created_idx on public.change_log (merchant_id, created_at desc);

alter table public.merchants enable row level security;
alter table public.merchant_members enable row level security;
alter table public.stands enable row level security;
alter table public.stand_destinations enable row level security;
alter table public.merchant_pages enable row level security;
alter table public.page_links enable row level security;
alter table public.activation_tokens enable row level security;
alter table public.change_log enable row level security;

-- Start with no table privileges; grant only the operations used by the app.
revoke all on public.merchants, public.merchant_members, public.stands,
  public.stand_destinations, public.merchant_pages, public.page_links,
  public.activation_tokens, public.change_log from anon, authenticated;
grant select on public.merchants to authenticated;
grant update (display_name) on public.merchants to authenticated;
grant select on public.merchant_members to authenticated;
grant select on public.stands to authenticated;
grant update (internal_name) on public.stands to authenticated;
grant select, insert on public.stand_destinations to authenticated;
grant update (destination_url, payment_identifier, recipient_label) on public.stand_destinations to authenticated;
grant select, insert, update on public.merchant_pages to authenticated;
grant select, insert, update, delete on public.page_links to authenticated;
grant select on public.change_log to authenticated;
revoke all on public.activation_tokens from anon, authenticated;

create policy "merchant owners read own record" on public.merchants
  for select to authenticated using (exists (
    select 1 from public.merchant_members m where m.merchant_id = merchants.id and m.user_id = (select auth.uid())
  ));
create policy "merchant owners update own record" on public.merchants
  for update to authenticated using (exists (
    select 1 from public.merchant_members m where m.merchant_id = merchants.id and m.user_id = (select auth.uid()) and m.role = 'owner'
  )) with check (exists (
    select 1 from public.merchant_members m where m.merchant_id = merchants.id and m.user_id = (select auth.uid()) and m.role = 'owner'
  ));

create policy "members read own membership" on public.merchant_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "members read merchant stands" on public.stands
  for select to authenticated using (exists (
    select 1 from public.merchant_members m
    where m.merchant_id = stands.merchant_id and m.user_id = (select auth.uid())
  ));
create policy "members update merchant stand labels" on public.stands
  for update to authenticated using (exists (
    select 1 from public.merchant_members m
    where m.merchant_id = stands.merchant_id and m.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.merchant_members m
    where m.merchant_id = stands.merchant_id and m.user_id = (select auth.uid())
  ));

create policy "members read stand destinations" on public.stand_destinations
  for select to authenticated using (exists (
    select 1 from public.stands s join public.merchant_members m on m.merchant_id = s.merchant_id
    where s.id = stand_destinations.stand_id and m.user_id = (select auth.uid())
  ));
create policy "members create stand destinations" on public.stand_destinations
  for insert to authenticated with check (exists (
    select 1 from public.stands s join public.merchant_members m on m.merchant_id = s.merchant_id
    where s.id = stand_destinations.stand_id and s.kind <> 'all_in_one' and m.user_id = (select auth.uid())
  ));
create policy "members update stand destinations" on public.stand_destinations
  for update to authenticated using (exists (
    select 1 from public.stands s join public.merchant_members m on m.merchant_id = s.merchant_id
    where s.id = stand_destinations.stand_id and s.kind <> 'all_in_one' and m.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.stands s join public.merchant_members m on m.merchant_id = s.merchant_id
    where s.id = stand_destinations.stand_id and s.kind <> 'all_in_one' and m.user_id = (select auth.uid())
  ));

create policy "members read own pages and public reads published pages" on public.merchant_pages
  for select to anon, authenticated using (
    is_published or exists (
      select 1 from public.stands s join public.merchant_members m on m.merchant_id = s.merchant_id
      where s.id = merchant_pages.stand_id and m.user_id = (select auth.uid())
    )
  );
create policy "members create pages for own stands" on public.merchant_pages
  for insert to authenticated with check (exists (
    select 1 from public.stands s join public.merchant_members m on m.merchant_id = s.merchant_id
    where s.id = merchant_pages.stand_id and m.user_id = (select auth.uid())
      and s.kind = 'all_in_one'
  ));
create policy "members update own pages" on public.merchant_pages
  for update to authenticated using (exists (
    select 1 from public.stands s join public.merchant_members m on m.merchant_id = s.merchant_id
    where s.id = merchant_pages.stand_id and m.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.stands s join public.merchant_members m on m.merchant_id = s.merchant_id
    where s.id = merchant_pages.stand_id and m.user_id = (select auth.uid())
      and s.kind = 'all_in_one'
  ));

create policy "members read page links; public reads enabled links on published pages" on public.page_links
  for select to anon, authenticated using (
    (is_enabled and exists (select 1 from public.merchant_pages p where p.id = page_links.page_id and p.is_published))
    or exists (
      select 1 from public.merchant_pages p
      join public.stands s on s.id = p.stand_id
      join public.merchant_members m on m.merchant_id = s.merchant_id
      where p.id = page_links.page_id and m.user_id = (select auth.uid())
    )
  );
create policy "members add page links" on public.page_links
  for insert to authenticated with check (exists (
    select 1 from public.merchant_pages p join public.stands s on s.id = p.stand_id
    join public.merchant_members m on m.merchant_id = s.merchant_id
    where p.id = page_links.page_id and s.kind = 'all_in_one' and m.user_id = (select auth.uid())
  ));
create policy "members update page links" on public.page_links
  for update to authenticated using (exists (
    select 1 from public.merchant_pages p join public.stands s on s.id = p.stand_id
    join public.merchant_members m on m.merchant_id = s.merchant_id
    where p.id = page_links.page_id and m.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.merchant_pages p join public.stands s on s.id = p.stand_id
    join public.merchant_members m on m.merchant_id = s.merchant_id
    where p.id = page_links.page_id and s.kind = 'all_in_one' and m.user_id = (select auth.uid())
  ));
create policy "members delete page links" on public.page_links
  for delete to authenticated using (exists (
    select 1 from public.merchant_pages p join public.stands s on s.id = p.stand_id
    join public.merchant_members m on m.merchant_id = s.merchant_id
    where p.id = page_links.page_id and m.user_id = (select auth.uid())
  ));

-- Private merchant files; pages should expose short-lived signed image URLs after publish.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-assets', 'merchant-assets', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "merchant reads own image files" on storage.objects
  for select to authenticated using (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "merchant uploads own image files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "merchant updates own image files" on storage.objects
  for update to authenticated using (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "merchant deletes own image files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'merchant-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members read own change history" on public.change_log
  for select to authenticated using (exists (
    select 1 from public.merchant_members m
    where m.merchant_id = change_log.merchant_id and m.user_id = (select auth.uid())
  ));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger stands_touch_updated_at before update on public.stands
  for each row execute function public.touch_updated_at();
create trigger destinations_touch_updated_at before update on public.stand_destinations
  for each row execute function public.touch_updated_at();
create trigger pages_touch_updated_at before update on public.merchant_pages
  for each row execute function public.touch_updated_at();
create trigger page_links_touch_updated_at before update on public.page_links
  for each row execute function public.touch_updated_at();

create or replace function public.record_merchant_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stand_id uuid;
  v_merchant_id uuid;
  v_entity_id text;
begin
  if tg_table_name = 'stand_destinations' then
    v_stand_id := new.stand_id;
    v_entity_id := new.stand_id::text;
  elsif tg_table_name = 'merchant_pages' then
    v_stand_id := new.stand_id;
    v_entity_id := new.id::text;
  elsif tg_table_name = 'page_links' then
    v_entity_id := new.id::text;
    select p.stand_id into v_stand_id from public.merchant_pages p where p.id = new.page_id;
  end if;
  select s.merchant_id into v_merchant_id from public.stands s where s.id = v_stand_id;
  if v_merchant_id is not null then
    insert into public.change_log (merchant_id, stand_id, entity, entity_id, changed_by, change_summary)
    values (v_merchant_id, v_stand_id, tg_table_name, v_entity_id, auth.uid(), 'Updated ' || tg_table_name);
  end if;
  return new;
end;
$$;
create trigger destination_change_log after update on public.stand_destinations
  for each row execute function public.record_merchant_change();
create trigger page_change_log after update on public.merchant_pages
  for each row execute function public.record_merchant_change();
create trigger page_link_change_log after update on public.page_links
  for each row execute function public.record_merchant_change();

create or replace function public.validate_stand_destination()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_variant text;
  v_host text;
begin
  select s.kind::text, lower(s.printed_variant) into v_kind, v_variant
  from public.stands s where s.id = new.stand_id;
  if v_kind is null then raise exception 'Stand not found'; end if;

  if v_kind = 'payment' then
    if new.destination_url is not null or coalesce(new.recipient_label, '') = '' then
      raise exception 'Payment stands require a recipient name and payment identifier';
    end if;
    if new.payment_identifier !~ '^[A-Za-z0-9@._+ -]{5,64}$' then
      raise exception 'Payment identifier format is invalid';
    end if;
    if v_variant not like '%instapay%' and v_variant not like '%vodafone%' then
      raise exception 'Unsupported payment stand variant';
    end if;
    return new;
  end if;

  if new.payment_identifier is not null or new.destination_url is null then
    raise exception 'This stand requires a web destination';
  end if;
  v_host := lower(substring(new.destination_url from '^https://([^/:?#]+)'));

  if v_kind = 'review' then
    if not (v_host = 'google.com' or v_host like '%.google.com' or v_host = 'g.page' or v_host = 'maps.app.goo.gl') then
      raise exception 'Review stands only accept a Google review URL';
    end if;
  elsif v_kind = 'social' then
    if (v_variant like '%instagram%' and not (v_host = 'instagram.com' or v_host like '%.instagram.com'))
      or (v_variant like '%tiktok%' and not (v_host = 'tiktok.com' or v_host like '%.tiktok.com'))
      or (v_variant like '%facebook%' and not (v_host = 'facebook.com' or v_host like '%.facebook.com' or v_host = 'fb.me'))
      or (v_variant not like '%instagram%' and v_variant not like '%tiktok%' and v_variant not like '%facebook%') then
      raise exception 'Social destination does not match the printed platform';
    end if;
  else
    raise exception 'This stand type does not accept a single destination';
  end if;
  return new;
end;
$$;
create trigger stand_destination_validate before insert or update on public.stand_destinations
  for each row execute function public.validate_stand_destination();

create or replace function public.create_current_merchant(p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_merchant_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  insert into public.merchants (created_by, display_name)
  values (v_user_id, left(coalesce(p_display_name, ''), 100))
  returning id into v_merchant_id;
  insert into public.merchant_members (merchant_id, user_id, role)
  values (v_merchant_id, v_user_id, 'owner');
  return v_merchant_id;
end;
$$;
revoke all on function public.create_current_merchant(text) from public;
grant execute on function public.create_current_merchant(text) to authenticated;

create or replace function public.claim_stand_activation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_stand_id uuid;
  v_merchant_id uuid;
  v_role text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  update public.activation_tokens t
  set consumed_at = now()
  where t.id = (
    select token.id from public.activation_tokens token
    where token.token_hash = p_token_hash and token.consumed_at is null and token.expires_at > now()
    for update
  ) returning t.stand_id, t.member_role into v_stand_id, v_role;
  if v_stand_id is null then raise exception 'Activation token is invalid, expired, or already used'; end if;
  select s.merchant_id into v_merchant_id from public.stands s where s.id = v_stand_id;
  if v_merchant_id is null then raise exception 'Stand is unavailable'; end if;
  insert into public.merchant_members (merchant_id, user_id, role)
  values (v_merchant_id, v_user_id, v_role)
  on conflict (merchant_id, user_id) do nothing;
  return v_merchant_id;
end;
$$;
revoke all on function public.claim_stand_activation(text) from public;
grant execute on function public.claim_stand_activation(text) to authenticated;

-- Public link resolver exposes only the active stand's approved destination or published page fields.
create or replace function public.resolve_stand(p_public_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.kind = 'all_in_one' then jsonb_build_object(
      'kind', s.kind,
      'page', jsonb_build_object(
        'display_name', p.display_name,
        'short_description', p.short_description,
        'avatar_path', p.avatar_path,
        'cover_path', p.cover_path,
        'links', coalesce((
          select jsonb_agg(jsonb_build_object('label', l.label, 'url', l.destination_url) order by l.sort_order, l.id)
          from public.page_links l where l.page_id = p.id and l.is_enabled
        ), '[]'::jsonb)
      )
    )
    else jsonb_build_object(
      'kind', s.kind,
      'printed_variant', s.printed_variant,
      'destination_url', d.destination_url,
      'payment_identifier', d.payment_identifier,
      'recipient_label', d.recipient_label
    )
  end
  from public.stands s
  left join public.stand_destinations d on d.stand_id = s.id
  left join public.merchant_pages p on p.stand_id = s.id and p.is_published
  where s.public_id = p_public_id and s.status = 'active'
    and ((s.kind = 'all_in_one' and p.id is not null) or (s.kind <> 'all_in_one' and d.destination_url is not null))
  limit 1;
$$;
revoke all on function public.resolve_stand(text) from public;
grant execute on function public.resolve_stand(text) to anon, authenticated;
