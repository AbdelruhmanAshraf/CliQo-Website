-- Keep the storefront closed until payment, carrier, policy, and support gates are ready.
-- Provider readiness flags are set only by their server-side integration, never by the admin form.

alter table app_private.checkout_config
  add column card_enabled boolean not null default false,
  add column card_gateway_name text check (card_gateway_name is null or char_length(card_gateway_name) between 2 and 120),
  add column card_gateway_ready boolean not null default false,
  add column carrier_integration_ready boolean not null default false,
  add column policies_approved boolean not null default false,
  add column support_channel_ready boolean not null default false,
  add column updated_by uuid references auth.users(id) on delete set null;

alter table app_private.checkout_config
  add constraint checkout_cod_requires_carrier_check
    check (not cod_enabled or (carrier_integration_ready and carrier_name is not null and shipping_minor is not null)),
  add constraint checkout_card_requires_gateway_check
    check (not card_enabled or (card_gateway_ready and card_gateway_name is not null)),
  add constraint checkout_sales_requires_release_gates_check
    check (
      not sales_enabled or (
        carrier_integration_ready
        and carrier_name is not null
        and shipping_minor is not null
        and (cod_enabled or card_enabled)
        and policies_approved
        and support_channel_ready
      )
    );

create table app_private.checkout_config_audit (
  id bigint generated always as identity primary key,
  changed_by uuid references auth.users(id) on delete set null,
  previous_state jsonb not null,
  next_state jsonb not null,
  change_reason text not null check (char_length(btrim(change_reason)) between 3 and 500),
  created_at timestamptz not null default now()
);

alter table app_private.checkout_config_audit enable row level security;
revoke all on app_private.checkout_config_audit from public, anon, authenticated;

comment on column app_private.checkout_config.card_gateway_ready is
  'Set by server-side gateway integration only after its hosted payment and signed webhook checks pass.';
comment on column app_private.checkout_config.carrier_integration_ready is
  'Set by server-side shipping integration only after shipment and COD reconciliation checks pass.';
comment on column app_private.checkout_config.policies_approved is
  'Owner attestation that published sale, privacy, shipping, and returns policies are approved.';
comment on column app_private.checkout_config.support_channel_ready is
  'Owner attestation that a real customer support channel is published and monitored.';
