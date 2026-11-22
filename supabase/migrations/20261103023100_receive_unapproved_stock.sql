-- Physical receipt is independent of sale approval. Checkout remains gated by
-- SKU state, price, sample and fulfilment approval in sale_skus/checkout.
create or replace function app_private.receive_stock(
  p_sku_id uuid, p_quantity integer, p_reason text, p_actor uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_quantity not between 1 and 10000
     or p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 3 and 500
     or p_actor is null then raise exception 'invalid stock receipt'; end if;
  perform 1 from public.product_skus where id=p_sku_id and state <> 'paused' for share;
  if not found then raise exception 'SKU is unavailable'; end if;
  insert into public.inventory_balances(sku_id,on_hand,reserved)
    values (p_sku_id,p_quantity,0)
    on conflict (sku_id) do update set on_hand=public.inventory_balances.on_hand+excluded.on_hand;
  insert into public.inventory_movements(sku_id,kind,quantity,reason,created_by)
    values (p_sku_id,'received',p_quantity,pg_catalog.btrim(p_reason),p_actor);
end;
$$;

revoke all on function app_private.receive_stock(uuid,integer,text,uuid)
  from public, anon, authenticated;
