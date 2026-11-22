-- Apply the printed face rules to every current smart-item family.
-- The public QR/NFC URL stays unchanged; only its approved experience changes.

alter table public.smart_items
  add column manual_handoff_reference text unique
    check (manual_handoff_reference is null or manual_handoff_reference ~ '^FIELD-[A-F0-9]{12}$'),
  add column manual_handoff_at timestamptz,
  add column manual_handoff_by uuid references auth.users(id) on delete set null;

create table app_private.manual_item_handoff_events (
  id bigint generated always as identity primary key,
  smart_item_id uuid not null references public.smart_items(id) on delete cascade,
  action text not null check (action in ('handoff', 'activation_code_replaced')),
  reference text not null,
  note text not null default '' check (char_length(note) <= 300),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index manual_item_handoff_events_item_idx
  on app_private.manual_item_handoff_events(smart_item_id, created_at desc);
alter table app_private.manual_item_handoff_events enable row level security;
revoke all on app_private.manual_item_handoff_events from public, anon, authenticated;

alter table public.merchant_pages
  add column contact_name text not null default '' check (char_length(contact_name) <= 100),
  add column contact_phone text not null default '' check (contact_phone = '' or contact_phone ~ '^[+0-9() .-]{6,25}$'),
  add column contact_email text not null default '' check (contact_email = '' or (char_length(contact_email) <= 254 and contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  add column contact_website text not null default '' check (contact_website = '' or (char_length(contact_website) <= 2048 and contact_website ~* '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$')),
  add column show_save_contact boolean not null default false,
  add column instapay_identifier text not null default '' check (instapay_identifier = '' or instapay_identifier ~ '^[A-Za-z0-9@._+ -]{5,64}$'),
  add column instapay_recipient text not null default '' check (char_length(instapay_recipient) <= 100),
  add column vodafone_identifier text not null default '' check (vodafone_identifier = '' or vodafone_identifier ~ '^[A-Za-z0-9@._+ -]{5,64}$'),
  add column vodafone_recipient text not null default '' check (char_length(vodafone_recipient) <= 100),
  add constraint merchant_page_instapay_pair check ((instapay_identifier = '') = (instapay_recipient = '')),
  add constraint merchant_page_vodafone_pair check ((vodafone_identifier = '') = (vodafone_recipient = ''));

alter table public.merchant_page_links
  add column icon_key text not null default 'link'
  check (icon_key in ('link', 'website', 'instagram', 'facebook', 'tiktok', 'whatsapp', 'youtube', 'linkedin'));

create function app_private.validate_merchant_page_link_icon()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_host text := lower(substring(new.destination_url from '^https://([^/:?#]+)'));
begin
  if new.icon_key = 'instagram' and not (v_host = 'instagram.com' or v_host like '%.instagram.com') then
    raise exception 'Instagram link must use Instagram';
  elsif new.icon_key = 'facebook' and not (v_host = 'facebook.com' or v_host like '%.facebook.com' or v_host = 'fb.me') then
    raise exception 'Facebook link must use Facebook';
  elsif new.icon_key = 'tiktok' and not (v_host = 'tiktok.com' or v_host like '%.tiktok.com') then
    raise exception 'TikTok link must use TikTok';
  elsif new.icon_key = 'whatsapp' and not (v_host = 'wa.me' or v_host = 'whatsapp.com' or v_host like '%.whatsapp.com') then
    raise exception 'WhatsApp link must use WhatsApp';
  elsif new.icon_key = 'youtube' and not (v_host = 'youtube.com' or v_host like '%.youtube.com' or v_host = 'youtu.be') then
    raise exception 'YouTube link must use YouTube';
  elsif new.icon_key = 'linkedin' and not (v_host = 'linkedin.com' or v_host like '%.linkedin.com') then
    raise exception 'LinkedIn link must use LinkedIn';
  end if;
  return new;
end;
$$;

create trigger merchant_page_link_icon_guard
  before insert or update on public.merchant_page_links
  for each row execute function app_private.validate_merchant_page_link_icon();

create or replace function app_private.publish_landing_page_timestamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_published then
    if tg_op = 'INSERT' then
      new.published_at := coalesce(new.published_at, now());
    else
      new.published_at := coalesce(old.published_at, new.published_at, now());
    end if;
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

create function public.save_merchant_page_experience(
  p_page_id uuid,
  p_display_name text,
  p_short_description text,
  p_avatar_path text,
  p_cover_path text,
  p_is_published boolean,
  p_links jsonb,
  p_extras jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_page_id uuid;
  v_contact_name text := btrim(coalesce(p_extras ->> 'contact_name', ''));
  v_contact_phone text := btrim(coalesce(p_extras ->> 'contact_phone', ''));
  v_contact_email text := btrim(coalesce(p_extras ->> 'contact_email', ''));
  v_contact_website text := btrim(coalesce(p_extras ->> 'contact_website', ''));
  v_instapay_identifier text := btrim(coalesce(p_extras ->> 'instapay_identifier', ''));
  v_instapay_recipient text := btrim(coalesce(p_extras ->> 'instapay_recipient', ''));
  v_vodafone_identifier text := btrim(coalesce(p_extras ->> 'vodafone_identifier', ''));
  v_vodafone_recipient text := btrim(coalesce(p_extras ->> 'vodafone_recipient', ''));
  v_show_save_contact boolean := coalesce((p_extras ->> 'show_save_contact')::boolean, false);
  v_prior_published_at timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_extras, '{}'::jsonb)) <> 'object' then raise exception 'Invalid page options'; end if;
  if char_length(v_contact_name) > 100
     or (v_contact_phone <> '' and v_contact_phone !~ '^[+0-9() .-]{6,25}$')
     or (v_contact_email <> '' and (char_length(v_contact_email) > 254 or v_contact_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
     or (v_contact_website <> '' and (char_length(v_contact_website) > 2048 or v_contact_website !~* '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'))
     or ((v_instapay_identifier = '') <> (v_instapay_recipient = ''))
     or ((v_vodafone_identifier = '') <> (v_vodafone_recipient = ''))
     or (v_instapay_identifier <> '' and v_instapay_identifier !~ '^[A-Za-z0-9@._+ -]{5,64}$')
     or (v_vodafone_identifier <> '' and v_vodafone_identifier !~ '^[A-Za-z0-9@._+ -]{5,64}$')
     or char_length(v_instapay_recipient) > 100 or char_length(v_vodafone_recipient) > 100 then
    raise exception 'Invalid contact or payment details';
  end if;
  if v_show_save_contact and v_contact_phone = '' and v_contact_email = '' then
    raise exception 'A contact card needs a phone or email';
  end if;

  if p_page_id is not null then
    select published_at into v_prior_published_at from public.merchant_pages
    where id = p_page_id and owner_user_id = v_user_id;
  end if;
  -- The existing RPC owns the page and atomically saves/reorders its HTTPS links.
  -- Publish after saving extras so contact/payment-only pages are also valid.
  v_page_id := public.save_merchant_page(
    p_page_id, p_display_name, p_short_description, p_avatar_path,
    p_cover_path, false, p_links
  );
  update public.merchant_pages set
    contact_name = v_contact_name,
    contact_phone = v_contact_phone,
    contact_email = v_contact_email,
    contact_website = v_contact_website,
    show_save_contact = v_show_save_contact,
    instapay_identifier = v_instapay_identifier,
    instapay_recipient = v_instapay_recipient,
    vodafone_identifier = v_vodafone_identifier,
    vodafone_recipient = v_vodafone_recipient
  where id = v_page_id and owner_user_id = v_user_id;

  update public.merchant_page_links l set icon_key = coalesce(x.value ->> 'icon_key', 'link')
  from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) with ordinality as x(value, ordinality)
  where l.page_id = v_page_id and l.sort_order = x.ordinality;
  if p_is_published and not (
    exists (select 1 from public.merchant_page_links l where l.page_id = v_page_id and l.is_enabled)
    or v_contact_phone <> '' or v_contact_email <> ''
    or v_instapay_identifier <> '' or v_vodafone_identifier <> ''
  ) then raise exception 'Publish a page only after adding an active action'; end if;
  update public.merchant_pages set
    is_published = coalesce(p_is_published, false),
    published_at = v_prior_published_at
  where id = v_page_id and owner_user_id = v_user_id;
  return v_page_id;
end;
$$;
revoke all on function public.save_merchant_page_experience(uuid, text, text, text, text, boolean, jsonb, jsonb)
  from public, anon;
grant execute on function public.save_merchant_page_experience(uuid, text, text, text, text, boolean, jsonb, jsonb)
  to authenticated;

create or replace function app_private.validate_smart_item_customer_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_family_key text;
  v_face text;
  v_host text;
  v_allowed_state_change boolean := false;
  v_order_line_sku uuid;
  v_order_state public.order_state;
begin
  if auth.uid() is not null then
    if old.public_id is distinct from new.public_id or old.sku_id is distinct from new.sku_id
       or old.manual_handoff_reference is distinct from new.manual_handoff_reference
       or old.manual_handoff_at is distinct from new.manual_handoff_at
       or old.manual_handoff_by is distinct from new.manual_handoff_by then
      raise exception 'Smart item identity cannot be changed by a customer';
    end if;
    if old.order_line_id is distinct from new.order_line_id then
      if app_private.current_staff_role() not in ('owner', 'admin', 'operations', 'fulfillment') then
        raise exception 'Only operations staff can assign a smart item to an order';
      end if;
      if old.owner_user_id is not null or new.owner_user_id is not null
         or old.state <> 'ready' or new.state <> 'ready' then
        raise exception 'Only unclaimed ready items can be assigned or released';
      end if;
      if new.order_line_id is not null then
        select l.sku_id, o.state into v_order_line_sku, v_order_state
        from public.order_lines l join public.orders o on o.id = l.order_id
        where l.id = new.order_line_id;
        if not found or v_order_line_sku is distinct from new.sku_id
           or v_order_state not in ('new', 'confirmed') then
          raise exception 'Smart item must match an open order line and SKU';
        end if;
      end if;
    end if;
    v_allowed_state_change :=
      (old.owner_user_id is null and new.owner_user_id = (select auth.uid())
          and (old.state = 'ready' or (old.state = 'unassigned' and old.manual_handoff_reference is not null))
          and new.state = 'claimed')
      or (old.owner_user_id = (select auth.uid()) and new.owner_user_id = old.owner_user_id
          and ((old.state = 'claimed' and new.state = 'disabled') or (old.state = 'disabled' and new.state = 'claimed')));
    if old.owner_user_id is distinct from new.owner_user_id and not v_allowed_state_change then
      raise exception 'Smart item ownership can only be set by a valid activation';
    end if;
    if old.state is distinct from new.state and not v_allowed_state_change then
      raise exception 'Invalid smart item state change';
    end if;
  end if;

  select f.family_key, s.options ->> 'face' into v_family_key, v_face
  from public.product_skus s join public.product_families f on f.id = s.product_family_id
  where s.id = new.sku_id;
  if v_family_key is null then raise exception 'Smart item SKU is unavailable'; end if;

  if new.destination_url is not null then
    if new.destination_url !~* '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
      raise exception 'Destination must use HTTPS';
    end if;
    v_host := lower(substring(new.destination_url from '^https://([^/:?#]+)'));
    if v_family_key not in ('stand', 'coaster', 'pvc-card') then
      raise exception 'This product does not support a destination URL';
    end if;
    if v_face = 'review' then
      if not (v_host = 'google.com' or v_host like '%.google.com' or v_host = 'g.page' or v_host = 'maps.app.goo.gl') then
        raise exception 'Google review products require a Google destination';
      end if;
    elsif v_face = 'instagram' then
      if not (v_host = 'instagram.com' or v_host like '%.instagram.com') then
        raise exception 'Instagram products require an Instagram destination';
      end if;
    elsif v_face = 'tiktok' then
      if not (v_host = 'tiktok.com' or v_host like '%.tiktok.com') then
        raise exception 'TikTok products require a TikTok destination';
      end if;
    elsif v_face = 'facebook' then
      if not (v_host = 'facebook.com' or v_host like '%.facebook.com' or v_host = 'fb.me') then
        raise exception 'Facebook products require a Facebook destination';
      end if;
    else
      raise exception 'This printed face does not accept a destination URL';
    end if;
  end if;

  if new.payment_identifier is not null or new.recipient_label is not null then
    if v_family_key not in ('stand', 'coaster', 'pvc-card')
       or v_face not in ('instapay', 'vodafone')
       or char_length(btrim(coalesce(new.recipient_label, ''))) not between 1 and 100
       or coalesce(new.payment_identifier, '') !~ '^[A-Za-z0-9@._+ -]{5,64}$' then
      raise exception 'Payment details must match the printed payment method';
    end if;
  end if;

  if new.landing_page_id is not null and not exists (
    select 1 from public.merchant_pages p
    join public.product_skus s on s.id = new.sku_id
    join public.product_families f on f.id = s.product_family_id
    where p.id = new.landing_page_id and p.owner_user_id = new.owner_user_id
      and f.supports_landing_page and f.family_key in ('stand', 'coaster', 'pvc-card')
      and s.options ->> 'face' = 'all-in-one'
  ) then raise exception 'Landing page is not available for this printed face'; end if;

  new.updated_at := now();
  return new;
end;
$$;

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
    s.options ->> 'face' as face, s.options ->> 'variant' as variant, f.family_key
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
    when v_item.face = 'review' then 'review'
    when v_item.face in ('instapay', 'vodafone') then 'payment'
    when v_item.face in ('instagram', 'tiktok', 'facebook') then 'social'
    when v_item.face = 'all-in-one' then 'all_in_one'
    else 'setup'
  end;

  if v_kind = 'all_in_one' then
    if v_item.landing_page_id is null then return jsonb_build_object('kind', 'setup'); end if;
    select p.id, p.display_name, p.short_description, p.avatar_path, p.cover_path,
      p.contact_name, p.contact_phone, p.contact_email, p.contact_website, p.show_save_contact,
      p.instapay_identifier, p.instapay_recipient, p.vodafone_identifier, p.vodafone_recipient
    into v_page from public.merchant_pages p
    where p.id = v_item.landing_page_id and p.owner_user_id = v_item.owner_user_id and p.is_published;
    if not found then return jsonb_build_object('kind', 'setup'); end if;
    return jsonb_build_object(
      'kind', 'all_in_one', 'printed_face', v_item.face, 'printed_variant', v_item.variant,
      'page', jsonb_build_object(
        'display_name', v_page.display_name,
        'short_description', v_page.short_description,
        'avatar_path', v_page.avatar_path,
        'cover_path', v_page.cover_path,
        'contact_name', v_page.contact_name,
        'contact_phone', v_page.contact_phone,
        'contact_email', v_page.contact_email,
        'contact_website', v_page.contact_website,
        'show_save_contact', v_page.show_save_contact,
        'instapay_identifier', v_page.instapay_identifier,
        'instapay_recipient', v_page.instapay_recipient,
        'vodafone_identifier', v_page.vodafone_identifier,
        'vodafone_recipient', v_page.vodafone_recipient,
        'links', coalesce((
          select jsonb_agg(jsonb_build_object('id', l.id, 'label', l.label, 'icon_key', l.icon_key) order by l.sort_order, l.id)
          from public.merchant_page_links l where l.page_id = v_page.id and l.is_enabled
        ), '[]'::jsonb)
      )
    );
  end if;

  if v_kind = 'payment' and v_item.payment_identifier is not null and v_item.recipient_label is not null then
    return jsonb_build_object('kind', 'payment', 'printed_face', v_item.face,
      'printed_variant', v_item.variant, 'payment_identifier', v_item.payment_identifier,
      'recipient_label', v_item.recipient_label);
  end if;
  if v_kind in ('review', 'social') and v_item.destination_url is not null then
    return jsonb_build_object('kind', v_kind, 'printed_face', v_item.face,
      'printed_variant', v_item.variant, 'destination_url', v_item.destination_url);
  end if;
  return jsonb_build_object('kind', 'setup');
end;
$$;

revoke all on function public.resolve_stand(text) from public;
grant execute on function public.resolve_stand(text) to anon, authenticated;

create or replace function public.claim_stand_activation(p_token_hash text, p_public_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_item_id uuid;
  v_claimed_id uuid;
  v_public_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_token_hash !~ '^[a-fA-F0-9]{64}$' then raise exception 'Invalid activation code'; end if;
  if p_public_id is not null then
    if p_public_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid item';
    end if;
    v_public_id := p_public_id::uuid;
  end if;

  update public.smart_item_activation_tokens t set consumed_at = now()
  where t.id = (
    select token.id
    from public.smart_item_activation_tokens token
    join public.smart_items i on i.id = token.smart_item_id
    where token.token_hash = lower(p_token_hash) and token.consumed_at is null
      and (token.expires_at is null or token.expires_at > now())
      and i.owner_user_id is null
      and (i.state = 'ready' or (i.state = 'unassigned' and i.manual_handoff_reference is not null))
      and (v_public_id is null or i.public_id = v_public_id)
    for update of token, i
  ) returning t.smart_item_id into v_item_id;
  if v_item_id is null then raise exception 'Activation token is invalid, expired, used, or belongs to another item'; end if;

  update public.smart_items i set owner_user_id = v_user_id, state = 'claimed', claimed_at = now()
  where i.id = v_item_id and i.owner_user_id is null
    and (i.state = 'ready' or (i.state = 'unassigned' and i.manual_handoff_reference is not null))
  returning i.id into v_claimed_id;
  if v_claimed_id is null then raise exception 'Smart item is no longer available'; end if;
  return v_claimed_id;
end;
$$;
revoke all on function public.claim_stand_activation(text, text) from public, anon;
grant execute on function public.claim_stand_activation(text, text) to authenticated;
