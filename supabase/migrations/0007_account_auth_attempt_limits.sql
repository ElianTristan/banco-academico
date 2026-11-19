create or replace function public.reserve_account_login_attempt(
  target_identifier text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_bucket text;
  attempt_state public.login_attempt_limits%rowtype;
  pending_count integer;
  reservation uuid;
begin
  if target_identifier is null
     or length(btrim(target_identifier)) not between 2 and 254 then
    return jsonb_build_object('allowed', false, 'failed_attempts', 0, 'locked_until', null);
  end if;

  current_bucket := encode(
    extensions.digest(lower(btrim(target_identifier)), 'sha256'),
    'hex'
  );

  insert into public.login_attempt_limits(bucket_hash)
  values (current_bucket)
  on conflict (bucket_hash) do nothing;

  select * into attempt_state
  from public.login_attempt_limits
  where bucket_hash = current_bucket
  for update;

  if attempt_state.locked_until is not null and attempt_state.locked_until <= now() then
    delete from public.login_attempt_reservations where bucket_hash = current_bucket;
    update public.login_attempt_limits
    set failed_attempts = 0, locked_until = null, window_started_at = now(),
        generation = generation + 1, updated_at = now()
    where bucket_hash = current_bucket
    returning * into attempt_state;
  elsif attempt_state.window_started_at <= now() - interval '15 minutes'
        and attempt_state.locked_until is null then
    delete from public.login_attempt_reservations where bucket_hash = current_bucket;
    update public.login_attempt_limits
    set failed_attempts = 0, window_started_at = now(),
        generation = generation + 1, updated_at = now()
    where bucket_hash = current_bucket
    returning * into attempt_state;
  end if;

  if attempt_state.locked_until is not null and attempt_state.locked_until > now() then
    return jsonb_build_object(
      'allowed', false,
      'failed_attempts', attempt_state.failed_attempts,
      'locked_until', attempt_state.locked_until
    );
  end if;

  delete from public.login_attempt_reservations
  where bucket_hash = current_bucket
    and created_at <= now() - interval '10 minutes';

  select count(*) into pending_count
  from public.login_attempt_reservations
  where bucket_hash = current_bucket and generation = attempt_state.generation;

  if attempt_state.failed_attempts + pending_count >= 3 then
    return jsonb_build_object(
      'allowed', false,
      'failed_attempts', attempt_state.failed_attempts,
      'locked_until', null
    );
  end if;

  insert into public.login_attempt_reservations(bucket_hash, generation)
  values (current_bucket, attempt_state.generation)
  returning id into reservation;

  with expired as (
    select bucket_hash
    from public.login_attempt_limits
    where updated_at <= now() - interval '1 day'
    order by updated_at
    limit 100
  )
  delete from public.login_attempt_limits as limits
  using expired
  where limits.bucket_hash = expired.bucket_hash
    and limits.bucket_hash <> current_bucket;

  return jsonb_build_object(
    'allowed', true,
    'reservation_id', reservation,
    'failed_attempts', attempt_state.failed_attempts,
    'locked_until', attempt_state.locked_until
  );
end;
$$;

revoke all on function public.reserve_account_login_attempt(text) from public, anon, authenticated;
grant execute on function public.reserve_account_login_attempt(text) to service_role;
