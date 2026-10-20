-- BANCO ACADEMICO — INSTALACION COMPLETA E IDEMPOTENTE
-- Pega TODO este archivo en Supabase > SQL Editor y pulsa Run.
-- Incluye las diez migraciones ordenadas. No elimina tablas ni registros existentes.
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

-- ===== 0005_server_login_identifier_lookup.sql =====
create or replace function public.resolve_login_email(target_role text, target_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if target_role is null
     or target_role not in ('alumno', 'docente')
     or target_identifier is null
     or length(btrim(target_identifier)) not between 2 and 80 then
    return null;
  end if;

  if target_role = 'alumno' then
    select student.id into target_user_id
    from public.students as student
    where student.control_number = btrim(target_identifier);
  else
    select teacher.id into target_user_id
    from public.teachers as teacher
    where teacher.employee_number = btrim(target_identifier);
  end if;

  if target_user_id is null then
    return null;
  end if;

  return (
    select profile.email
    from public.profiles as profile
    where profile.id = target_user_id
      and profile.role::text = target_role
  );
end;
$$;

revoke all on function public.resolve_login_email(text, text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text, text) to service_role;

-- ===== 0006_server_auth_attempts.sql =====
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

-- ===== 0007_account_auth_attempt_limits.sql =====
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

-- ===== 0008_reset_login_attempts_after_password_recovery.sql =====
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

-- ===== 0009_fixed_academic_profile_and_subject_catalog.sql =====
-- Keep the institutional program fixed without rewriting existing student rows.
insert into public.careers (name, code, description, active)
values ('Ingeniería en Sistemas', 'ING-SIS', 'Programa académico institucional del Banco Académico.', true)
on conflict do nothing;

do $$
begin
  if not exists (
    select 1 from public.careers
    where name = 'Ingeniería en Sistemas' and active
  ) then
    raise exception 'No se pudo establecer la carrera institucional Ingeniería en Sistemas; revisa conflictos en public.careers.';
  end if;
end;
$$;

create table if not exists public.academic_specialties (
  code text primary key,
  name text not null unique,
  active boolean not null default true
);

insert into public.academic_specialties (code, name)
values
  ('ciberseguridad', 'Ciberseguridad'),
  ('gestion_servicios_ti', 'Gestión de Servicios de TI')
on conflict (code) do update set name = excluded.name, active = true;

create table if not exists public.subject_specialties (
  subject_id uuid not null references public.subjects(id) on delete cascade,
  specialty_code text not null references public.academic_specialties(code) on delete restrict,
  primary key (subject_id, specialty_code)
);

alter table public.academic_specialties enable row level security;
alter table public.subject_specialties enable row level security;

drop policy if exists "academic specialties authenticated read" on public.academic_specialties;
create policy "academic specialties authenticated read"
  on public.academic_specialties for select to authenticated using (true);
drop policy if exists "academic specialties admin manage" on public.academic_specialties;
create policy "academic specialties admin manage"
  on public.academic_specialties for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "subject specialties authenticated read" on public.subject_specialties;
create policy "subject specialties authenticated read"
  on public.subject_specialties for select to authenticated using (true);
drop policy if exists "subject specialties admin manage" on public.subject_specialties;
create policy "subject specialties admin manage"
  on public.subject_specialties for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.academic_specialties to authenticated;
grant select, insert, update, delete on public.subject_specialties to authenticated;

-- Preserve the seed across transaction boundaries used by SQL editors.
create temporary table academic_catalog_seed (
  code text primary key,
  name text not null,
  specialty_code text
);

insert into academic_catalog_seed (code, name, specialty_code) values
  ('IS-GEN-001', 'Cálculo Diferencial', null),
  ('IS-GEN-002', 'Fundamentos de Programación', null),
  ('IS-GEN-003', 'Taller de Ética', null),
  ('IS-GEN-004', 'Matemáticas Discretas', null),
  ('IS-GEN-005', 'Administración para Informática', null),
  ('IS-GEN-006', 'Cálculo Integral', null),
  ('IS-GEN-007', 'Programación Orientada a Objetos', null),
  ('IS-GEN-008', 'Contabilidad Financiera', null),
  ('IS-GEN-009', 'Química', null),
  ('IS-GEN-010', 'Álgebra Lineal', null),
  ('IS-GEN-011', 'Cálculo Vectorial', null),
  ('IS-GEN-012', 'Estructura de Datos', null),
  ('IS-GEN-013', 'Cultura Empresarial', null),
  ('IS-GEN-014', 'Electricidad y Magnetismo', null),
  ('IS-GEN-015', 'Investigación de Operaciones', null),
  ('IS-GEN-016', 'Ecuaciones Diferenciales', null),
  ('IS-GEN-017', 'Métodos Numéricos', null),
  ('IS-GEN-018', 'Fundamentos de Telecomunicaciones', null),
  ('IS-GEN-019', 'Taller de Investigación I', null),
  ('IS-GEN-020', 'Tópicos de Programación', null),
  ('IS-GEN-021', 'Sistemas Operativos', null),
  ('IS-GEN-022', 'Fundamentos de Bases de Datos', null),
  ('IS-GEN-023', 'Taller de Bases de Datos', null),
  ('IS-GEN-024', 'Fundamentos de Ingeniería de Software', null),
  ('IS-GEN-025', 'Redes de Computadoras', null),
  ('IS-GEN-026', 'Graficación', null),
  ('IS-GEN-027', 'Desarrollo Sustentable', null),
  ('IS-GEN-028', 'Administración de Bases de Datos', null),
  ('IS-GEN-029', 'Ingeniería de Software', null),
  ('IS-GEN-030', 'Conmutación y Enrutamiento en Redes de Datos', null),
  ('IS-GEN-031', 'Lenguajes y Autómatas I', null),
  ('IS-GEN-032', 'Taller de Sistemas Operativos', null),
  ('IS-GEN-033', 'Taller de Administración', null),
  ('IS-GEN-034', 'Lenguajes y Autómatas II', null),
  ('IS-GEN-035', 'Programación Web', null),
  ('IS-GEN-036', 'Administración de Redes', null),
  ('IS-GEN-037', 'Taller de Investigación II', null),
  ('IS-GEN-038', 'Sistemas Distribuidos', null),
  ('IS-GEN-039', 'Gestión de Proyectos de Software', null),
  ('IS-GEN-040', 'Programación Lógica y Funcional', null),
  ('IS-GEN-041', 'Inteligencia Artificial', null),
  ('IS-GEN-042', 'Desarrollo de Aplicaciones Móviles', null),
  ('IS-GEN-043', 'Gestión de la Calidad del Software', null),
  ('IS-GEN-044', 'Residencia Profesional', null),
  ('IS-GEN-045', 'Servicio Social', null),
  ('IS-GEN-046', 'Actividades Complementarias', null),
  ('IS-CIB-001', 'Auditoría de Seguridad', 'ciberseguridad'),
  ('IS-CIB-002', 'Seguridad de las Tecnologías de Información', 'ciberseguridad'),
  ('IS-CIB-003', 'Gestión de Operaciones', 'ciberseguridad'),
  ('IS-CIB-004', 'Tópicos Avanzados de Redes', 'ciberseguridad'),
  ('IS-CIB-005', 'Tópicos de Seguridad Informática', 'ciberseguridad'),
  ('IS-GSTI-001', 'Gestión de Operaciones de TI', 'gestion_servicios_ti'),
  ('IS-GSTI-002', 'Big Data y Análisis', 'gestion_servicios_ti'),
  ('IS-GSTI-003', 'Internet de las Cosas', 'gestion_servicios_ti'),
  ('IS-GSTI-004', 'Taller de Habilidades Directivas', 'gestion_servicios_ti'),
  ('IS-GSTI-005', 'Gestión de Servicios y Gobernanza de TI', 'gestion_servicios_ti'),
  ('IS-GSTI-006', 'Ciberseguridad', 'gestion_servicios_ti');

do $$
declare institutional_career uuid;
begin
  select id into institutional_career
  from public.careers
  where name = 'Ingeniería en Sistemas' and active;

  if exists (
    select 1
    from public.subjects subject
    join academic_catalog_seed catalog on lower(btrim(subject.name)) = lower(btrim(catalog.name))
    where subject.career_id = institutional_career or subject.career_id is null
    group by lower(btrim(subject.name))
    having count(*) > 1
  ) then
    raise exception 'Hay materias duplicadas en el catálogo institucional. Corrige los duplicados conservando sus referencias antes de aplicar esta migración.';
  end if;
end;
$$;

-- Adopt only exact-name legacy catalog rows that have not yet been linked to a career.
update public.subjects subject
set career_id = career.id
from public.careers career, academic_catalog_seed catalog
where career.name = 'Ingeniería en Sistemas'
  and subject.career_id is null
  and lower(btrim(subject.name)) = lower(btrim(catalog.name));

insert into public.subjects (career_id, code, name, credits, semester, active)
select career.id, catalog.code, catalog.name, 0, null, true
from public.careers career
cross join academic_catalog_seed catalog
where career.name = 'Ingeniería en Sistemas'
  and not exists (
    select 1 from public.subjects existing
    where existing.career_id = career.id
      and lower(btrim(existing.name)) = lower(btrim(catalog.name))
  )
on conflict do nothing;

do $$
begin
  if exists (
    select 1
    from academic_catalog_seed catalog
    where not exists (
      select 1
      from public.subjects subject
      join public.careers career on career.id = subject.career_id
      where career.name = 'Ingeniería en Sistemas'
        and lower(btrim(subject.name)) = lower(btrim(catalog.name))
    )
  ) then
    raise exception 'No se pudo completar el catálogo; verifica conflictos de códigos o nombres en public.subjects.';
  end if;
end;
$$;

create unique index if not exists subjects_career_name_normalized_idx
  on public.subjects (career_id, lower(btrim(name)))
  where career_id is not null;

insert into public.subject_specialties (subject_id, specialty_code)
select subject.id, catalog.specialty_code
from academic_catalog_seed catalog
join public.careers career on career.name = 'Ingeniería en Sistemas'
join public.subjects subject
  on subject.career_id = career.id
 and lower(btrim(subject.name)) = lower(btrim(catalog.name))
where catalog.specialty_code is not null
on conflict do nothing;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.students'::regclass
      and conname = 'students_semester_range_1_13'
  ) then
    alter table public.students
      add constraint students_semester_range_1_13
      check (semester is null or semester between 1 and 13) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.students'::regclass
      and conname = 'students_specialty_allowed'
  ) then
    alter table public.students
      add constraint students_specialty_allowed
      check (specialty is null or specialty in ('Ciberseguridad', 'Gestión de Servicios de TI')) not valid;
  end if;
end;
$$;

create or replace function public.guard_student_academic_profile()
returns trigger
language plpgsql
set search_path = public
as $$
declare institutional_career uuid;
begin
  select id into institutional_career
  from public.careers
  where name = 'Ingeniería en Sistemas' and active;

  if institutional_career is null then
    raise exception 'La carrera institucional no está configurada';
  end if;

  if new.career_id is null then
    new.career_id := institutional_career;
  elsif new.career_id is distinct from institutional_career then
    raise exception 'Solo se permite Ingeniería en Sistemas';
  end if;

  if new.semester is not null and new.semester not between 1 and 13 then
    raise exception 'El semestre debe estar entre 1 y 13';
  end if;

  if new.specialty is not null
     and new.specialty not in ('Ciberseguridad', 'Gestión de Servicios de TI') then
    raise exception 'La especialidad no está permitida';
  end if;

  return new;
end;
$$;

drop trigger if exists students_academic_profile_guard on public.students;
create trigger students_academic_profile_guard
  before insert or update of career_id, semester, specialty on public.students
  for each row execute function public.guard_student_academic_profile();
revoke all on function public.guard_student_academic_profile() from public;

create or replace function public.save_student_academic_profile(
  target_first_name text,
  target_last_name text,
  target_preferred_theme text,
  target_avatar_path text,
  target_semester smallint,
  target_specialty text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare institutional_career uuid;
begin
  if auth.uid() is null or public.current_role() <> 'alumno' then
    raise exception 'Solo un alumno autenticado puede actualizar su perfil académico';
  end if;
  if length(btrim(coalesce(target_first_name, ''))) not between 1 and 80
     or length(btrim(coalesce(target_last_name, ''))) not between 1 and 100 then
    raise exception 'El nombre o los apellidos no son válidos';
  end if;
  if target_preferred_theme not in ('light', 'dark') then
    raise exception 'El tema visual no es válido';
  end if;
  if target_semester is null or target_semester not between 1 and 13 then
    raise exception 'El semestre debe estar entre 1 y 13';
  end if;
  if target_specialty is not null
     and target_specialty not in ('Ciberseguridad', 'Gestión de Servicios de TI') then
    raise exception 'La especialidad no está permitida';
  end if;
  if coalesce(target_avatar_path, '') <> ''
     and split_part(target_avatar_path, '/', 1) <> auth.uid()::text then
    raise exception 'La fotografía no pertenece a la cuenta';
  end if;

  select id into institutional_career
  from public.careers
  where name = 'Ingeniería en Sistemas' and active;
  if institutional_career is null then
    raise exception 'La carrera institucional no está configurada';
  end if;

  update public.profiles
  set first_name = btrim(target_first_name),
      last_name = btrim(target_last_name),
      preferred_theme = target_preferred_theme,
      avatar_path = case when coalesce(target_avatar_path, '') = '' then avatar_path else target_avatar_path end,
      updated_at = now()
  where id = auth.uid();
  if not found then
    raise exception 'No se encontró el perfil de la cuenta';
  end if;

  update public.students
  set career_id = institutional_career,
      semester = target_semester,
      specialty = nullif(target_specialty, '')
  where id = auth.uid();
  if not found then
    raise exception 'No se encontró el registro académico del alumno';
  end if;

  insert into public.activity_logs (user_id, action, module, description)
  values (auth.uid(), 'Actualizó su perfil académico', 'Perfil', 'Datos personales, carrera, semestre y especialidad');
end;
$$;

revoke all on function public.save_student_academic_profile(text, text, text, text, smallint, text)
  from public, anon;
grant execute on function public.save_student_academic_profile(text, text, text, text, smallint, text)
  to authenticated;

drop table academic_catalog_seed;

-- ===== 0010_admin_user_lifecycle.sql =====
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
    'Creó una cuenta institucional con contraseña temporal',
    jsonb_build_object('role', target_role)
  );
end;
$$;

revoke all on function public.finalize_admin_created_user(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_admin_created_user(uuid, uuid, text, text, text, text)
  to service_role;

-- ===== 0011_institutional_temporary_password.sql =====
-- Las altas gestionadas por administración asignan la contraseña temporal institucional
-- (Tec12345!) y se auditan sin almacenar contraseñas ni secretos en texto plano.

COMMIT;
