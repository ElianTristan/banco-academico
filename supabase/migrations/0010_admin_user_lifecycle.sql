begin;

alter table public.profiles
  add column if not exists is_active boolean not null default true;

create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid() and is_active
$$;

create or replace function public.guard_profile_active_status()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.is_active is distinct from old.is_active
     and current_user not in ('postgres', 'service_role') then
    raise exception 'El estado de acceso solo puede cambiar mediante el flujo administrativo seguro';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_active_status_guard on public.profiles;
create trigger profiles_active_status_guard
  before update of is_active on public.profiles
  for each row execute function public.guard_profile_active_status();
revoke all on function public.guard_profile_active_status() from public;

create or replace function public.deactivate_managed_user(target_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  target_profile public.profiles%rowtype;
begin
  if auth.uid() is null or public.current_role() is distinct from 'administrador' then
    raise exception 'Solo un administrador activo puede desactivar cuentas';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'No puedes desactivar tu propia cuenta';
  end if;

  perform pg_advisory_xact_lock(17462, 1);
  select * into target_profile
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception 'No se encontró la cuenta seleccionada';
  end if;
  if not target_profile.is_active then
    raise exception 'La cuenta ya está desactivada';
  end if;
  if target_profile.role = 'administrador'
     and (select count(*) from public.profiles where role = 'administrador' and is_active) <= 1 then
    raise exception 'Debe permanecer al menos una cuenta administradora activa';
  end if;

  update public.profiles
  set is_active = false, updated_at = now()
  where id = target_user_id;

  insert into public.activity_logs (user_id, action, module, record_id, description, details)
  values (
    auth.uid(),
    'ADMIN_USER_DEACTIVATED',
    'Usuarios',
    target_user_id::text,
    'Desactivó una cuenta sin eliminar su historial académico',
    jsonb_build_object('role', target_profile.role)
  );
end;
$$;

revoke all on function public.deactivate_managed_user(uuid) from public, anon;
grant execute on function public.deactivate_managed_user(uuid) to authenticated;

create or replace function public.reactivate_managed_user(target_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare target_role public.app_role;
begin
  if auth.uid() is null or public.current_role() is distinct from 'administrador' then
    raise exception 'Solo un administrador activo puede reactivar cuentas';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'No puedes reactivar tu propia cuenta';
  end if;

  select role into target_role
  from public.profiles
  where id = target_user_id and not is_active
  for update;
  if not found then
    raise exception 'La cuenta no existe o ya está activa';
  end if;

  update public.profiles
  set is_active = true, updated_at = now()
  where id = target_user_id;

  insert into public.activity_logs (user_id, action, module, record_id, description, details)
  values (
    auth.uid(),
    'ADMIN_USER_REACTIVATED',
    'Usuarios',
    target_user_id::text,
    'Reactivó una cuenta conservando su historial académico',
    jsonb_build_object('role', target_role)
  );
end;
$$;

revoke all on function public.reactivate_managed_user(uuid) from public, anon;
grant execute on function public.reactivate_managed_user(uuid) to authenticated;

create or replace function public.finalize_admin_created_user(
  target_user_id uuid,
  target_admin_id uuid,
  target_role text,
  target_control_number text,
  target_employee_number text,
  target_department text
) returns void
language plpgsql security definer set search_path = public
as $$
declare institutional_career uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Esta operación requiere el servicio administrativo seguro';
  end if;
  if target_role not in ('alumno', 'docente') then
    raise exception 'Solo se pueden dar de alta cuentas de alumno o docente';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target_admin_id and role = 'administrador' and is_active
  ) then
    raise exception 'La cuenta administradora ya no está activa';
  end if;

  update public.profiles
  set role = target_role::public.app_role, updated_at = now()
  where id = target_user_id and is_active;
  if not found then
    raise exception 'No se encontró el perfil de la cuenta nueva';
  end if;

  if target_role = 'alumno' then
    select id into institutional_career
    from public.careers
    where name = 'Ingeniería en Sistemas' and active;
    if institutional_career is null then
      raise exception 'La carrera institucional no está configurada; aplica primero la migración 0009';
    end if;

    update public.students
    set control_number = target_control_number, career_id = institutional_career
    where id = target_user_id;
    if not found then
      raise exception 'No se encontró el registro de alumno creado por Auth';
    end if;
    delete from public.teachers where id = target_user_id;
  else
    if length(btrim(coalesce(target_employee_number, ''))) not between 2 and 40
       or length(btrim(coalesce(target_department, ''))) not between 2 and 120 then
      raise exception 'Los datos docentes no son válidos';
    end if;

    delete from public.students where id = target_user_id;
    insert into public.teachers (id, employee_number, department)
    values (target_user_id, btrim(target_employee_number), btrim(target_department))
    on conflict (id) do update
      set employee_number = excluded.employee_number,
          department = excluded.department;
  end if;

  insert into public.activity_logs (user_id, action, module, record_id, description, details)
  values (
    target_admin_id,
    'ADMIN_USER_CREATED',
    'Usuarios',
    target_user_id::text,
    'Creó una cuenta institucional e invitó a la persona por correo',
    jsonb_build_object('role', target_role)
  );
end;
$$;

revoke all on function public.finalize_admin_created_user(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_admin_created_user(uuid, uuid, text, text, text, text)
  to service_role;

commit;
