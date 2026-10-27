-- CliQo commerce + CRM foundation. No card, shipping, or activation secrets live here.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create type public.product_state as enum ('planned', 'preparing', 'ready', 'paused');
create type public.sku_state as enum ('preparing', 'ready', 'paused');
create type public.staff_role as enum ('owner', 'admin', 'operations', 'fulfillment', 'support');
create type public.order_state as enum (
  'new', 'confirmed', 'awaiting_design', 'in_production', 'quality_check',
  'ready_to_ship', 'shipped', 'delivered', 'cancelled', 'returned'
);
create type public.order_line_state as enum (
  'pending', 'awaiting_design', 'in_production', 'quality_check', 'ready'
);
create type public.payment_method as enum ('card', 'cod');
create type public.payment_state as enum (
  'pending', 'paid', 'failed', 'cod_to_collect', 'cod_collected', 'cod_settled', 'refunded'
);
create type public.inventory_movement_kind as enum (
  'received', 'adjusted', 'reserved', 'released', 'consumed', 'damaged'
);
create type public.reservation_state as enum ('reserved', 'released', 'consumed');
create type public.smart_item_state as enum ('unassigned', 'ready', 'claimed', 'disabled');

create sequence public.order_reference_seq start with 1001;

create table public.product_families (
  id uuid primary key default gen_random_uuid(),
  family_key text not null unique check (family_key ~ '^[a-z0-9-]{2,40}$'),
  name_ar text not null,
  name_en text not null,
  state public.product_state not null default 'planned',
  supports_landing_page boolean not null default false,
  has_nfc_qr boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_skus (
  id uuid primary key default gen_random_uuid(),
  product_family_id uuid not null references public.product_families(id) on delete restrict,
  sku_code text not null unique check (sku_code ~ '^[A-Z0-9-]{3,40}$'),
  display_name text not null,
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  state public.sku_state not null default 'preparing',
  currency text not null default 'EGP' check (currency = 'EGP'),
  price_minor integer check (price_minor is null or price_minor > 0),
  price_approved boolean not null default false,
  sample_approved boolean not null default false,
  fulfillment_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ready_sku_has_all_approvals check (
    state <> 'ready' or (price_minor is not null and price_approved and sample_approved and fulfillment_approved)
  )
);

create table public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role public.staff_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS reads only the caller's own staff row. This avoids SECURITY DEFINER role helpers.
create function app_private.current_staff_role()
returns public.staff_role
language sql
stable
security invoker
set search_path = ''
as $$
  select sm.role
  from public.staff_members as sm
  where sm.user_id = (select auth.uid()) and sm.is_active
  limit 1;
$$;
grant execute on function app_private.current_staff_role() to authenticated;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 140),
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or char_length(email) <= 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique default (
    'CQ-' || lpad(nextval('public.order_reference_seq')::text, 6, '0')
  ),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name_snapshot text not null check (char_length(customer_name_snapshot) between 1 and 140),
  phone_snapshot text not null check (char_length(phone_snapshot) between 8 and 32),
  email_snapshot text check (email_snapshot is null or char_length(email_snapshot) <= 254),
  shipping_address jsonb not null check (jsonb_typeof(shipping_address) = 'object'),
  customer_note text check (customer_note is null or char_length(customer_note) <= 1000),
  payment_method public.payment_method not null,
  payment_state public.payment_state not null default 'pending',
  state public.order_state not null default 'new',
  currency text not null default 'EGP' check (currency = 'EGP'),
  subtotal_minor integer not null check (subtotal_minor >= 0),
  shipping_minor integer not null default 0 check (shipping_minor >= 0),
  discount_minor integer not null default 0 check (discount_minor >= 0),
  total_minor integer not null check (total_minor >= 0),
  idempotency_key text unique check (idempotency_key is null or char_length(idempotency_key) between 16 and 160),
  tracking_token_hash text unique check (tracking_token_hash is null or tracking_token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_total_matches_components check (total_minor = subtotal_minor + shipping_minor - discount_minor),
  constraint cod_payment_state check (
    payment_method <> 'cod' or payment_state in ('pending', 'cod_to_collect', 'cod_collected', 'cod_settled', 'refunded', 'failed')
  ),
  constraint card_payment_state check (
    payment_method <> 'card' or payment_state in ('pending', 'paid', 'failed', 'refunded')
  )
);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sku_id uuid references public.product_skus(id) on delete set null,
  sku_code_snapshot text not null,
  product_name_snapshot text not null,
  options_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(options_snapshot) = 'object'),
  quantity integer not null check (quantity between 1 and 100),
  unit_price_minor integer not null check (unit_price_minor >= 0),
  line_total_minor integer not null check (line_total_minor = quantity * unit_price_minor),
  state public.order_line_state not null default 'pending',
  design_request_url text check (design_request_url is null or (design_request_url ~* '^https://' and char_length(design_request_url) <= 2048)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_status_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  from_state public.order_state,
  to_state public.order_state not null,
  changed_by uuid references auth.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create table public.order_line_status_events (
  id bigint generated always as identity primary key,
  order_line_id uuid not null references public.order_lines(id) on delete restrict,
  from_state public.order_line_state,
  to_state public.order_line_state not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.order_notes (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.inventory_balances (
  sku_id uuid primary key references public.product_skus(id) on delete restrict,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= on_hand),
  updated_at timestamptz not null default now()
);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  sku_id uuid not null references public.product_skus(id) on delete restrict,
  kind public.inventory_movement_kind not null,
  quantity integer not null check (quantity > 0),
  order_line_id uuid references public.order_lines(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_line_id uuid not null references public.order_lines(id) on delete cascade,
  sku_id uuid not null references public.product_skus(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 100),
  state public.reservation_state not null default 'reserved',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_line_id, sku_id)
);

-- One record per physical NFC/QR unit; the public UUID never serves as an ownership secret.
create table public.smart_items (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  sku_id uuid not null references public.product_skus(id) on delete restrict,
  order_line_id uuid references public.order_lines(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  state public.smart_item_state not null default 'unassigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_line_id uuid references public.order_lines(id) on delete set null,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'),
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index product_skus_family_idx on public.product_skus(product_family_id, state);
create index orders_state_created_idx on public.orders(state, created_at desc);
create index orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index order_lines_order_idx on public.order_lines(order_id, created_at);
create index order_events_order_created_idx on public.order_status_events(order_id, created_at desc);
create index order_line_events_created_idx on public.order_line_status_events(order_line_id, created_at desc);
create index order_notes_order_created_idx on public.order_notes(order_id, created_at desc);
create index inventory_movements_sku_created_idx on public.inventory_movements(sku_id, created_at desc);
create index smart_items_order_line_idx on public.smart_items(order_line_id);

create function app_private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function app_private.audit_order_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_events (order_id, from_state, to_state, changed_by)
    values (new.id, null, new.state, (select auth.uid()));
  elsif new.state is distinct from old.state then
    insert into public.order_status_events (order_id, from_state, to_state, changed_by)
    values (new.id, old.state, new.state, (select auth.uid()));
  end if;
  return new;
end;
$$;

create function app_private.audit_order_line_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_line_status_events (order_line_id, from_state, to_state, changed_by)
    values (new.id, null, new.state, (select auth.uid()));
  elsif new.state is distinct from old.state then
    insert into public.order_line_status_events (order_line_id, from_state, to_state, changed_by)
    values (new.id, old.state, new.state, (select auth.uid()));
  end if;
  return new;
end;
$$;

revoke all on function app_private.audit_order_state_change() from public, anon, authenticated;
revoke all on function app_private.audit_order_line_state_change() from public, anon, authenticated;

create trigger orders_audit_state after insert or update of state on public.orders
  for each row execute function app_private.audit_order_state_change();
create trigger order_lines_audit_state after insert or update of state on public.order_lines
  for each row execute function app_private.audit_order_line_state_change();

create trigger product_families_touch_updated_at before update on public.product_families for each row execute function app_private.touch_updated_at();
create trigger product_skus_touch_updated_at before update on public.product_skus for each row execute function app_private.touch_updated_at();
create trigger staff_members_touch_updated_at before update on public.staff_members for each row execute function app_private.touch_updated_at();
create trigger customers_touch_updated_at before update on public.customers for each row execute function app_private.touch_updated_at();
create trigger orders_touch_updated_at before update on public.orders for each row execute function app_private.touch_updated_at();
create trigger order_lines_touch_updated_at before update on public.order_lines for each row execute function app_private.touch_updated_at();
create trigger inventory_balances_touch_updated_at before update on public.inventory_balances for each row execute function app_private.touch_updated_at();
create trigger inventory_reservations_touch_updated_at before update on public.inventory_reservations for each row execute function app_private.touch_updated_at();
create trigger smart_items_touch_updated_at before update on public.smart_items for each row execute function app_private.touch_updated_at();

alter table public.product_families enable row level security;
alter table public.product_skus enable row level security;
alter table public.staff_members enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_status_events enable row level security;
alter table public.order_line_status_events enable row level security;
alter table public.order_notes enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.smart_items enable row level security;
alter table public.order_files enable row level security;

revoke all on public.product_families, public.product_skus, public.staff_members, public.customers,
  public.orders, public.order_lines, public.order_status_events, public.order_line_status_events, public.order_notes,
  public.inventory_balances, public.inventory_movements, public.inventory_reservations,
  public.smart_items, public.order_files from anon, authenticated;
revoke all on sequence public.order_reference_seq from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant usage, select on sequence public.order_reference_seq to service_role;

grant select (id, family_key, name_ar, name_en, state, supports_landing_page, has_nfc_qr, sort_order)
  on public.product_families to anon, authenticated;
grant select (id, product_family_id, sku_code, display_name, options, currency, price_minor)
  on public.product_skus to anon, authenticated;
grant select on public.staff_members to authenticated;
grant select on public.customers to authenticated;
grant select on public.orders to authenticated;
grant update (state) on public.orders to authenticated;
grant select on public.order_lines to authenticated;
grant update (state) on public.order_lines to authenticated;
grant select on public.order_status_events to authenticated;
grant select on public.order_line_status_events to authenticated;
grant select, insert on public.order_notes to authenticated;
grant select on public.inventory_balances, public.inventory_movements,
  public.inventory_reservations to authenticated;
grant select on public.smart_items to authenticated;
grant select, insert on public.order_files to authenticated;
grant usage, select on sequence public.order_status_events_id_seq, public.order_line_status_events_id_seq,
  public.order_notes_id_seq to authenticated;
grant all on public.product_families, public.product_skus, public.staff_members, public.customers,
  public.orders, public.order_lines, public.order_status_events, public.order_line_status_events,
  public.order_notes, public.inventory_balances, public.inventory_movements,
  public.inventory_reservations, public.smart_items, public.order_files to service_role;
grant usage, select on sequence public.order_reference_seq, public.order_status_events_id_seq,
  public.order_line_status_events_id_seq, public.order_notes_id_seq to service_role;

create policy "public reads product families" on public.product_families
  for select to anon, authenticated using (state <> 'paused');
create policy "public reads approved sale skus" on public.product_skus
  for select to anon, authenticated using (
    state = 'ready' and price_approved and sample_approved and fulfillment_approved and price_minor is not null
  );
create policy "staff reads own membership" on public.staff_members
  for select to authenticated using (user_id = (select auth.uid()));

create policy "staff reads customers" on public.customers
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'support')
  );
create policy "staff reads orders" on public.orders
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment', 'support')
  );
create policy "operations updates order state" on public.orders
  for update to authenticated
  using (app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment'))
  with check (app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment'));
create policy "staff reads order lines" on public.order_lines
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment', 'support')
  );
create policy "operations updates line state" on public.order_lines
  for update to authenticated
  using (app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment'))
  with check (app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment'));
create policy "staff reads order status events" on public.order_status_events
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment', 'support')
  );
create policy "staff reads order line status events" on public.order_line_status_events
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment', 'support')
  );
create policy "staff reads order notes" on public.order_notes
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment', 'support')
  );
create policy "staff adds own order notes" on public.order_notes
  for insert to authenticated with check (
    author_id = (select auth.uid()) and
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment', 'support')
  );
create policy "inventory staff reads balances" on public.inventory_balances
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment')
  );
create policy "inventory staff reads movements" on public.inventory_movements
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment')
  );
create policy "inventory staff reads reservations" on public.inventory_reservations
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment')
  );
create policy "staff reads smart item registry" on public.smart_items
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment', 'support')
  );
create policy "design staff reads order files" on public.order_files
  for select to authenticated using (
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment')
  );
create policy "design staff records order files" on public.order_files
  for insert to authenticated with check (
    uploaded_by = (select auth.uid()) and
    split_part(storage_path, '/', 1) = order_id::text and
    exists (select 1 from public.orders o where o.id = order_id) and
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment')
  );

insert into public.product_families (family_key, name_ar, name_en, state, supports_landing_page, sort_order)
values
  ('stand', 'ستاند أكريليك', 'Acrylic stand', 'preparing', true, 1),
  ('coaster', 'كوستر ذكي', 'Smart Coaster', 'planned', true, 2),
  ('pvc-card', 'كارت PVC ذكي', 'Smart PVC card', 'planned', true, 3),
  ('wallet', 'محفظة عادية', 'Standard wallet', 'planned', false, 4),
  ('magnetic-wallet', 'محفظة مغناطيسية', 'Magnetic wallet', 'planned', false, 5),
  ('keychain', 'ميدالية ذكية', 'Smart keychain', 'planned', false, 6);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-designs', 'order-designs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "design staff reads private order files" on storage.objects
  for select to authenticated using (
    bucket_id = 'order-designs' and
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment')
  );
create policy "design staff uploads private order files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'order-designs' and
    app_private.current_staff_role() in ('owner', 'admin', 'operations', 'fulfillment') and
    exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1])
  );
