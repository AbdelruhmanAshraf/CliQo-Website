-- Transactional order mail is queued in the same transaction as each order/status update.
-- SMTP credentials stay in the application environment, never in Postgres or browser code.

alter table app_private.checkout_config
  add column transactional_email_ready boolean not null default false,
  add column transactional_email_fingerprint text
    check (transactional_email_fingerprint is null or transactional_email_fingerprint ~ '^[a-f0-9]{64}$'),
  add constraint checkout_transactional_email_requires_test
    check (not transactional_email_ready or transactional_email_fingerprint is not null);

alter table app_private.checkout_config
  drop constraint if exists checkout_sales_requires_release_gates_check;

alter table app_private.checkout_config
  add constraint checkout_sales_requires_release_gates_check
    check (
      not sales_enabled or (
        carrier_integration_ready
        and carrier_name is not null
        and shipping_minor is not null
        and (cod_enabled or card_enabled)
        and policies_approved
        and support_channel_ready
        and transactional_email_ready
        and transactional_email_fingerprint is not null
      )
    );

alter table public.orders
  add column email_locale text not null default 'ar'
    check (email_locale in ('ar', 'en'));

create table app_private.email_outbox (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  recipient text not null check (
    char_length(recipient) <= 254
    and recipient ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  event_type text not null check (event_type in ('order_received', 'order_update')),
  event_key text not null unique check (char_length(event_key) <= 220),
  email_locale text not null check (email_locale in ('ar', 'en')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed')),
  attempts smallint not null default 0 check (attempts between 0 and 8),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  created_at timestamptz not null default now(),
  check ((status = 'processing') = (locked_at is not null)),
  check ((status = 'sent') = (sent_at is not null))
);

create index email_outbox_pending_idx
  on app_private.email_outbox(status, available_at, created_at)
  where status in ('queued', 'processing');
create index email_outbox_order_idx
  on app_private.email_outbox(order_id, created_at desc);

alter table app_private.email_outbox enable row level security;
revoke all on app_private.email_outbox from public, anon, authenticated;
revoke all on sequence app_private.email_outbox_id_seq from public, anon, authenticated;

create table app_private.email_delivery_audit (
  id bigint generated always as identity primary key,
  changed_by uuid references auth.users(id) on delete set null,
  action text not null check (action in ('retry_failed')),
  affected_count integer not null check (affected_count between 0 and 1000),
  created_at timestamptz not null default now()
);
alter table app_private.email_delivery_audit enable row level security;
revoke all on app_private.email_delivery_audit from public, anon, authenticated;
revoke all on sequence app_private.email_delivery_audit_id_seq from public, anon, authenticated;

create function app_private.set_order_email_locale()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.email_locale := case
    when current_setting('cliqo.email_locale', true) = 'en' then 'en'
    else 'ar'
  end;
  return new;
end;
$$;
revoke all on function app_private.set_order_email_locale() from public, anon, authenticated;

create trigger orders_set_email_locale
before insert on public.orders
for each row execute function app_private.set_order_email_locale();

create function app_private.enqueue_order_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_event_key text;
begin
  if new.email_snapshot is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_event_type := 'order_received';
    v_event_key := 'received:' || new.id::text;
  elsif new.state is distinct from old.state
     or new.payment_state is distinct from old.payment_state then
    v_event_type := 'order_update';
    v_event_key := 'update:' || new.id::text || ':' || txid_current()::text || ':' ||
      new.state::text || ':' || new.payment_state::text;
  else
    return new;
  end if;

  insert into app_private.email_outbox (
    order_id, recipient, event_type, event_key, email_locale, payload
  ) values (
    new.id,
    new.email_snapshot,
    v_event_type,
    v_event_key,
    new.email_locale,
    jsonb_build_object(
      'reference', new.order_reference,
      'customer_name', new.customer_name_snapshot,
      'state', new.state::text,
      'payment_state', new.payment_state::text,
      'payment_method', new.payment_method::text,
      'subtotal_minor', new.subtotal_minor,
      'shipping_minor', new.shipping_minor,
      'total_minor', new.total_minor
    )
  ) on conflict (event_key) do nothing;

  return new;
end;
$$;
revoke all on function app_private.enqueue_order_email() from public, anon, authenticated;

create trigger orders_queue_email
after insert or update of state, payment_state on public.orders
for each row execute function app_private.enqueue_order_email();

comment on table app_private.email_outbox is
  'Private, retryable customer order notifications. The payload intentionally excludes shipping address and private design uploads.';
comment on column app_private.checkout_config.transactional_email_ready is
  'Owner action sets this only after sending a real SMTP test message successfully.';
comment on column app_private.checkout_config.transactional_email_fingerprint is
  'SHA-256 fingerprint of the active SMTP configuration. Checkout closes if runtime configuration differs.';
