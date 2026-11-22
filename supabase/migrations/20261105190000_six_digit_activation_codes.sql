-- Keep the six-digit engraving stable for reprints and throttle guesses per physical item.
alter table public.smart_item_activation_tokens
  add column print_nonce bigint check (print_nonce is null or print_nonce >= 0);

create table app_private.activation_claim_attempts (
  smart_item_id uuid primary key references public.smart_items(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts between 1 and 5),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);

revoke all on app_private.activation_claim_attempts from public, anon, authenticated;

drop function public.claim_stand_activation(text, text);

create function public.claim_stand_activation(p_token_hash text, p_public_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_item_id uuid;
  v_token_id uuid;
  v_attempts app_private.activation_claim_attempts%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_token_hash !~ '^[a-fA-F0-9]{64}$'
     or p_public_id is null
     or p_public_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  select i.id into v_item_id
  from public.smart_items i
  where i.public_id = p_public_id::uuid and i.owner_user_id is null
    and (i.state = 'ready' or (i.state = 'unassigned' and i.manual_handoff_reference is not null))
  for update of i;
  if v_item_id is null then return false; end if;

  select * into v_attempts from app_private.activation_claim_attempts a
  where a.smart_item_id = v_item_id;
  if found and v_attempts.locked_until > now() then return false; end if;

  select t.id into v_token_id
  from public.smart_item_activation_tokens t
  where t.smart_item_id = v_item_id and t.token_hash = lower(p_token_hash)
    and t.consumed_at is null and (t.expires_at is null or t.expires_at > now())
  for update of t;

  if v_token_id is null then
    insert into app_private.activation_claim_attempts(smart_item_id, failed_attempts, window_started_at)
    values (v_item_id, 1, now())
    on conflict (smart_item_id) do update
    set failed_attempts = case
          when app_private.activation_claim_attempts.window_started_at <= now() - interval '15 minutes'
            or app_private.activation_claim_attempts.locked_until <= now() then 1
          else app_private.activation_claim_attempts.failed_attempts + 1
        end,
        window_started_at = case
          when app_private.activation_claim_attempts.window_started_at <= now() - interval '15 minutes'
            or app_private.activation_claim_attempts.locked_until <= now() then now()
          else app_private.activation_claim_attempts.window_started_at
        end,
        locked_until = case
          when app_private.activation_claim_attempts.window_started_at <= now() - interval '15 minutes'
            or app_private.activation_claim_attempts.locked_until <= now() then null
          when app_private.activation_claim_attempts.failed_attempts + 1 >= 5 then now() + interval '15 minutes'
          else app_private.activation_claim_attempts.locked_until
        end;
    update app_private.activation_claim_attempts a
      set locked_until = now() + interval '15 minutes'
      where a.smart_item_id = v_item_id and a.failed_attempts >= 5 and a.locked_until is null;
    return false;
  end if;

  update public.smart_item_activation_tokens set consumed_at = now() where id = v_token_id;
  update public.smart_items i set owner_user_id = v_user_id, state = 'claimed', claimed_at = now()
  where i.id = v_item_id and i.owner_user_id is null
    and (i.state = 'ready' or (i.state = 'unassigned' and i.manual_handoff_reference is not null));
  if not found then raise exception 'Smart item is no longer available'; end if;
  delete from app_private.activation_claim_attempts where smart_item_id = v_item_id;
  return true;
end;
$$;

revoke all on function public.claim_stand_activation(text, text) from public, anon;
grant execute on function public.claim_stand_activation(text, text) to authenticated;
