alter table public.orders
  add column archived_at timestamptz,
  add constraint archived_order_is_closed
    check (archived_at is null or state in ('cancelled', 'returned', 'delivered'));

create index orders_archive_created_idx on public.orders (archived_at, created_at desc, id desc);
