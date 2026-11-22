-- Store policy drafts and published copies privately. Checkout readiness is
-- derived from all four policy pages being published in Arabic and English.

create or replace function app_private.is_publishable_policy(p_body text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select char_length(btrim(p_body)) between 300 and 20000
    and not exists (
      select 1
      from unnest(array[
        '[todo]', '{{', '}}', 'lorem ipsum', 'tbd',
        'اكتب هنا', 'أدخل هنا', 'ضع هنا'
      ]::text[]) as marker(value)
      where lower(p_body) like '%' || lower(marker.value) || '%'
    );
$$;

create table app_private.store_policies (
  policy_key text not null check (policy_key in ('privacy', 'terms', 'shipping', 'returns')),
  locale text not null check (locale in ('ar', 'en')),
  draft_body text not null default '' check (char_length(draft_body) <= 20000),
  published_body text,
  draft_updated_by uuid references auth.users(id) on delete set null,
  draft_updated_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  primary key (policy_key, locale),
  check (published_body is null or app_private.is_publishable_policy(published_body)),
  check ((published_body is null) = (published_at is null)),
  check (published_body is null or char_length(draft_body) <= 20000)
);

insert into app_private.store_policies(policy_key, locale)
select policy.policy_key, locale.locale
from (values ('privacy'), ('terms'), ('shipping'), ('returns')) as policy(policy_key)
cross join (values ('ar'), ('en')) as locale(locale)
on conflict (policy_key, locale) do nothing;

create table app_private.store_policy_audit (
  id bigint generated always as identity primary key,
  policy_key text not null check (policy_key in ('privacy', 'terms', 'shipping', 'returns')),
  changed_by uuid references auth.users(id) on delete set null,
  previous_state jsonb not null,
  next_state jsonb not null,
  change_reason text not null check (char_length(btrim(change_reason)) between 3 and 500),
  created_at timestamptz not null default now()
);

alter table app_private.store_policies enable row level security;
alter table app_private.store_policy_audit enable row level security;
revoke all on app_private.store_policies, app_private.store_policy_audit from public, anon, authenticated;
revoke all on function app_private.is_publishable_policy(text) from public, anon, authenticated;

create or replace function app_private.store_policies_are_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) = 8
  from app_private.store_policies
  where published_body is not null
    and app_private.is_publishable_policy(published_body);
$$;

create or replace function app_private.guard_policy_checkout_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.policies_approved and not app_private.store_policies_are_ready() then
    raise exception 'All four store policies must be published in Arabic and English before checkout can be approved.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger checkout_config_policy_approval_guard
before insert or update on app_private.checkout_config
for each row execute function app_private.guard_policy_checkout_approval();

create or replace function app_private.sync_policy_checkout_readiness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  policies_ready boolean := app_private.store_policies_are_ready();
  previous_state jsonb;
  next_state jsonb;
begin
  select to_jsonb(c) into previous_state
  from app_private.checkout_config c
  where c.id = true
  for update;

  if previous_state is null then
    return null;
  end if;

  if (previous_state ->> 'policies_approved')::boolean is distinct from policies_ready
     or ((previous_state ->> 'sales_enabled')::boolean and not policies_ready) then
    update app_private.checkout_config c
    set policies_approved = policies_ready,
        sales_enabled = case when policies_ready then c.sales_enabled else false end,
        updated_at = now()
    where c.id = true
    returning to_jsonb(c) into next_state;

    insert into app_private.checkout_config_audit(changed_by, previous_state, next_state, change_reason)
    values (null, previous_state, next_state, 'Policy publication changed; checkout gate synchronized automatically.');
  end if;

  return null;
end;
$$;

revoke all on function app_private.store_policies_are_ready() from public, anon, authenticated;
revoke all on function app_private.guard_policy_checkout_approval() from public, anon, authenticated;
revoke all on function app_private.sync_policy_checkout_readiness() from public, anon, authenticated;

create trigger store_policies_sync_checkout_readiness
after insert or update or delete on app_private.store_policies
for each statement execute function app_private.sync_policy_checkout_readiness();

comment on table app_private.store_policies is
  'Owner-managed policy drafts and published copies. Only published_body is served publicly.';
comment on column app_private.checkout_config.policies_approved is
  'Derived database gate: all four policies must have publishable Arabic and English copies.';
