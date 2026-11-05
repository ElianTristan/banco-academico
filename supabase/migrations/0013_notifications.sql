-- Notificaciones para avisos y tareas académicas.
alter table public.posts
  add column if not exists post_type text not null default 'anuncio'
  check (post_type in ('tarea', 'anuncio'));

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_destino_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('tarea', 'anuncio')),
  titulo text not null,
  mensaje text not null,
  remitente_id uuid not null references public.profiles(id) on delete cascade,
  remitente_nombre text not null default 'Comunidad académica',
  remitente_rol public.app_role not null,
  leida boolean not null default false,
  fecha_creacion timestamptz not null default now(),
  post_id uuid references public.posts(id) on delete cascade
);

create index if not exists notificaciones_destino_fecha_idx
  on public.notificaciones(usuario_destino_id, fecha_creacion desc);
create index if not exists notificaciones_destino_no_leidas_idx
  on public.notificaciones(usuario_destino_id, leida) where leida = false;

alter table public.notificaciones enable row level security;
revoke all on public.notificaciones from anon, authenticated;
grant select on public.notificaciones to authenticated;
grant update (leida) on public.notificaciones to authenticated;
drop policy if exists "users read own notifications" on public.notificaciones;
create policy "users read own notifications" on public.notificaciones
  for select to authenticated using (usuario_destino_id = auth.uid());
drop policy if exists "users mark own notifications read" on public.notificaciones;
create policy "users mark own notifications read" on public.notificaciones
  for update to authenticated using (usuario_destino_id = auth.uid())
  with check (usuario_destino_id = auth.uid());

drop policy if exists "posts members read" on public.posts;
create policy "posts members read" on public.posts for select to authenticated using (
  deleted_at is null and (
    public.is_admin()
    or (group_id is null and public.current_role() = 'alumno')
    or (group_id is not null and (public.is_teacher_of(group_id) or public.is_enrolled_in(group_id)))
  )
);

create or replace function public.notify_post_recipients() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null then
    insert into public.notificaciones(usuario_destino_id, tipo, titulo, mensaje, remitente_id, remitente_nombre, remitente_rol, post_id)
    select distinct e.student_id, new.post_type, new.title, new.body, new.created_by,
           trim(concat(sender.first_name, ' ', sender.last_name)), sender.role, new.id
      from public.enrollments e
      join public.profiles recipient on recipient.id = e.student_id and recipient.is_active = true
      join public.profiles sender on sender.id = new.created_by
     where e.group_id = new.group_id and e.status = 'active'
       and e.student_id <> new.created_by;
  else
    -- Solo administración puede publicar una notificación institucional general.
    if public.current_role() = 'administrador' then
      insert into public.notificaciones(usuario_destino_id, tipo, titulo, mensaje, remitente_id, remitente_nombre, remitente_rol, post_id)
      select p.id, new.post_type, new.title, new.body, new.created_by,
             trim(concat(sender.first_name, ' ', sender.last_name)), sender.role, new.id
        from public.profiles p
        cross join public.profiles sender
       where p.role = 'alumno' and p.is_active is distinct from false
         and sender.id = new.created_by
         and p.id <> new.created_by;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_notify_recipients on public.posts;
create trigger posts_notify_recipients after insert on public.posts
for each row execute function public.notify_post_recipients();

drop policy if exists "teachers publish to own groups" on public.posts;
create policy "teachers publish to own groups" on public.posts
  for insert to authenticated with check (
    created_by = auth.uid() and (
      (public.current_role() = 'docente' and group_id is not null and public.is_teacher_of(group_id))
      or public.current_role() = 'administrador'
    )
  );

revoke all on function public.notify_post_recipients() from public;

create or replace function public.update_managed_profile(
  target_user_id uuid,
  target_first_name text,
  target_last_name text,
  target_email text,
  target_role text,
  target_control_number text,
  target_employee_number text,
  target_department text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.current_role() <> 'administrador' then
    raise exception 'Solo administración puede editar cuentas';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'No puedes cambiar los datos de acceso de tu propia cuenta desde este formulario';
  end if;
  if exists (select 1 from public.profiles where id = target_user_id and role = 'administrador') then
    raise exception 'Las cuentas administradoras no se pueden editar desde este formulario';
  end if;
  if target_role not in ('alumno', 'docente') then
    raise exception 'El rol indicado no está permitido';
  end if;
  if target_role = 'alumno' and length(trim(coalesce(target_control_number, ''))) < 2 then
    raise exception 'El número de control es obligatorio';
  end if;
  if target_role = 'docente' and (length(trim(coalesce(target_employee_number, ''))) < 2 or length(trim(coalesce(target_department, ''))) < 2) then
    raise exception 'El número de trabajador y departamento son obligatorios';
  end if;

  update public.profiles
     set first_name = trim(target_first_name), last_name = trim(target_last_name),
         email = lower(trim(target_email)), role = target_role::public.app_role, updated_at = now()
   where id = target_user_id;
  if not found then raise exception 'No se encontró la cuenta'; end if;

  if target_role = 'alumno' then
    insert into public.students(id, control_number) values(target_user_id, trim(target_control_number))
    on conflict(id) do update set control_number = excluded.control_number;
  else
    insert into public.teachers(id, employee_number, department)
    values(target_user_id, trim(target_employee_number), trim(target_department))
    on conflict(id) do update set employee_number = excluded.employee_number, department = excluded.department;
  end if;

  insert into public.activity_logs(user_id, action, module, record_id, description)
  values(auth.uid(), 'ADMIN_USER_UPDATED', 'Usuarios', target_user_id::text, 'Actualizó datos personales e institucionales');
end;
$$;

revoke all on function public.update_managed_profile(uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.update_managed_profile(uuid,text,text,text,text,text,text,text) to authenticated;

