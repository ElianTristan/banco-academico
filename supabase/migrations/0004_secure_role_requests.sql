-- Solicitudes docentes y control de cambios de rol exclusivamente en backend.
-- No elimina cuentas ni registros existentes.

create table if not exists public.teacher_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  employee_number text not null check (length(trim(employee_number)) between 2 and 40),
  department text not null check (length(trim(department)) between 2 and 120),
  justification text not null check (length(trim(justification)) between 20 and 2000),
  status text not null default 'Pendiente' check (status in ('Pendiente','Aprobada','Rechazada')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists teacher_applications_one_pending_per_user
  on public.teacher_applications(user_id) where status = 'Pendiente';
create index if not exists teacher_applications_review_queue
  on public.teacher_applications(status, created_at desc);
alter table public.teacher_applications enable row level security;

drop policy if exists "applicants and admins read teacher applications" on public.teacher_applications;
create policy "applicants and admins read teacher applications"
  on public.teacher_applications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- No INSERT/UPDATE/DELETE policies: all application mutations use the RPCs below.

-- A profile can never change its own role. Authenticated administrators also
-- cannot update role directly through PostgREST; the approval RPC is SECURITY DEFINER.
create or replace function public.protect_self_profile_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.role <> 'alumno' and auth.uid() is not null
       and current_user not in ('postgres', 'service_role') then
      raise exception 'Privileged roles require a trusted administrative workflow';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role and auth.uid() is not null then
    if current_user not in ('postgres', 'service_role') or not public.is_admin() then
      raise exception 'Role changes require a trusted administrative workflow';
    end if;
  end if;
  if auth.uid() is not null and not public.is_admin() then
    if new.id is distinct from old.id or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'Only profile details and preferences may be changed by the account owner';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before insert or update on public.profiles
  for each row execute function public.protect_self_profile_fields();

-- Helpers include the role check, so stale or incorrectly assigned relation rows
-- cannot grant a student teacher access (or vice versa).
create or replace function public.is_teacher_of(target_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'docente' and exists (
    select 1 from public.teacher_groups where teacher_id = auth.uid() and group_id = target_group
  ), false)
$$;
create or replace function public.is_enrolled_in(target_group uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'alumno' and exists (
    select 1 from public.enrollments where student_id = auth.uid() and group_id = target_group and status = 'active'
  ), false)
$$;

create or replace function public.submit_teacher_application(
  target_employee_number text, target_department text, target_justification text
) returns uuid language plpgsql security definer set search_path = public as $$
declare application_id uuid;
begin
  if auth.uid() is null or public.current_role() <> 'alumno' then
    raise exception 'Only an authenticated student may request teacher access';
  end if;
  if length(trim(target_employee_number)) not between 2 and 40
     or length(trim(target_department)) not between 2 and 120
     or length(trim(target_justification)) not between 20 and 2000 then
    raise exception 'Application details are invalid';
  end if;
  insert into public.teacher_applications(user_id, employee_number, department, justification)
  values (auth.uid(), trim(target_employee_number), trim(target_department), trim(target_justification))
  returning id into application_id;
  insert into public.activity_logs(user_id, action, module, record_id, description)
  values (auth.uid(), 'DOCENTE_REQUEST', 'Seguridad', application_id::text, 'Solicitud de acceso docente');
  return application_id;
end;
$$;

create or replace function public.review_teacher_application(
  target_application uuid, decision text, target_rejection_reason text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare application public.teacher_applications%rowtype;
begin
  if auth.uid() is null or public.current_role() <> 'administrador' then
    raise exception 'Only an administrator may review teacher applications';
  end if;
  if decision not in ('Aprobada', 'Rechazada') then
    raise exception 'Invalid application decision';
  end if;
  if decision = 'Rechazada' and length(trim(coalesce(target_rejection_reason, ''))) < 3 then
    raise exception 'A rejection reason is required';
  end if;

  select * into application from public.teacher_applications
  where id = target_application for update;
  if not found or application.status <> 'Pendiente' then
    raise exception 'Application is missing or has already been reviewed';
  end if;

  update public.teacher_applications set status = decision, reviewed_by = auth.uid(),
    reviewed_at = now(), updated_at = now(),
    rejection_reason = case when decision = 'Rechazada' then trim(target_rejection_reason) else null end
  where id = target_application;

  if decision = 'Aprobada' then
    -- The profile trigger permits this role change only in a trusted definer function.
    update public.profiles set role = 'docente', updated_at = now() where id = application.user_id;
    insert into public.teachers(id, employee_number, department)
    values (application.user_id, application.employee_number, application.department)
    on conflict (id) do update set employee_number = excluded.employee_number, department = excluded.department;
  end if;

  insert into public.activity_logs(user_id, action, module, record_id, description, details)
  values (auth.uid(), case when decision = 'Aprobada' then 'DOCENTE_APPROVED' else 'DOCENTE_REJECTED' end,
    'Seguridad', target_application::text, 'Revisó solicitud docente',
    jsonb_build_object('applicant_id', application.user_id, 'decision', decision));
end;
$$;

-- Repair policies whose previous predicates allowed cross-role or cross-group access.
drop policy if exists "students self teacher or admin" on public.students;
create policy "students self teacher or admin" on public.students for select to authenticated
using (students.id = auth.uid() or public.is_admin() or (public.current_role() = 'docente' and exists (
  select 1 from public.enrollments e join public.teacher_groups tg on tg.group_id = e.group_id
  where e.student_id = students.id and tg.teacher_id = auth.uid()
)));

drop policy if exists "teachers authenticated read" on public.teachers;
create policy "teachers self or admin read" on public.teachers for select to authenticated
using (teachers.id = auth.uid() or public.is_admin());

drop policy if exists "teacher assignments self admin read" on public.teacher_groups;
create policy "teacher assignments self admin read" on public.teacher_groups for select to authenticated
using ((public.current_role() = 'docente' and teacher_id = auth.uid()) or public.is_admin());

drop policy if exists "authors or admin update posts" on public.posts;
create policy "authors or admin update posts" on public.posts for update to authenticated
using (public.is_admin() or (public.current_role() = 'docente' and created_by = auth.uid() and group_id is not null and public.is_teacher_of(group_id)))
with check (public.is_admin() or (public.current_role() = 'docente' and created_by = auth.uid() and group_id is not null and public.is_teacher_of(group_id)));

drop policy if exists "teacher or admin update advisory sessions" on public.advisory_sessions;
create policy "teacher or admin update advisory sessions" on public.advisory_sessions for update to authenticated
using (public.is_admin() or (public.current_role() = 'docente' and teacher_id = auth.uid()))
with check (public.is_admin() or (public.current_role() = 'docente' and teacher_id = auth.uid()));
drop policy if exists "teacher or admin delete advisory sessions" on public.advisory_sessions;
create policy "teacher or admin delete advisory sessions" on public.advisory_sessions for delete to authenticated
using (public.is_admin() or (public.current_role() = 'docente' and teacher_id = auth.uid()));

-- Students can only cancel their own reservation; they cannot move it between
-- sessions or mark it as attended to manipulate capacity and records.
drop policy if exists "students cancel own reservations" on public.advisory_reservations;
create policy "students cancel own reservations" on public.advisory_reservations for update to authenticated
using (public.is_admin() or (public.current_role() = 'alumno' and student_id = auth.uid()))
with check (public.is_admin() or (public.current_role() = 'alumno' and student_id = auth.uid() and status = 'Cancelada'));
create or replace function public.guard_advisory_reservation_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if public.current_role() <> 'alumno' or old.student_id <> auth.uid()
       or new.student_id is distinct from old.student_id
       or new.session_id is distinct from old.session_id
       or old.status <> 'Reservada' or new.status <> 'Cancelada' then
      raise exception 'Students may only cancel their own active reservations';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists advisory_reservation_update_guard on public.advisory_reservations;
create trigger advisory_reservation_update_guard before update on public.advisory_reservations
for each row execute function public.guard_advisory_reservation_update();

-- Access events may only represent the authenticated user's own successful session.
-- Failed logins are recorded by Supabase Auth; they are never client-insertable.
drop policy if exists "signed in users record own events" on public.access_logs;
create policy "signed in users record own session events" on public.access_logs for insert to authenticated
with check (user_id = auth.uid() and succeeded = true and event_type in ('LOGIN','LOGOUT','PASSWORD_RESET'));
drop policy if exists "admins read activity logs" on public.activity_logs;
create policy "admins read activity logs" on public.activity_logs for select to authenticated using (public.is_admin());

revoke all on function public.submit_teacher_application(text, text, text) from public;
revoke all on function public.review_teacher_application(uuid, text, text) from public;
revoke all on function public.is_teacher_of(uuid) from public;
revoke all on function public.is_enrolled_in(uuid) from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.sync_role_profile() from public;
revoke all on function public.guard_material_review() from public;
revoke all on function public.bump_material_download_count() from public;
revoke all on function public.protect_self_profile_fields() from public;
revoke all on function public.protect_self_student_fields() from public;
revoke all on function public.guard_advisory_reservation_update() from public;
grant execute on function public.submit_teacher_application(text, text, text) to authenticated;
grant execute on function public.review_teacher_application(uuid, text, text) to authenticated;
grant execute on function public.is_teacher_of(uuid) to authenticated;
grant execute on function public.is_enrolled_in(uuid) to authenticated;
