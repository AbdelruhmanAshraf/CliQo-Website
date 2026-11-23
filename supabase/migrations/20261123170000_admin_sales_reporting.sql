-- Owner-entered advertising costs for accurate sales reporting.
create table app_private.admin_ad_spend (
  id uuid primary key default gen_random_uuid(),
  spend_date date not null,
  channel text not null check (char_length(channel) between 1 and 40),
  campaign text not null check (char_length(campaign) between 1 and 120),
  amount_minor integer not null check (amount_minor > 0),
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table app_private.admin_ad_spend enable row level security;
revoke all on app_private.admin_ad_spend from public, anon, authenticated;
create index admin_ad_spend_date_idx on app_private.admin_ad_spend(spend_date desc, created_at desc);

notify pgrst, 'reload schema';
