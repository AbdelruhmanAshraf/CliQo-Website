-- An approved SKU still cannot enter an order while its product family is paused.
create function app_private.require_sale_ready_order_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_family_state public.product_state;
begin
  if new.sku_id is null then raise exception 'order line requires a SKU'; end if;
  select f.state into v_family_state
    from public.product_skus s
    join public.product_families f on f.id = s.product_family_id
    where s.id = new.sku_id;
  if v_family_state is distinct from 'ready' then
    raise exception 'product family is not ready for sale';
  end if;
  return new;
end;
$$;
revoke all on function app_private.require_sale_ready_order_line()
  from public, anon, authenticated;
create trigger order_lines_require_ready_family
  before insert on public.order_lines
  for each row execute function app_private.require_sale_ready_order_line();
