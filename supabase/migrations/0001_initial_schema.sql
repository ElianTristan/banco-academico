create extension if not exists pgcrypto;

create type public.app_role as enum ('alumno','docente','administrador');
create type public.access_event as enum ('LOGIN','LOGOUT','LOGIN_FAILED','PASSWORD_RESET');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text not null default '',
  last_name text not null default '',
  role public.app_role not null default 'alumno',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.careers (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  code text not null unique, description text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.students (
  id uuid primary key references public.profiles(id) on delete cascade,
  control_number text unique, career_id uuid references public.careers(id),
  admission_date date, created_at timestamptz not null default now()
);
create table public.teachers (
  id uuid primary key references public.profiles(id) on delete cascade,
  employee_number text unique, department text, created_at timestamptz not null default now()
);
create table public.academic_periods (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  starts_on date not null, ends_on date not null, is_current boolean not null default false,
  created_at timestamptz not null default now(), check (ends_on > starts_on)
);
create unique index academic_period_single_current on public.academic_periods(is_current) where is_current;
create table public.subjects (
  id uuid primary key default gen_random_uuid(), career_id uuid references public.careers(id) on delete restrict,
  code text not null unique, name text not null, credits smallint not null default 0 check (credits >= 0),
  semester smallint check (semester > 0), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.classrooms (
  id uuid primary key default gen_random_uuid(), building text, room_number text not null,
  capacity smallint check (capacity > 0), unique(building,room_number)
);
create table public.groups (
  id uuid primary key default gen_random_uuid(), code text not null, subject_id uuid not null references public.subjects(id),
  period_id uuid not null references public.academic_periods(id), classroom_id uuid references public.classrooms(id),
  active boolean not null default true, created_at timestamptz not null default now(),
  unique(code,subject_id,period_id)
);
create table public.enrollments (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade, enrolled_at timestamptz not null default now(),
  status text not null default 'active' check(status in ('active','withdrawn','completed')), unique(student_id,group_id)
);
create table public.teacher_groups (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references public.teachers(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade, assigned_at timestamptz not null default now(),
  unique(teacher_id,group_id)
);
create table public.grades (
  id uuid primary key default gen_random_uuid(), enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  score numeric(5,2) check(score >= 0 and score <= 100), assessment text not null,
  recorded_by uuid references public.teachers(id), recorded_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(enrollment_id,assessment)
);
create table public.schedules (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
  weekday smallint not null check(weekday between 1 and 7), starts_at time not null, ends_at time not null,
  classroom_id uuid references public.classrooms(id), check(ends_at > starts_at)
);
create table public.posts (
  id uuid primary key default gen_random_uuid(), title text not null, body text not null,
  group_id uuid references public.groups(id) on delete set null, subject_id uuid references public.subjects(id) on delete set null,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.access_logs (
  id bigint generated always as identity primary key, user_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(), event_type public.access_event not null,
  succeeded boolean not null, session_info jsonb not null default '{}'::jsonb
);
create table public.activity_logs (
  id bigint generated always as identity primary key, user_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(), action text not null, module text not null,
  record_id text, description text not null, details jsonb not null default '{}'::jsonb
);

create index students_career_idx on public.students(career_id);
create index subjects_career_idx on public.subjects(career_id);
create index groups_period_idx on public.groups(period_id);
create index enrollments_student_idx on public.enrollments(student_id);
create index enrollments_group_idx on public.enrollments(group_id);
create index teacher_groups_teacher_idx on public.teacher_groups(teacher_id);
create index grades_enrollment_idx on public.grades(enrollment_id);
create index schedules_group_idx on public.schedules(group_id);
create index posts_group_created_idx on public.posts(group_id,created_at desc);
create index access_logs_time_idx on public.access_logs(occurred_at desc);
create index access_logs_user_time_idx on public.access_logs(user_id,occurred_at desc);
create index activity_logs_time_idx on public.activity_logs(occurred_at desc);

create function public.current_role() returns public.app_role language sql stable security definer set search_path=public as $$
  select role from public.profiles where id=auth.uid()
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_role()='administrador',false)
$$;
create function public.is_teacher_of(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.teacher_groups where teacher_id=auth.uid() and group_id=target_group)
$$;
create function public.is_enrolled_in(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.enrollments where student_id=auth.uid() and group_id=target_group and status='active')
$$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,first_name,last_name,role)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'first_name',''),coalesce(new.raw_user_meta_data->>'last_name',''),'alumno');
  insert into public.students(id,control_number) values(new.id,nullif(new.raw_user_meta_data->>'control_number',''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function public.prevent_self_role_change() returns trigger language plpgsql set search_path=public as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an administrator may change account roles';
  end if;
  return new;
end;
$$;
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

create policy "profiles self or admin read" on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy "profile self update safe fields" on public.profiles for update to authenticated using(id=auth.uid() or public.is_admin()) with check(id=auth.uid() or public.is_admin());
create policy "admin manage profiles" on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "academic lookup authenticated" on public.careers for select to authenticated using(true);
create policy "careers admin manage" on public.careers for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "students self teacher or admin" on public.students for select to authenticated using(students.id=auth.uid() or public.is_admin() or exists(select 1 from public.enrollments e join public.teacher_groups tg on tg.group_id=e.group_id where e.student_id=students.id and tg.teacher_id=auth.uid()));
create policy "students admin manage" on public.students for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "teachers authenticated read" on public.teachers for select to authenticated using(true);
create policy "teachers admin manage" on public.teachers for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "periods authenticated read" on public.academic_periods for select to authenticated using(true);
create policy "periods admin manage" on public.academic_periods for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "subjects authenticated read" on public.subjects for select to authenticated using(true);
create policy "subjects admin manage" on public.subjects for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "classrooms authenticated read" on public.classrooms for select to authenticated using(true);
create policy "classrooms admin manage" on public.classrooms for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "groups visible to members" on public.groups for select to authenticated using(public.is_admin() or public.is_teacher_of(id) or public.is_enrolled_in(id));
create policy "groups admin manage" on public.groups for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "enrollments student teacher admin read" on public.enrollments for select to authenticated using(student_id=auth.uid() or public.is_admin() or public.is_teacher_of(group_id));
create policy "enrollments admin manage" on public.enrollments for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "teacher assignments self admin read" on public.teacher_groups for select to authenticated using(teacher_id=auth.uid() or public.is_admin());
create policy "teacher assignments admin manage" on public.teacher_groups for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "grades student teacher admin read" on public.grades for select to authenticated using(public.is_admin() or exists(select 1 from public.enrollments e where e.id=enrollment_id and (e.student_id=auth.uid() or public.is_teacher_of(e.group_id))));
create policy "teachers manage their grades" on public.grades for all to authenticated using(exists(select 1 from public.enrollments e where e.id=enrollment_id and public.is_teacher_of(e.group_id))) with check(exists(select 1 from public.enrollments e where e.id=enrollment_id and public.is_teacher_of(e.group_id) and recorded_by=auth.uid()));
create policy "schedule members read" on public.schedules for select to authenticated using(public.is_admin() or public.is_teacher_of(group_id) or public.is_enrolled_in(group_id));
create policy "schedules admin manage" on public.schedules for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "posts members read" on public.posts for select to authenticated using(deleted_at is null and (public.is_admin() or (group_id is not null and (public.is_teacher_of(group_id) or public.is_enrolled_in(group_id)))));
create policy "teachers publish to own groups" on public.posts for insert to authenticated with check(public.current_role()='docente' and created_by=auth.uid() and group_id is not null and public.is_teacher_of(group_id));
create policy "authors or admin update posts" on public.posts for update to authenticated using(created_by=auth.uid() or public.is_admin()) with check(created_by=auth.uid() or public.is_admin());
create policy "admins remove posts" on public.posts for delete to authenticated using(public.is_admin());
create policy "admins read access logs" on public.access_logs for select to authenticated using(public.is_admin());
create policy "signed in users record own events" on public.access_logs for insert to authenticated with check(user_id=auth.uid());
create policy "admins read activity logs" on public.activity_logs for select to authenticated using(public.is_admin());
create policy "signed in users record own activity" on public.activity_logs for insert to authenticated with check(user_id=auth.uid());

revoke all on function public.current_role() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
