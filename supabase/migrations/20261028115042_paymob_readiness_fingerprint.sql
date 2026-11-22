-- Keep Paymob readiness tied to the exact server-side configuration that passed owner verification.
alter table app_private.checkout_config
  add column card_gateway_fingerprint text,
  add constraint checkout_card_gateway_fingerprint_check
    check (card_gateway_fingerprint is null or card_gateway_fingerprint ~ '^[a-f0-9]{64}$'),
  add constraint checkout_ready_gateway_fingerprint_check
    check (not card_gateway_ready or card_gateway_fingerprint is not null);

comment on column app_private.checkout_config.card_gateway_fingerprint is
  'SHA-256 fingerprint of the tested Paymob configuration. A changed key, mode, integration, provider host, or public origin invalidates readiness in the application.';
comment on column app_private.checkout_config.card_gateway_ready is
  'Owner-only attestation after Paymob hosted payment, signed notification, duplicate, decline, expiry, and refund checks pass for the recorded configuration fingerprint.';
