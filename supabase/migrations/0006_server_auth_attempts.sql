create table if not exists public.login_attempt_limits (
  bucket_hash text primary key check (bucket_hash ~ '^[0-9a-f]{64}$'),
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 3),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  generation bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists login_attempt_limits_updated_idx
  on public.login_attempt_limits(updated_at);

create table if not exists public.login_attempt_reservations (
  id uuid primary key default gen_random_uuid(),
  bucket_hash text not null references public.login_attempt_limits(bucket_hash) on delete cascade,
  generation bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists login_attempt_reservations_bucket_idx
  on public.login_attempt_reservations(bucket_hash, generation, created_at);

alter table public.login_attempt_limits enable row level security;
alter table public.login_attempt_reservations enable row level security;
revoke all on public.login_attempt_limits, public.login_attempt_reservations from public, anon, authenticated;
grant all on public.login_attempt_limits, public.login_attempt_reservations to service_role;

create or replace function public.reserve_login_attempt(
  target_identifier text,
  target_client_key text
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
     or length(btrim(target_identifier)) not between 2 and 254
     or target_client_key is null
     or length(btrim(target_client_key)) not between 1 and 128 then
    return jsonb_build_object('allowed', false, 'failed_attempts', 0, 'locked_until', null);
  end if;

  current_bucket := encode(
    extensions.digest(lower(btrim(target_identifier)) || E'\n' || btrim(target_client_key), 'sha256'),
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

create or replace function public.complete_login_attempt(
  target_reservation uuid,
  target_outcome text,
  target_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_state public.login_attempt_reservations%rowtype;
  attempt_state public.login_attempt_limits%rowtype;
  audit_logged boolean := true;
  audit_error text := null;
  event_type public.access_event;
begin
  if target_outcome not in ('failure', 'success', 'release') then
    raise exception 'Invalid login-attempt outcome';
  end if;

  select * into reservation_state
  from public.login_attempt_reservations
  where id = target_reservation;
  if not found then
    return jsonb_build_object('failed_attempts', 0, 'locked_until', null, 'audit_logged', true);
  end if;

  select * into attempt_state
  from public.login_attempt_limits
  where bucket_hash = reservation_state.bucket_hash
  for update;

  select * into reservation_state
  from public.login_attempt_reservations
  where id = target_reservation
  for update;
  if not found then
    return jsonb_build_object('failed_attempts', attempt_state.failed_attempts,
                              'locked_until', attempt_state.locked_until, 'audit_logged', true);
  end if;

  if reservation_state.generation <> attempt_state.generation then
    delete from public.login_attempt_reservations where id = target_reservation;
    return jsonb_build_object('failed_attempts', attempt_state.failed_attempts,
                              'locked_until', attempt_state.locked_until, 'audit_logged', true);
  end if;

  delete from public.login_attempt_reservations where id = target_reservation;

  if target_outcome = 'release' then
    update public.login_attempt_limits set updated_at = now()
    where bucket_hash = reservation_state.bucket_hash;
    return jsonb_build_object('failed_attempts', attempt_state.failed_attempts,
                              'locked_until', attempt_state.locked_until, 'audit_logged', true);
  elsif target_outcome = 'success' then
    update public.login_attempt_limits
    set failed_attempts = 0, locked_until = null, window_started_at = now(),
        generation = generation + 1, updated_at = now()
    where bucket_hash = reservation_state.bucket_hash;
    attempt_state.failed_attempts := 0;
    attempt_state.locked_until := null;
    delete from public.login_attempt_reservations
    where bucket_hash = reservation_state.bucket_hash;
    event_type := 'LOGIN';
  else
    update public.login_attempt_limits
    set failed_attempts = least(failed_attempts + 1, 3),
        locked_until = case when failed_attempts + 1 >= 3 then now() + interval '15 minutes' else null end,
        updated_at = now()
    where bucket_hash = reservation_state.bucket_hash
    returning * into attempt_state;
    event_type := 'LOGIN_FAILED';
  end if;

  begin
    insert into public.access_logs(user_id, event_type, succeeded, session_info)
    values (
      target_user_id,
      event_type,
      target_outcome = 'success',
      jsonb_build_object('source', 'web')
    );
  exception when others then
    audit_logged := false;
    get stacked diagnostics audit_error = message_text;
  end;

  return jsonb_build_object(
    'failed_attempts', attempt_state.failed_attempts,
    'locked_until', attempt_state.locked_until,
    'audit_logged', audit_logged,
    'audit_error', audit_error
  );
end;
$$;

create or replace function public.record_auth_event(
  target_user_id uuid,
  target_event text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_error text := null;
begin
  if target_event not in ('LOGOUT', 'PASSWORD_RESET') or target_user_id is null then
    raise exception 'Invalid authentication audit event';
  end if;

  begin
    insert into public.access_logs(user_id, event_type, succeeded, session_info)
    values (target_user_id, target_event::public.access_event, true, jsonb_build_object('source', 'web'));
  exception when others then
    get stacked diagnostics audit_error = message_text;
    return jsonb_build_object('audit_logged', false, 'audit_error', audit_error);
  end;

  return jsonb_build_object('audit_logged', true);
end;
$$;

revoke all on function public.reserve_login_attempt(text, text) from public, anon, authenticated;
revoke all on function public.complete_login_attempt(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.record_auth_event(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_login_attempt(text, text) to service_role;
grant execute on function public.complete_login_attempt(uuid, text, uuid) to service_role;
grant execute on function public.record_auth_event(uuid, text) to service_role;

drop policy if exists "signed in users record own events" on public.access_logs;
drop policy if exists "signed in users record own session events" on public.access_logs;
drop policy if exists "admins read access logs" on public.access_logs;
create policy "admins read access logs" on public.access_logs
  for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.access_logs from public, anon, authenticated;
