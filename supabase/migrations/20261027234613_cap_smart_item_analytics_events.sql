-- Bound analytics write volume without collecting visitor IPs or identifiers.
-- A burst over 120 opens or 120 clicks per item per rolling minute is not counted;
-- the public page and outbound links still work.
create function app_private.cap_smart_item_event_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_recent integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.smart_item_id::text || ':' || new.event_kind, 0)
  );

  select count(*) into v_recent
  from public.smart_item_events e
  where e.smart_item_id = new.smart_item_id
    and e.event_kind = new.event_kind
    and e.created_at >= pg_catalog.now() - interval '1 minute';

  if v_recent >= 120 then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function app_private.cap_smart_item_event_writes() from public, anon, authenticated;

create trigger smart_item_events_write_cap
before insert on public.smart_item_events
for each row execute function app_private.cap_smart_item_event_writes();
