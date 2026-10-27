-- Keep activation tied to the QR the customer scanned, so a code for another
-- unit cannot accidentally claim that unit during this flow.
drop function public.claim_stand_activation(text);

create function public.claim_stand_activation(p_token_hash text, p_public_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_item_id uuid;
  v_claimed_id uuid;
  v_public_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_token_hash !~ '^[a-fA-F0-9]{64}$' then raise exception 'Invalid activation code'; end if;
  if p_public_id is not null then
    if p_public_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid item';
    end if;
    v_public_id := p_public_id::uuid;
  end if;

  update public.smart_item_activation_tokens t set consumed_at = now()
  where t.id = (
    select token.id
    from public.smart_item_activation_tokens token
    join public.smart_items i on i.id = token.smart_item_id
    where token.token_hash = lower(p_token_hash) and token.consumed_at is null
      and (token.expires_at is null or token.expires_at > now())
      and i.owner_user_id is null and i.state = 'ready'
      and (v_public_id is null or i.public_id = v_public_id)
    for update of token, i
  ) returning t.smart_item_id into v_item_id;
  if v_item_id is null then raise exception 'Activation token is invalid, expired, used, or belongs to another item'; end if;

  update public.smart_items i set owner_user_id = v_user_id, state = 'claimed', claimed_at = now()
  where i.id = v_item_id and i.owner_user_id is null and i.state = 'ready'
  returning i.id into v_claimed_id;
  if v_claimed_id is null then raise exception 'Smart item is no longer available'; end if;
  return v_claimed_id;
end;
$$;

revoke all on function public.claim_stand_activation(text, text) from public, anon;
grant execute on function public.claim_stand_activation(text, text) to authenticated;
