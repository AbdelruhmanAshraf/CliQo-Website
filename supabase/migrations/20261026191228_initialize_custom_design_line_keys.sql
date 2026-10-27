-- Correct explicit empty text-array initialization for the custom order validator.
create or replace function app_private.create_cod_order(
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
  v_seen text[] := array[]::text[];
  v_line_key text;
  v_family_key text;
  v_design text;
  v_business_name text;
  v_destination_url text;
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
    if v_qty not between 1 and 20 then raise exception 'invalid quantity'; end if;
    select * into v_sku from public.product_skus where id = v_sku_id for share;
    if not found or v_sku.state <> 'ready' or not v_sku.price_approved
       or not v_sku.sample_approved or not v_sku.fulfillment_approved
       or v_sku.price_minor is null then
      raise exception 'SKU is not approved for sale';
    end if;
    select family_key into v_family_key from public.product_families where id = v_sku.product_family_id;
    v_design := nullif(v_sku.options->>'design', '');
    v_business_name := nullif(pg_catalog.btrim(v_line->>'business_name'), '');
    v_destination_url := nullif(pg_catalog.btrim(v_line->>'destination_url'), '');
    if v_family_key = 'stand' and v_design in ('T1', 'T2') then
      if v_business_name is null or char_length(v_business_name) > 100
         or v_destination_url is null or char_length(v_destination_url) > 2048
         or v_destination_url !~* '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
        raise exception 'custom design requires a business name and HTTPS destination';
      end if;
    elsif v_business_name is not null or v_destination_url is not null then
      raise exception 'custom design details do not match this SKU';
    end if;
    v_line_key := pg_catalog.jsonb_build_object(
      'sku_id', v_sku_id, 'design', coalesce(v_design, ''),
      'business_name', coalesce(v_business_name, ''),
      'destination_url', coalesce(v_destination_url, '')
    )::text;
    if v_line_key = any(v_seen) then raise exception 'duplicate cart line'; end if;
    v_seen := pg_catalog.array_append(v_seen, v_line_key);

    select on_hand - reserved into v_available from public.inventory_balances
      where sku_id = v_sku_id;
    if v_available is null or v_available < v_qty then raise exception 'insufficient stock'; end if;
    v_subtotal := v_subtotal + v_sku.price_minor::bigint * v_qty;
    v_validated := v_validated || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'sku_id', v_sku.id, 'sku_code', v_sku.sku_code,
        'name', v_sku.display_name, 'options', v_sku.options,
        'quantity', v_qty, 'price_minor', v_sku.price_minor,
        'design_tier', case when v_family_key = 'stand' and v_design in ('T1', 'T2') then v_design else null end,
        'business_name', v_business_name, 'destination_url', v_destination_url
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
      options_snapshot, quantity, unit_price_minor, line_total_minor,
      state, design_request_url, design_business_name
    ) values (
      v_order_id, (v_line->>'sku_id')::uuid, v_line->>'sku_code', v_line->>'name',
      v_line->'options', (v_line->>'quantity')::integer,
      (v_line->>'price_minor')::integer,
      (v_line->>'quantity')::integer * (v_line->>'price_minor')::integer,
      case when v_line->>'design_tier' in ('T1', 'T2') then 'awaiting_design'::public.order_line_state else 'pending'::public.order_line_state end,
      v_line->>'destination_url', v_line->>'business_name'
    );
  end loop;
  created_order_id := v_order_id;
  created_order_reference := v_reference;
  return next;
end;
$$;
revoke all on function app_private.create_cod_order(text,text,text,text,jsonb,text,jsonb)
  from public, anon, authenticated;
