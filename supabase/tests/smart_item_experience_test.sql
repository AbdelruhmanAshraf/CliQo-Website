begin;

do $$
declare
  v_owner uuid;
  v_family uuid;
  v_page uuid;
  v_sku uuid;
  v_item uuid;
  v_public_id uuid;
  v_claim_id uuid;
  v_failed boolean;
begin
  select id into v_owner from auth.users limit 1;
  if v_owner is null then raise exception 'Create a local auth user before running this proof'; end if;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  v_page := public.save_merchant_page_experience(
    null, 'Local page proof', '', null, null, true, '[]'::jsonb,
    '{"contact_name":"Local shop","contact_phone":"+201000000000","show_save_contact":true}'::jsonb
  );
  if not (select is_published from public.merchant_pages where id = v_page) then
    raise exception 'A contact-only page should publish';
  end if;

  select id into v_family from public.product_families where family_key = 'coaster';
  insert into public.product_skus(product_family_id, sku_code, display_name, options)
    values (v_family, 'CQ-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
      'Local coaster proof', '{"face":"all-in-one","variant":"All-in-One"}'::jsonb)
    returning id into v_sku;
  insert into public.smart_items(sku_id, state, owner_user_id, landing_page_id)
    values (v_sku, 'claimed', v_owner, v_page) returning public_id into v_public_id;
  if public.resolve_stand(v_public_id::text) ->> 'kind' <> 'all_in_one' then
    raise exception 'All-in-One coaster did not resolve its page';
  end if;

  insert into public.product_skus(product_family_id, sku_code, display_name, options)
    values (v_family, 'CQ-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
      'Local review proof', '{"face":"review","variant":"أبيض"}'::jsonb)
    returning id into v_sku;
  insert into public.smart_items(sku_id, state, owner_user_id, destination_url)
    values (v_sku, 'claimed', v_owner, 'https://g.page/example') returning id, public_id into v_item, v_public_id;
  if public.resolve_stand(v_public_id::text) ->> 'kind' <> 'review' then
    raise exception 'Google coaster did not resolve a review destination';
  end if;
  v_failed := false;
  begin
    update public.smart_items set destination_url = 'https://facebook.com/example' where id = v_item;
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'Google face accepted a Facebook destination'; end if;
  v_failed := false;
  begin
    update public.smart_items set landing_page_id = v_page where id = v_item;
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'Google face accepted an All-in-One page'; end if;

  select id into v_family from public.product_families where family_key = 'pvc-card';
  insert into public.product_skus(product_family_id, sku_code, display_name, options)
    values (v_family, 'CQ-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
      'Local card proof', '{"face":"instapay","variant":"InstaPay"}'::jsonb)
    returning id into v_sku;
  insert into public.smart_items(sku_id, state, owner_user_id, payment_identifier, recipient_label)
    values (v_sku, 'claimed', v_owner, 'shop@instapay', 'Local shop') returning public_id into v_public_id;
  if public.resolve_stand(v_public_id::text) ->> 'kind' <> 'payment' then
    raise exception 'InstaPay card did not resolve payment details';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.smart_items(sku_id, state, manual_handoff_reference)
    values (v_sku, 'unassigned', 'FIELD-ABCDEF123456') returning id, public_id into v_item, v_public_id;
  insert into public.smart_item_activation_tokens(smart_item_id, token_hash)
    values (v_item, repeat('a', 64));
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_claim_id := public.claim_stand_activation(repeat('a', 64), v_public_id::text);
  if v_claim_id <> v_item or not exists (
    select 1 from public.smart_items where id = v_item and state = 'claimed' and owner_user_id = v_owner
  ) then raise exception 'Manual handoff activation failed'; end if;

  v_failed := false;
  begin
    insert into app_private.smart_item_physical_checks(smart_item_id, nfc_mode, nfc_written_at, nfc_locked_at)
      values (v_item, 'prewritten', now(), now());
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'NFC lock was accepted before reading both NFC and QR'; end if;
  insert into app_private.smart_item_physical_checks
    (smart_item_id, nfc_mode, qr_scanned_at, nfc_written_at, nfc_tested_at, nfc_locked_at)
    values (v_item, 'prewritten', now(), now(), now(), now());

  raise notice 'Smart-item face, page and manual activation proofs passed';
end;
$$;

rollback;
