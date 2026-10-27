CREATE OR REPLACE FUNCTION app_private.create_cod_order(p_key_hash text, p_name text, p_phone text, p_email text, p_address jsonb, p_note text, p_lines jsonb)
 RETURNS TABLE(created_order_id uuid, created_order_reference text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_config app_private.checkout_config%rowtype;
  v_existing public.orders%rowtype;
  v_line jsonb;
  v_sku public.product_skus%rowtype;
  v_sku_id uuid;
  v_qty integer;
  v_available integer;
  v_seen uuid[] := ARRAY[]::uuid[];
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
$function$

