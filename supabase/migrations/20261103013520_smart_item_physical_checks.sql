-- Manual production attestations; the server cannot read a physical NFC chip itself.
create table app_private.smart_item_physical_checks (
  smart_item_id uuid primary key references public.smart_items(id) on delete cascade,
  nfc_mode text not null default 'unwritten'
    check (nfc_mode in ('unwritten', 'prewritten', 'customer_write')),
  qr_scanned_at timestamptz,
  nfc_written_at timestamptz,
  nfc_tested_at timestamptz,
  nfc_locked_at timestamptz,
  note text not null default '' check (char_length(note) <= 300),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (nfc_mode = 'prewritten' or (
    nfc_written_at is null and nfc_tested_at is null and nfc_locked_at is null
  )),
  check (nfc_tested_at is null or nfc_written_at is not null),
  check (nfc_locked_at is null or (nfc_tested_at is not null and qr_scanned_at is not null))
);
alter table app_private.smart_item_physical_checks enable row level security;
revoke all on app_private.smart_item_physical_checks from public, anon, authenticated;

create table app_private.smart_item_physical_check_events (
  id bigint generated always as identity primary key,
  smart_item_id uuid not null references public.smart_items(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  previous_state jsonb not null,
  new_state jsonb not null,
  created_at timestamptz not null default now()
);
create index smart_item_physical_check_events_item_idx
  on app_private.smart_item_physical_check_events(smart_item_id, created_at desc);
alter table app_private.smart_item_physical_check_events enable row level security;
revoke all on app_private.smart_item_physical_check_events from public, anon, authenticated;
