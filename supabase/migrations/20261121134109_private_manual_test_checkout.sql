alter type public.payment_method add value 'test';

alter table public.product_skus add column checkout_test boolean not null default false,
  add constraint checkout_test_sku_cannot_sell check (
    not checkout_test or (state = 'preparing' and not price_approved and not sample_approved and not fulfillment_approved)
  );

grant select (checkout_test) on public.product_skus to authenticated;

alter table public.orders add constraint checkout_test_order_is_simulated check (
  payment_method::text <> 'test' or
  (payment_state = 'pending' and shipping_minor = 0 and email_snapshot is null and customer_id is null)
);

create function app_private.check_order_line_stock_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  test_order boolean;
  test_sku boolean;
begin
  select payment_method::text = 'test' into test_order from public.orders where id=new.order_id;
  select checkout_test into test_sku from public.product_skus where id=new.sku_id;
  if coalesce(test_sku,false) is distinct from coalesce(test_order,false) then
    raise exception 'Test orders must use isolated test inventory';
  end if;
  return new;
end;
$$;

revoke all on function app_private.check_order_line_stock_scope() from public, anon, authenticated;

create trigger enforce_order_line_stock_scope
before insert or update of order_id,sku_id on public.order_lines
for each row execute function app_private.check_order_line_stock_scope();

create or replace function app_private.require_sale_ready_order_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  family_state public.product_state;
  test_sku boolean;
begin
  if new.sku_id is null then raise exception 'order line requires a SKU'; end if;
  select f.state, s.checkout_test into family_state, test_sku
    from public.product_skus s
    join public.product_families f on f.id = s.product_family_id
    where s.id = new.sku_id;
  -- The separate stock scope trigger requires an isolated test order for this SKU.
  if test_sku then return new; end if;
  if family_state is distinct from 'ready' then
    raise exception 'product family is not ready for sale';
  end if;
  return new;
end;
$$;

create function app_private.keep_order_payment_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.payment_method::text = 'test') is distinct from (old.payment_method::text = 'test') then
    raise exception 'Test orders cannot change payment scope';
  end if;
  return new;
end;
$$;

revoke all on function app_private.keep_order_payment_scope() from public, anon, authenticated;

create trigger enforce_order_payment_scope
before update of payment_method on public.orders
for each row execute function app_private.keep_order_payment_scope();
