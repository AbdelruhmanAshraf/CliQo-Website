-- Private server-side records for Paymob hosted card checkout. No card data is stored here.
create table app_private.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null default 'paymob' check (provider = 'paymob'),
  attempt_number integer not null check (attempt_number between 1 and 100),
  status text not null default 'creating'
    check (status in ('creating', 'pending', 'succeeded', 'failed', 'expired', 'late_success', 'refunded')),
  provider_intention_id text check (provider_intention_id is null or char_length(provider_intention_id) between 1 and 160),
  provider_order_id text check (provider_order_id is null or char_length(provider_order_id) between 1 and 80),
  checkout_url text check (checkout_url is null or char_length(checkout_url) <= 2048),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'EGP' check (currency = 'EGP'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, attempt_number),
  unique (provider, provider_order_id)
);
alter table app_private.payment_attempts enable row level security;
revoke all on app_private.payment_attempts from public, anon, authenticated;
create index payment_attempts_expiry_idx on app_private.payment_attempts(status, expires_at)
  where status in ('creating', 'pending');
create index payment_attempts_order_idx on app_private.payment_attempts(order_id, created_at desc);

-- Keep only the provider transaction identifier and state needed for reconciliation; never retain callback PII.
create table app_private.payment_events (
  id bigint generated always as identity primary key,
  provider text not null default 'paymob' check (provider = 'paymob'),
  provider_transaction_id text not null check (char_length(provider_transaction_id) between 1 and 80),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  payment_attempt_id uuid not null references app_private.payment_attempts(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null check (currency = 'EGP'),
  outcome text not null check (outcome in ('pending', 'succeeded', 'failed', 'refunded', 'voided')),
  created_at timestamptz not null default now(),
  unique (provider, provider_transaction_id, payload_hash)
);
alter table app_private.payment_events enable row level security;
revoke all on app_private.payment_events from public, anon, authenticated;
create index payment_events_order_idx on app_private.payment_events(order_id, created_at desc);

comment on table app_private.payment_attempts is
  'Private Paymob intention state. checkout_url contains a single-use provider token and is server-only.';
comment on table app_private.payment_events is
  'Minimal, PII-free Paymob callback ledger used for duplicate prevention and reconciliation.';

-- Card stock is reserved before redirect to Paymob. On confirmation, validate that reservation rather
-- than reserving it a second time. COD still reserves when the owner confirms the order.
create or replace function app_private.apply_order_stock_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_reservation record;
  v_rows integer;
  v_count integer := 0;
  v_reserved_count integer := 0;
begin
  if new.state = old.state then return new; end if;
  if (select auth.uid()) is null
     or app_private.current_staff_role() not in ('owner', 'admin', 'operations', 'fulfillment') then
    raise exception 'not allowed to change order stock state';
  end if;
  if old.state = 'new' and new.state not in ('confirmed', 'cancelled') then
    raise exception 'confirm the order before processing';
  end if;
  if old.state = 'cancelled' then raise exception 'cancelled orders cannot be reopened'; end if;
  if new.state = 'cancelled' and old.payment_method = 'card' and old.payment_state not in ('failed','refunded') then
    raise exception 'card orders must be failed or refunded before cancellation';
  end if;
  if new.state = 'cancelled' and old.state in ('ready_to_ship','shipped','delivered','returned') then
    raise exception 'packed or shipped orders need a return workflow';
  end if;
  if new.state = 'returned' and old.state not in ('shipped','delivered') then
    raise exception 'only shipped orders can be returned';
  end if;
  if new.payment_method = 'card'
     and new.state in ('confirmed','awaiting_design','in_production','quality_check','ready_to_ship')
     and new.payment_state <> 'paid' then
    raise exception 'card payment must be verified first';
  end if;
  if new.state = 'confirmed' and old.state = 'new' then
    select count(*) into v_count from public.order_lines where order_id = new.id;
    if v_count = 0 then raise exception 'empty order cannot be confirmed'; end if;
    if new.payment_method = 'card' then
      select count(*) into v_reserved_count
      from public.inventory_reservations r
      join public.order_lines l on l.id = r.order_line_id
      where l.order_id = new.id and r.state = 'reserved' and r.sku_id = l.sku_id and r.quantity = l.quantity;
      if v_reserved_count <> v_count then raise exception 'card order stock is not reserved'; end if;
    else
      for v_line in
        select id, sku_id, quantity from public.order_lines
        where order_id = new.id order by sku_id
      loop
        if v_line.sku_id is null then raise exception 'order line has no SKU'; end if;
        update public.inventory_balances
          set reserved = reserved + v_line.quantity
          where sku_id = v_line.sku_id and on_hand - reserved >= v_line.quantity;
        get diagnostics v_rows = row_count;
        if v_rows <> 1 then raise exception 'insufficient stock for confirmation'; end if;
        insert into public.inventory_reservations(order_line_id,sku_id,quantity)
          values (v_line.id,v_line.sku_id,v_line.quantity);
        insert into public.inventory_movements(sku_id,kind,quantity,order_line_id,reason,created_by)
          values (v_line.sku_id,'reserved',v_line.quantity,v_line.id,'COD order confirmed',(select auth.uid()));
      end loop;
    end if;
  elsif new.state = 'cancelled' then
    for v_reservation in
      select r.id,r.sku_id,r.quantity,r.order_line_id
      from public.inventory_reservations r
      join public.order_lines l on l.id = r.order_line_id
      where l.order_id = new.id and r.state = 'reserved'
      order by r.sku_id
    loop
      update public.inventory_balances
        set reserved = reserved - v_reservation.quantity
        where sku_id = v_reservation.sku_id and reserved >= v_reservation.quantity;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'invalid reservation balance'; end if;
      update public.inventory_reservations set state = 'released' where id = v_reservation.id;
      insert into public.inventory_movements(sku_id,kind,quantity,order_line_id,reason,created_by)
        values (v_reservation.sku_id,'released',v_reservation.quantity,v_reservation.order_line_id,'Order cancelled',(select auth.uid()));
    end loop;
  elsif new.state in ('ready_to_ship','shipped','delivered') then
    select count(*) into v_count from public.order_lines where order_id = new.id;
    if v_count = 0 or v_count <> (
      select count(*) from public.inventory_reservations r
      join public.order_lines l on l.id = r.order_line_id
      where l.order_id = new.id and r.state in ('reserved','consumed')
    ) then raise exception 'order stock is not reserved'; end if;
    for v_reservation in
      select r.id,r.sku_id,r.quantity,r.order_line_id
      from public.inventory_reservations r
      join public.order_lines l on l.id = r.order_line_id
      where l.order_id = new.id and r.state = 'reserved'
      order by r.sku_id
    loop
      update public.inventory_balances
        set on_hand = on_hand - v_reservation.quantity,
            reserved = reserved - v_reservation.quantity
        where sku_id = v_reservation.sku_id
          and reserved >= v_reservation.quantity and on_hand >= v_reservation.quantity;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'invalid balance for fulfillment'; end if;
      update public.inventory_reservations set state = 'consumed' where id = v_reservation.id;
      insert into public.inventory_movements(sku_id,kind,quantity,order_line_id,reason,created_by)
        values (v_reservation.sku_id,'consumed',v_reservation.quantity,v_reservation.order_line_id,'Order packed',(select auth.uid()));
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function app_private.apply_order_stock_transition() from public, anon, authenticated;

