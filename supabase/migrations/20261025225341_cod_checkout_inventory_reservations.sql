-- Guest COD checkout is locked until a carrier, rate and sale approval are set.
-- The private functions are called only by the Next.js server over its private DB connection.

create table app_private.checkout_config (
  id boolean primary key default true check (id),
  sales_enabled boolean not null default false,
  cod_enabled boolean not null default false,
  carrier_name text check (carrier_name is null or char_length(carrier_name) between 2 and 120),
  shipping_minor integer check (shipping_minor is null or shipping_minor >= 0),
  updated_at timestamptz not null default now()
);
insert into app_private.checkout_config (id) values (true);
alter table app_private.checkout_config enable row level security;
revoke all on app_private.checkout_config from public, anon, authenticated;

create function app_private.create_cod_order(
  p_key_hash text,
  p_name text,
  p_phone text,
  p_email text,
  p_address jsonb,
  p_note text,
  p_lines jsonb
)
returns table(created_order_id uuid, created_order_reference text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_config app_private.checkout_config%rowtype;
  v_existing public.orders%rowtype;
  v_line jsonb;
  v_sku public.product_skus%rowtype;
  v_sku_id uuid;
  v_qty integer;
  v_available integer;
  v_seen uuid[] := '{}';
  v_validated jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_customer_id uuid;
  v_order_id uuid;
  v_reference text;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid request key'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key_hash, 0));
  select * into v_existing from public.orders where idempotency_key = p_key_hash;
  if found then
    created_order_id := v_existing.id;
    created_order_reference := v_existing.order_reference;
    return next;
    return;
  end if;

  select * into v_config from app_private.checkout_config where id = true for share;
  if not found or not v_config.sales_enabled or not v_config.cod_enabled
     or v_config.carrier_name is null or v_config.shipping_minor is null then
    raise exception 'checkout is closed';
  end if;
  if p_name is null or char_length(pg_catalog.btrim(p_name)) not between 1 and 140
     or p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$'
     or (p_email is not null and char_length(p_email) > 254)
     or (p_note is not null and char_length(p_note) > 1000) then
    raise exception 'invalid contact details';
  end if;
  if p_address is null or pg_catalog.jsonb_typeof(p_address) <> 'object'
     or p_address->>'governorate' is null
     or p_address->>'city' is null or p_address->>'street' is null
     or char_length(pg_catalog.btrim(p_address->>'governorate')) not between 2 and 100
     or char_length(pg_catalog.btrim(p_address->>'city')) not between 2 and 100
     or char_length(pg_catalog.btrim(p_address->>'street')) not between 3 and 250 then
    raise exception 'invalid delivery address';
  end if;
  if p_lines is null or pg_catalog.jsonb_typeof(p_lines) <> 'array'
     or pg_catalog.jsonb_array_length(p_lines) not between 1 and 20 then
    raise exception 'invalid cart';
  end if;

  for v_line in
    select value from pg_catalog.jsonb_array_elements(p_lines) order by value->>'sku_id'
  loop
    if pg_catalog.jsonb_typeof(v_line) <> 'object'
       or v_line->>'sku_id' is null or v_line->>'quantity' is null
       or (v_line->>'sku_id') !~ '^[0-9a-f-]{36}$'
       or (v_line->>'quantity') !~ '^[0-9]{1,2}$' then
      raise exception 'invalid cart line';
    end if;
    v_sku_id := (v_line->>'sku_id')::uuid;
    v_qty := (v_line->>'quantity')::integer;
    if v_qty not between 1 and 20 or v_sku_id = any(v_seen) then
      raise exception 'invalid quantity or duplicate SKU';
    end if;
    v_seen := pg_catalog.array_append(v_seen, v_sku_id);
    select * into v_sku from public.product_skus where id = v_sku_id for share;
    if not found or v_sku.state <> 'ready' or not v_sku.price_approved
       or not v_sku.sample_approved or not v_sku.fulfillment_approved
       or v_sku.price_minor is null then
      raise exception 'SKU is not approved for sale';
    end if;
    select on_hand - reserved into v_available from public.inventory_balances
      where sku_id = v_sku_id;
    if v_available is null or v_available < v_qty then
      raise exception 'insufficient stock';
    end if;
    v_subtotal := v_subtotal + v_sku.price_minor::bigint * v_qty;
    v_validated := v_validated || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'sku_id', v_sku.id, 'sku_code', v_sku.sku_code,
        'name', v_sku.display_name, 'options', v_sku.options,
        'quantity', v_qty, 'price_minor', v_sku.price_minor
      )
    );
  end loop;
  if v_subtotal + v_config.shipping_minor > 2000000000 then
    raise exception 'order total exceeds limit';
  end if;

  insert into public.customers(full_name, phone_e164, email)
    values (pg_catalog.btrim(p_name), p_phone, p_email)
    on conflict (phone_e164) do nothing;
  select id into v_customer_id from public.customers where phone_e164 = p_phone;

  insert into public.orders (
    customer_id, customer_name_snapshot, phone_snapshot, email_snapshot,
    shipping_address, customer_note, payment_method, payment_state,
    subtotal_minor, shipping_minor, total_minor, idempotency_key, tracking_token_hash
  ) values (
    v_customer_id, pg_catalog.btrim(p_name), p_phone, p_email,
    p_address, p_note, 'cod', 'cod_to_collect',
    v_subtotal::integer, v_config.shipping_minor,
    (v_subtotal + v_config.shipping_minor)::integer, p_key_hash, p_key_hash
  ) returning id, order_reference into v_order_id, v_reference;

  for v_line in select value from pg_catalog.jsonb_array_elements(v_validated) loop
    insert into public.order_lines (
      order_id, sku_id, sku_code_snapshot, product_name_snapshot,
      options_snapshot, quantity, unit_price_minor, line_total_minor
    ) values (
      v_order_id, (v_line->>'sku_id')::uuid, v_line->>'sku_code', v_line->>'name',
      v_line->'options', (v_line->>'quantity')::integer,
      (v_line->>'price_minor')::integer,
      (v_line->>'quantity')::integer * (v_line->>'price_minor')::integer
    );
  end loop;
  created_order_id := v_order_id;
  created_order_reference := v_reference;
  return next;
end;
$$;
revoke all on function app_private.create_cod_order(text,text,text,text,jsonb,text,jsonb)
  from public, anon, authenticated;

-- Reserve COD stock only when the owner confirms the order. Release on cancellation;
-- consume it when the packed order becomes ready to ship.
create function app_private.apply_order_stock_transition()
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
  if new.state = 'cancelled' and old.state in ('ready_to_ship','shipped','delivered','returned') then
    raise exception 'packed or shipped orders need a return workflow';
  end if;
  if new.state = 'returned' and old.state not in ('shipped','delivered') then
    raise exception 'only shipped orders can be returned';
  end if;
  if new.state = 'confirmed' and old.state = 'new' then
    if new.payment_method = 'card' and new.payment_state <> 'paid' then
      raise exception 'card payment must be verified first';
    end if;
    for v_line in
      select id, sku_id, quantity from public.order_lines
      where order_id = new.id order by sku_id
    loop
      v_count := v_count + 1;
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
    if v_count = 0 then raise exception 'empty order cannot be confirmed'; end if;
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
revoke all on function app_private.apply_order_stock_transition()
  from public, anon, authenticated;
create trigger orders_apply_stock_before_state
  before update of state on public.orders
  for each row execute function app_private.apply_order_stock_transition();

create function app_private.receive_stock(
  p_sku_id uuid, p_quantity integer, p_reason text, p_actor uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sku public.product_skus%rowtype;
begin
  if p_quantity not between 1 and 10000
     or p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 3 and 500
     or p_actor is null then raise exception 'invalid stock receipt'; end if;
  select * into v_sku from public.product_skus where id = p_sku_id for share;
  if not found or v_sku.state <> 'ready' or not v_sku.sample_approved
     or not v_sku.price_approved or not v_sku.fulfillment_approved then
    raise exception 'SKU is not approved';
  end if;
  insert into public.inventory_balances(sku_id,on_hand,reserved)
    values (p_sku_id,p_quantity,0)
    on conflict (sku_id) do update set on_hand = public.inventory_balances.on_hand + excluded.on_hand;
  insert into public.inventory_movements(sku_id,kind,quantity,reason,created_by)
    values (p_sku_id,'received',p_quantity,pg_catalog.btrim(p_reason),p_actor);
end;
$$;
revoke all on function app_private.receive_stock(uuid,integer,text,uuid)
  from public, anon, authenticated;
