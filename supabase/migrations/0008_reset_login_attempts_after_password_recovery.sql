create or replace function public.reset_account_login_attempts(
  target_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_email text;
  current_bucket text;
  attempt_state public.login_attempt_limits%rowtype;
begin
  if target_user_id is null then
    raise exception 'A user id is required to reset login attempts';
  end if;

  select lower(btrim(profile.email)) into account_email
  from public.profiles as profile
  where profile.id = target_user_id;

  if account_email is null then
    raise exception 'The account email could not be found';
  end if;

  current_bucket := encode(extensions.digest(account_email, 'sha256'), 'hex');

  select * into attempt_state
  from public.login_attempt_limits
  where bucket_hash = current_bucket
  for update;

  if not found then
    return true;
  end if;

  delete from public.login_attempt_reservations
  where bucket_hash = current_bucket;

  update public.login_attempt_limits
  set failed_attempts = 0,
      locked_until = null,
      window_started_at = now(),
      generation = generation + 1,
      updated_at = now()
  where bucket_hash = current_bucket;

  return true;
end;
$$;

revoke all on function public.reset_account_login_attempts(uuid) from public, anon, authenticated;
grant execute on function public.reset_account_login_attempts(uuid) to service_role;
