begin;

-- ============================================================================
-- 0011_institutional_temporary_password.sql
-- Actualiza la bitácora administrativa de finalización de usuario para reflejar
-- el alta con contraseña temporal institucional, sin almacenar contraseñas,
-- secretos ni datos reversibles en tablas ni logs.
-- ============================================================================

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
    'Creó una cuenta institucional con contraseña temporal',
    jsonb_build_object('role', target_role)
  );
end;
$$;

revoke all on function public.finalize_admin_created_user(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_admin_created_user(uuid, uuid, text, text, text, text)
  to service_role;

commit;
