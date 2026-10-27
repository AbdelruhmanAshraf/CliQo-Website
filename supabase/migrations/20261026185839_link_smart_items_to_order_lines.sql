-- Allocate one ready physical smart item per ordered unit at confirmation.
-- Keep item identity, stock reservation, and order state in the same transaction.

create index smart_items_available_sku_idx
  on public.smart_items (sku_id, created_at, id)
  where order_line_id is null and owner_user_id is null and state = 'ready';

create or replace function app_private.validate_smart_item_customer_update()
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
  v_order_line_sku uuid;
  v_order_state public.order_state;
begin
  if auth.uid() is not null then
    if old.public_id is distinct from new.public_id
       or old.sku_id is distinct from new.sku_id then
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
        from public.order_lines l
        join public.orders o on o.id = l.order_id
        where l.id = new.order_line_id;
        if not found or v_order_line_sku is distinct from new.sku_id
           or v_order_state not in ('new', 'confirmed') then
          raise exception 'Smart item must match an open order line and SKU';
        end if;
      end if;
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
  v_has_nfc_qr boolean;
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
      select f.has_nfc_qr into v_has_nfc_qr
      from public.product_skus s
      join public.product_families f on f.id = s.product_family_id
      where s.id = v_line.sku_id;
      if not found then raise exception 'order line SKU is unavailable'; end if;
      update public.inventory_balances
        set reserved = reserved + v_line.quantity
        where sku_id = v_line.sku_id and on_hand - reserved >= v_line.quantity;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'insufficient stock for confirmation'; end if;
      insert into public.inventory_reservations(order_line_id,sku_id,quantity)
        values (v_line.id,v_line.sku_id,v_line.quantity);
      insert into public.inventory_movements(sku_id,kind,quantity,order_line_id,reason,created_by)
        values (v_line.sku_id,'reserved',v_line.quantity,v_line.id,'Order confirmed',(select auth.uid()));
      if v_has_nfc_qr then
        with candidates as (
          select i.id
          from public.smart_items i
          where i.sku_id = v_line.sku_id and i.order_line_id is null
            and i.owner_user_id is null and i.state = 'ready'
          order by i.created_at, i.id
          limit v_line.quantity
          for update skip locked
        )
        update public.smart_items i set order_line_id = v_line.id
        from candidates c
        where i.id = c.id and i.order_line_id is null
          and i.owner_user_id is null and i.state = 'ready';
        get diagnostics v_rows = row_count;
        if v_rows <> v_line.quantity then raise exception 'not enough prepared smart units for order'; end if;
      end if;
    end loop;
    if v_count = 0 then raise exception 'empty order cannot be confirmed'; end if;
  elsif new.state = 'cancelled' then
    for v_reservation in
      select r.id,r.sku_id,r.quantity,r.order_line_id,f.has_nfc_qr
      from public.inventory_reservations r
      join public.order_lines l on l.id = r.order_line_id
      join public.product_skus s on s.id = r.sku_id
      join public.product_families f on f.id = s.product_family_id
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
      if v_reservation.has_nfc_qr then
        update public.smart_items set order_line_id = null
        where order_line_id = v_reservation.order_line_id
          and sku_id = v_reservation.sku_id and owner_user_id is null and state = 'ready';
        get diagnostics v_rows = row_count;
        if v_rows not in (0, v_reservation.quantity) then
          raise exception 'smart item assignment is incomplete';
        end if;
      end if;
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
