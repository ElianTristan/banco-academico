begin;

create or replace function public.finalize_admin_created_administrator(
  target_user_id uuid,
  target_admin_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Esta operación requiere el servicio administrativo seguro';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = target_admin_id
      and role = 'administrador'
      and is_active
  ) then
    raise exception 'La cuenta administradora ya no está activa';
  end if;

  perform pg_advisory_xact_lock(17462, 1);

  update public.profiles
  set role = 'administrador', updated_at = now()
  where id = target_user_id
    and is_active
    and role = 'alumno';
  if not found then
    raise exception 'No se encontró el perfil nuevo o no tiene un rol inicial válido';
  end if;

  delete from public.students where id = target_user_id;
  delete from public.teachers where id = target_user_id;

  insert into public.activity_logs (user_id, action, module, record_id, description)
  values (
    target_admin_id,
    'ADMINISTRATOR_CREATED',
    'Administradores',
    target_user_id::text,
    'Creó una cuenta administradora'
  );
end;
$$;

revoke all on function public.finalize_admin_created_administrator(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_admin_created_administrator(uuid, uuid)
  to service_role;

create or replace function public.update_managed_administrator(
  target_user_id uuid,
  target_first_name text,
  target_last_name text,
  target_email text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.current_role() is distinct from 'administrador' then
    raise exception 'Solo un administrador activo puede editar administradores';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'No puedes editar tu propia cuenta desde esta sección';
  end if;
  if length(btrim(coalesce(target_first_name, ''))) not between 1 and 80
     or length(btrim(coalesce(target_last_name, ''))) not between 1 and 100
     or length(btrim(coalesce(target_email, ''))) not between 3 and 254
     or position('@' in target_email) < 2 then
    raise exception 'Los datos del administrador no son válidos';
  end if;

  update public.profiles
  set first_name = btrim(target_first_name),
      last_name = btrim(target_last_name),
      email = lower(btrim(target_email)),
      updated_at = now()
  where id = target_user_id
    and role = 'administrador';
  if not found then
    raise exception 'No se encontró la cuenta administradora';
  end if;

  insert into public.activity_logs (user_id, action, module, record_id, description)
  values (
    auth.uid(),
    'ADMINISTRATOR_UPDATED',
    'Administradores',
    target_user_id::text,
    'Actualizó los datos de una cuenta administradora'
  );
end;
$$;

revoke all on function public.update_managed_administrator(uuid, text, text, text)
  from public, anon;
grant execute on function public.update_managed_administrator(uuid, text, text, text)
  to authenticated;

commit;
