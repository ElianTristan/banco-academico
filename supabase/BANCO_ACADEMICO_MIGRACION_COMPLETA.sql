-- BANCO ACADEMICO — INSTALACION COMPLETA E IDEMPOTENTE
-- Pega TODO este archivo en Supabase > SQL Editor y pulsa Run.
-- Incluye las cuatro migraciones ordenadas. No elimina tablas ni registros existentes.
-- Puede ejecutarse de nuevo: reemplaza políticas/funciones y preserva los datos.

BEGIN;

-- ===== 0001_initial_schema.sql: base del sistema =====
create extension if not exists pgcrypto;

do $$ begin create type public.app_role as enum ('alumno','docente','administrador'); exception when duplicate_object then null; end $$;
do $$ begin create type public.access_event as enum ('LOGIN','LOGOUT','LOGIN_FAILED','PASSWORD_RESET'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text not null default '',
  last_name text not null default '',
  role public.app_role not null default 'alumno',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.careers (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  code text not null unique, description text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.students (
  id uuid primary key references public.profiles(id) on delete cascade,
  control_number text unique, career_id uuid references public.careers(id),
  admission_date date, created_at timestamptz not null default now()
);
create table if not exists public.teachers (
  id uuid primary key references public.profiles(id) on delete cascade,
  employee_number text unique, department text, created_at timestamptz not null default now()
);
create table if not exists public.academic_periods (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  starts_on date not null, ends_on date not null, is_current boolean not null default false,
  created_at timestamptz not null default now(), check (ends_on > starts_on)
);
create unique index if not exists academic_period_single_current on public.academic_periods(is_current) where is_current;
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(), career_id uuid references public.careers(id) on delete restrict,
  code text not null unique, name text not null, credits smallint not null default 0 check (credits >= 0),
  semester smallint check (semester > 0), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(), building text, room_number text not null,
  capacity smallint check (capacity > 0), unique(building,room_number)
);
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(), code text not null, subject_id uuid not null references public.subjects(id),
  period_id uuid not null references public.academic_periods(id), classroom_id uuid references public.classrooms(id),
  active boolean not null default true, created_at timestamptz not null default now(),
  unique(code,subject_id,period_id)
);
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade, enrolled_at timestamptz not null default now(),
  status text not null default 'active' check(status in ('active','withdrawn','completed')), unique(student_id,group_id)
);
create table if not exists public.teacher_groups (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.teachers(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade, assigned_at timestamptz not null default now(),
  unique(teacher_id,group_id)
);
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(), enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  score numeric(5,2) check(score >= 0 and score <= 100), assessment text not null,
  recorded_by uuid references public.teachers(id), recorded_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(enrollment_id,assessment)
);
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
  weekday smallint not null check(weekday between 1 and 7), starts_at time not null, ends_at time not null,
  classroom_id uuid references public.classrooms(id), check(ends_at > starts_at)
);
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(), title text not null, body text not null,
  group_id uuid references public.groups(id) on delete set null, subject_id uuid references public.subjects(id) on delete set null,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.access_logs (
  id bigint generated always as identity primary key, user_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(), event_type public.access_event not null,
  succeeded boolean not null, session_info jsonb not null default '{}'::jsonb
);
create table if not exists public.activity_logs (
  id bigint generated always as identity primary key, user_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(), action text not null, module text not null,
  record_id text, description text not null, details jsonb not null default '{}'::jsonb
);

create index if not exists students_career_idx on public.students(career_id);
create index if not exists subjects_career_idx on public.subjects(career_id);
create index if not exists groups_period_idx on public.groups(period_id);
create index if not exists enrollments_student_idx on public.enrollments(student_id);
create index if not exists enrollments_group_idx on public.enrollments(group_id);
create index if not exists teacher_groups_teacher_idx on public.teacher_groups(teacher_id);
create index if not exists grades_enrollment_idx on public.grades(enrollment_id);
create index if not exists schedules_group_idx on public.schedules(group_id);
create index if not exists posts_group_created_idx on public.posts(group_id,created_at desc);
create index if not exists access_logs_time_idx on public.access_logs(occurred_at desc);
create index if not exists access_logs_user_time_idx on public.access_logs(user_id,occurred_at desc);
create index if not exists activity_logs_time_idx on public.activity_logs(occurred_at desc);

create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path=public as $$
  select role from public.profiles where id=auth.uid()
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_role()='administrador',false)
$$;
create or replace function public.is_teacher_of(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.teacher_groups where teacher_id=auth.uid() and group_id=target_group)
$$;
create or replace function public.is_enrolled_in(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.enrollments where student_id=auth.uid() and group_id=target_group and status='active')
$$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,first_name,last_name,role)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'first_name',''),coalesce(new.raw_user_meta_data->>'last_name',''),'alumno');
  insert into public.students(id,control_number) values(new.id,nullif(new.raw_user_meta_data->>'control_number',''));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create or replace function public.prevent_self_role_change() returns trigger language plpgsql set search_path=public as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an administrator may change account roles';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before update on public.profiles for each row execute function public.prevent_self_role_change();

alter table public.profiles enable row level security;
alter table public.careers enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.academic_periods enable row level security;
alter table public.subjects enable row level security;
alter table public.classrooms enable row level security;
alter table public.groups enable row level security;
alter table public.enrollments enable row level security;
alter table public.teacher_groups enable row level security;
alter table public.grades enable row level security;
alter table public.schedules enable row level security;
alter table public.posts enable row level security;
alter table public.access_logs enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "profiles self or admin read" on public.profiles;
create policy "profiles self or admin read" on public.profiles for select to authenticated using(profiles.id=auth.uid() or public.is_admin());
drop policy if exists "profile self update safe fields" on public.profiles;
create policy "profile self update safe fields" on public.profiles for update to authenticated using(profiles.id=auth.uid() or public.is_admin()) with check(profiles.id=auth.uid() or public.is_admin());
drop policy if exists "admin manage profiles" on public.profiles;
create policy "admin manage profiles" on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "academic lookup authenticated" on public.careers;
create policy "academic lookup authenticated" on public.careers for select to authenticated using(true);
drop policy if exists "careers admin manage" on public.careers;
create policy "careers admin manage" on public.careers for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "students self teacher or admin" on public.students;
create policy "students self teacher or admin" on public.students for select to authenticated using(students.id=auth.uid() or public.is_admin() or exists(select 1 from public.enrollments e join public.teacher_groups tg on tg.group_id=e.group_id where e.student_id=students.id and tg.teacher_id=auth.uid()));
drop policy if exists "students admin manage" on public.students;
create policy "students admin manage" on public.students for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "teachers authenticated read" on public.teachers;
create policy "teachers authenticated read" on public.teachers for select to authenticated using(true);
drop policy if exists "teachers admin manage" on public.teachers;
create policy "teachers admin manage" on public.teachers for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "periods authenticated read" on public.academic_periods;
create policy "periods authenticated read" on public.academic_periods for select to authenticated using(true);
drop policy if exists "periods admin manage" on public.academic_periods;
create policy "periods admin manage" on public.academic_periods for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "subjects authenticated read" on public.subjects;
create policy "subjects authenticated read" on public.subjects for select to authenticated using(true);
drop policy if exists "subjects admin manage" on public.subjects;
create policy "subjects admin manage" on public.subjects for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "classrooms authenticated read" on public.classrooms;
create policy "classrooms authenticated read" on public.classrooms for select to authenticated using(true);
drop policy if exists "classrooms admin manage" on public.classrooms;
create policy "classrooms admin manage" on public.classrooms for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "groups visible to members" on public.groups;
create policy "groups visible to members" on public.groups for select to authenticated using(public.is_admin() or public.is_teacher_of(groups.id) or public.is_enrolled_in(groups.id));
drop policy if exists "groups admin manage" on public.groups;
create policy "groups admin manage" on public.groups for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "enrollments student teacher admin read" on public.enrollments;
create policy "enrollments student teacher admin read" on public.enrollments for select to authenticated using(student_id=auth.uid() or public.is_admin() or public.is_teacher_of(group_id));
drop policy if exists "enrollments admin manage" on public.enrollments;
create policy "enrollments admin manage" on public.enrollments for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "teacher assignments self admin read" on public.teacher_groups;
create policy "teacher assignments self admin read" on public.teacher_groups for select to authenticated using(teacher_id=auth.uid() or public.is_admin());
drop policy if exists "teacher assignments admin manage" on public.teacher_groups;
create policy "teacher assignments admin manage" on public.teacher_groups for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "grades student teacher admin read" on public.grades;
create policy "grades student teacher admin read" on public.grades for select to authenticated using(public.is_admin() or exists(select 1 from public.enrollments e where e.id=grades.enrollment_id and (e.student_id=auth.uid() or public.is_teacher_of(e.group_id))));
drop policy if exists "teachers manage their grades" on public.grades;
create policy "teachers manage their grades" on public.grades for all to authenticated using(exists(select 1 from public.enrollments e where e.id=grades.enrollment_id and public.is_teacher_of(e.group_id))) with check(exists(select 1 from public.enrollments e where e.id=grades.enrollment_id and public.is_teacher_of(e.group_id) and grades.recorded_by=auth.uid()));
drop policy if exists "schedule members read" on public.schedules;
create policy "schedule members read" on public.schedules for select to authenticated using(public.is_admin() or public.is_teacher_of(group_id) or public.is_enrolled_in(group_id));
drop policy if exists "schedules admin manage" on public.schedules;
create policy "schedules admin manage" on public.schedules for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "posts members read" on public.posts;
create policy "posts members read" on public.posts for select to authenticated using(deleted_at is null and (public.is_admin() or (group_id is not null and (public.is_teacher_of(group_id) or public.is_enrolled_in(group_id)))));
drop policy if exists "teachers publish to own groups" on public.posts;
create policy "teachers publish to own groups" on public.posts for insert to authenticated with check(public.current_role()='docente' and created_by=auth.uid() and group_id is not null and public.is_teacher_of(group_id));
drop policy if exists "authors or admin update posts" on public.posts;
create policy "authors or admin update posts" on public.posts for update to authenticated using(created_by=auth.uid() or public.is_admin()) with check(created_by=auth.uid() or public.is_admin());
drop policy if exists "admins remove posts" on public.posts;
create policy "admins remove posts" on public.posts for delete to authenticated using(public.is_admin());
drop policy if exists "admins read access logs" on public.access_logs;
create policy "admins read access logs" on public.access_logs for select to authenticated using(public.is_admin());
drop policy if exists "signed in users record own events" on public.access_logs;
create policy "signed in users record own events" on public.access_logs for insert to authenticated with check(user_id=auth.uid());
drop policy if exists "admins read activity logs" on public.activity_logs;
create policy "admins read activity logs" on public.activity_logs for select to authenticated using(public.is_admin());
drop policy if exists "signed in users record own activity" on public.activity_logs;
create policy "signed in users record own activity" on public.activity_logs for insert to authenticated with check(user_id=auth.uid());

revoke all on function public.current_role() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ===== 0002_library_and_advisories.sql: biblioteca, materiales y asesorias =====
-- Extiende el esquema inicial de Banco Académico sin alterar ni borrar datos.
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 180),
  description text not null default '',
  career_id uuid references public.careers(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  semester smallint check (semester > 0),
  unit text,
  material_type text not null check (material_type in ('Apuntes','Guía','Ejercicios','Presentación','Práctica','Lectura','Resumen','Otro')),
  storage_path text,
  status text not null default 'Pendiente' check (status in ('Pendiente','Aprobado','Verificado','Rechazado')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  download_count bigint not null default 0 check (download_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists materials_status_created_idx on public.materials(status,created_at desc);
create index if not exists materials_subject_status_idx on public.materials(subject_id,status);
create index if not exists materials_author_idx on public.materials(created_by,created_at desc);

create table if not exists public.material_favorites (
  student_id uuid not null references public.students(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(student_id,material_id)
);
create table if not exists public.material_downloads (
  id bigint generated always as identity primary key,
  material_id uuid not null references public.materials(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  downloaded_at timestamptz not null default now()
);
create index if not exists material_downloads_user_idx on public.material_downloads(user_id,downloaded_at desc);
create table if not exists public.advisory_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title)) between 3 and 180),
  description text not null default '',
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity smallint not null default 1 check(capacity between 1 and 100),
  status text not null default 'Disponible' check(status in ('Disponible','Cancelada','Finalizada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at > starts_at)
);
create index if not exists advisory_sessions_start_idx on public.advisory_sessions(status,starts_at);
create table if not exists public.advisory_reservations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.advisory_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'Reservada' check(status in ('Reservada','Cancelada','Atendida')),
  created_at timestamptz not null default now(),
  unique(session_id,student_id)
);
create index if not exists advisory_reservations_student_idx on public.advisory_reservations(student_id,created_at desc);

-- Mantiene las tablas de extensión docente/alumno alineadas al rol asignado.
-- La operación desde SQL Editor/servicio confiable está permitida; un usuario
-- autenticado no puede promoverse a sí mismo.
create or replace function public.prevent_self_role_change() returns trigger language plpgsql set search_path=public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an administrator may change account roles';
  end if;
  return new;
end;
$$;
insert into public.students(id)
select p.id from public.profiles p where p.role='alumno' on conflict(id) do nothing;
insert into public.teachers(id)
select p.id from public.profiles p where p.role='docente' on conflict(id) do nothing;
create or replace function public.sync_role_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.role='alumno' then insert into public.students(id) values(new.id) on conflict(id) do nothing; end if;
  if new.role='docente' then insert into public.teachers(id) values(new.id) on conflict(id) do nothing; end if;
  return new;
end;
$$;
drop trigger if exists profiles_sync_academic_role on public.profiles;
create trigger profiles_sync_academic_role after update of role on public.profiles for each row execute function public.sync_role_profile();

create or replace function public.guard_material_review() returns trigger language plpgsql set search_path=public as $$
begin
  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Only administrators may review academic materials';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists materials_review_guard on public.materials;
create trigger materials_review_guard before update on public.materials for each row execute function public.guard_material_review();
create or replace function public.bump_material_download_count() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.materials set download_count=download_count+1 where materials.id=new.material_id;
  return new;
end;
$$;
drop trigger if exists material_download_counter on public.material_downloads;
create trigger material_download_counter after insert on public.material_downloads for each row execute function public.bump_material_download_count();

create or replace function public.reserve_advisory(target_session uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare new_reservation uuid;
begin
  if auth.uid() is null or public.current_role() <> 'alumno' then
    raise exception 'Only students may reserve an advisory session';
  end if;
  perform 1 from public.advisory_sessions where advisory_sessions.id=target_session and status='Disponible' and starts_at > now() for update;
  if not found then raise exception 'This advisory session is not available'; end if;
  if (select count(*) from public.advisory_reservations where session_id=target_session and status='Reservada') >=
     (select capacity from public.advisory_sessions where advisory_sessions.id=target_session) then
    raise exception 'This advisory session is full';
  end if;
  insert into public.advisory_reservations(session_id,student_id)
  values(target_session,auth.uid()) returning id into new_reservation;
  return new_reservation;
end;
$$;
revoke all on function public.reserve_advisory(uuid) from public;
grant execute on function public.reserve_advisory(uuid) to authenticated;

alter table public.materials enable row level security;
alter table public.material_favorites enable row level security;
alter table public.material_downloads enable row level security;
alter table public.advisory_sessions enable row level security;
alter table public.advisory_reservations enable row level security;

drop policy if exists "visible materials" on public.materials;
create policy "visible materials" on public.materials for select to authenticated using (
  public.is_admin() or created_by=auth.uid() or
  (status in ('Aprobado','Verificado') and (group_id is null or public.is_enrolled_in(group_id) or public.is_teacher_of(group_id)))
);
drop policy if exists "members submit material for review" on public.materials;
create policy "members submit material for review" on public.materials for insert to authenticated with check (
  created_by=auth.uid() and public.current_role() in ('alumno','docente') and status='Pendiente'
  and (group_id is null or public.is_teacher_of(group_id) or (public.current_role()='alumno' and public.is_enrolled_in(group_id)))
);
drop policy if exists "authors edit pending metadata admin reviews" on public.materials;
create policy "authors edit pending metadata admin reviews" on public.materials for update to authenticated
using(public.is_admin() or (created_by=auth.uid() and status='Pendiente'))
with check(public.is_admin() or (created_by=auth.uid() and status='Pendiente'));
drop policy if exists "authors remove pending material admin manage" on public.materials;
create policy "authors remove pending material admin manage" on public.materials for delete to authenticated
using(public.is_admin() or (created_by=auth.uid() and status='Pendiente'));

drop policy if exists "students read own favorites" on public.material_favorites;
create policy "students read own favorites" on public.material_favorites for select to authenticated using(student_id=auth.uid() or public.is_admin());
drop policy if exists "students save visible materials" on public.material_favorites;
create policy "students save visible materials" on public.material_favorites for insert to authenticated with check(
  student_id=auth.uid() and public.current_role()='alumno' and exists(
    select 1 from public.materials m where m.id=material_id and m.status in ('Aprobado','Verificado')
  )
);
drop policy if exists "students remove own favorites" on public.material_favorites;
create policy "students remove own favorites" on public.material_favorites for delete to authenticated using(student_id=auth.uid());
drop policy if exists "admins read material downloads" on public.material_downloads;
create policy "admins read material downloads" on public.material_downloads for select to authenticated using(public.is_admin());
drop policy if exists "members log own authorized downloads" on public.material_downloads;
create policy "members log own authorized downloads" on public.material_downloads for insert to authenticated with check(
  user_id=auth.uid() and exists(select 1 from public.materials m where m.id=material_id and m.status in ('Aprobado','Verificado')
  and (m.group_id is null or public.is_enrolled_in(m.group_id) or public.is_teacher_of(m.group_id) or public.is_admin()))
);

drop policy if exists "visible advisory sessions" on public.advisory_sessions;
create policy "visible advisory sessions" on public.advisory_sessions for select to authenticated using(
  public.is_admin() or teacher_id=auth.uid() or (status='Disponible' and starts_at > now())
);
drop policy if exists "teachers create own advisory sessions" on public.advisory_sessions;
create policy "teachers create own advisory sessions" on public.advisory_sessions for insert to authenticated with check(
  public.current_role()='docente' and teacher_id=auth.uid()
);
drop policy if exists "teacher or admin update advisory sessions" on public.advisory_sessions;
create policy "teacher or admin update advisory sessions" on public.advisory_sessions for update to authenticated
using(teacher_id=auth.uid() or public.is_admin()) with check(teacher_id=auth.uid() or public.is_admin());
drop policy if exists "teacher or admin delete advisory sessions" on public.advisory_sessions;
create policy "teacher or admin delete advisory sessions" on public.advisory_sessions for delete to authenticated
using(teacher_id=auth.uid() or public.is_admin());
drop policy if exists "students and session owners see reservations" on public.advisory_reservations;
create policy "students and session owners see reservations" on public.advisory_reservations for select to authenticated using(
  student_id=auth.uid() or public.is_admin() or exists(select 1 from public.advisory_sessions s where s.id=session_id and s.teacher_id=auth.uid())
);
drop policy if exists "students cancel own reservations" on public.advisory_reservations;
create policy "students cancel own reservations" on public.advisory_reservations for update to authenticated
using(student_id=auth.uid() or public.is_admin()) with check(student_id=auth.uid() or public.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('academic-materials','academic-materials',false,26214400,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'])
on conflict(id) do update set public=false, file_size_limit=26214400,
  allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "authors upload material files" on storage.objects;
create policy "authors upload material files" on storage.objects for insert to authenticated with check(
  bucket_id='academic-materials' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "authorized users read approved material files" on storage.objects;
create policy "authorized users read approved material files" on storage.objects for select to authenticated using(
  bucket_id='academic-materials' and exists(
    select 1 from public.materials m where m.storage_path=name and (
      public.is_admin() or m.created_by=auth.uid() or
      (m.status in ('Aprobado','Verificado') and (m.group_id is null or public.is_enrolled_in(m.group_id) or public.is_teacher_of(m.group_id)))
    )
  )
);
drop policy if exists "authors remove own material files" on storage.objects;
create policy "authors remove own material files" on storage.objects for delete to authenticated using(
  bucket_id='academic-materials' and (
    public.is_admin() or (
      (storage.foldername(name))[1]=auth.uid()::text and not exists(
        select 1 from public.materials m where m.storage_path=name and m.status in ('Aprobado','Verificado')
      )
    )
  )
);

-- ===== 0003_profiles_preferences_and_progress.sql: perfil, fotografia y tema =====
alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists preferred_theme text not null default 'light'
    check (preferred_theme in ('light', 'dark'));

alter table public.students
  add column if not exists semester smallint check (semester between 1 and 20),
  add column if not exists specialty text;

create or replace function public.protect_self_profile_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.id is distinct from old.id or new.email is distinct from old.email
       or new.role is distinct from old.role or new.created_at is distinct from old.created_at then
      raise exception 'Only profile details and preferences may be changed by the account owner';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before update on public.profiles
  for each row execute function public.protect_self_profile_fields();

create or replace function public.protect_self_student_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.id is distinct from old.id or new.control_number is distinct from old.control_number
       or new.admission_date is distinct from old.admission_date or new.created_at is distinct from old.created_at then
      raise exception 'Account owners cannot change institutional identifiers';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists students_protect_self_fields on public.students;
create trigger students_protect_self_fields before update on public.students
  for each row execute function public.protect_self_student_fields();

drop policy if exists "students update own academic profile" on public.students;
create policy "students update own academic profile" on public.students
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "users upload own profile photo" on storage.objects;
create policy "users upload own profile photo" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "users update own profile photo" on storage.objects;
create policy "users update own profile photo" on storage.objects
  for update to authenticated using (
    bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "users view own profile photo" on storage.objects;
create policy "users view own profile photo" on storage.objects
  for select to authenticated using (
    bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "users delete own profile photo" on storage.objects;
create policy "users delete own profile photo" on storage.objects
  for delete to authenticated using (
    bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ===== 0004_secure_role_requests.sql: solicitudes docentes y control de roles =====
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
drop policy if exists "teachers self or admin read" on public.teachers;
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
drop policy if exists "signed in users record own session events" on public.access_logs;
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

COMMIT;
