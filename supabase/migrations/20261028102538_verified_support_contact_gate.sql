-- A support channel must be published and owner-tested before sales can open.
alter table app_private.checkout_config
  add column support_email text
    check (support_email is null or (char_length(support_email) <= 254 and support_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  add column support_whatsapp text
    check (support_whatsapp is null or support_whatsapp ~ '^[1-9][0-9]{7,14}$'),
  add constraint checkout_support_ready_requires_contact
    check (not support_channel_ready or support_email is not null or support_whatsapp is not null);

create or replace function app_private.invalidate_support_readiness_on_contact_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.support_email is distinct from old.support_email
     or new.support_whatsapp is distinct from old.support_whatsapp then
    new.support_channel_ready := false;
    new.sales_enabled := false;
  end if;
  return new;
end;
$$;

revoke all on function app_private.invalidate_support_readiness_on_contact_change() from public, anon, authenticated;

create trigger checkout_config_support_contact_change
before update of support_email, support_whatsapp on app_private.checkout_config
for each row execute function app_private.invalidate_support_readiness_on_contact_change();

comment on column app_private.checkout_config.support_email is
  'Public order and support contact, shown only after the owner verifies the channel.';
comment on column app_private.checkout_config.support_whatsapp is
  'Public WhatsApp destination in international digits without the plus sign, shown only after owner verification.';
comment on column app_private.checkout_config.support_channel_ready is
  'Owner attestation that a configured public support channel has been tested and is monitored.';
