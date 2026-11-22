-- Preserve per-unit NFC/QR assignment when COD and card reservation logic runs.
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
        if v_rows <> 1 then raise exception 'insufficient stock'; end if;
        insert into public.inventory_reservations(order_line_id,sku_id,quantity)
          values (v_line.id,v_line.sku_id,v_line.quantity);
        insert into public.inventory_movements(sku_id,kind,quantity,order_line_id,reason,created_by)
          values (v_line.sku_id,'reserved',v_line.quantity,v_line.id,'COD order confirmed',(select auth.uid()));
      end loop;
    end if;

    -- Assign the exact prepared physical units to their confirmed order lines.
    for v_line in
      select l.id,l.sku_id,l.quantity
      from public.order_lines l
      join public.product_skus s on s.id = l.sku_id
      join public.product_families f on f.id = s.product_family_id
      where l.order_id = new.id and f.has_nfc_qr
      order by l.sku_id
    loop
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
    end loop;
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

revoke all on function app_private.apply_order_stock_transition() from public, anon, authenticated;
