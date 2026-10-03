-- Extiende el esquema inicial de Banco Académico sin alterar ni borrar datos.
create table public.materials (
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
create index materials_status_created_idx on public.materials(status,created_at desc);
create index materials_subject_status_idx on public.materials(subject_id,status);
create index materials_author_idx on public.materials(created_by,created_at desc);

create table public.material_favorites (
  student_id uuid not null references public.students(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(student_id,material_id)
);
create table public.material_downloads (
  id bigint generated always as identity primary key,
  material_id uuid not null references public.materials(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  downloaded_at timestamptz not null default now()
);
create index material_downloads_user_idx on public.material_downloads(user_id,downloaded_at desc);
create table public.advisory_sessions (
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
create index advisory_sessions_start_idx on public.advisory_sessions(status,starts_at);
create table public.advisory_reservations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.advisory_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'Reservada' check(status in ('Reservada','Cancelada','Atendida')),
  created_at timestamptz not null default now(),
  unique(session_id,student_id)
);
create index advisory_reservations_student_idx on public.advisory_reservations(student_id,created_at desc);

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
create function public.sync_role_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.role='alumno' then insert into public.students(id) values(new.id) on conflict(id) do nothing; end if;
  if new.role='docente' then insert into public.teachers(id) values(new.id) on conflict(id) do nothing; end if;
  return new;
end;
$$;
create trigger profiles_sync_academic_role after update of role on public.profiles for each row execute function public.sync_role_profile();

create function public.guard_material_review() returns trigger language plpgsql set search_path=public as $$
begin
  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Only administrators may review academic materials';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger materials_review_guard before update on public.materials for each row execute function public.guard_material_review();
create function public.bump_material_download_count() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.materials set download_count=download_count+1 where id=new.material_id;
  return new;
end;
$$;
create trigger material_download_counter after insert on public.material_downloads for each row execute function public.bump_material_download_count();

create function public.reserve_advisory(target_session uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare new_reservation uuid;
begin
  if auth.uid() is null or public.current_role() <> 'alumno' then
    raise exception 'Only students may reserve an advisory session';
  end if;
  perform 1 from public.advisory_sessions where id=target_session and status='Disponible' and starts_at > now() for update;
  if not found then raise exception 'This advisory session is not available'; end if;
  if (select count(*) from public.advisory_reservations where session_id=target_session and status='Reservada') >=
     (select capacity from public.advisory_sessions where id=target_session) then
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

create policy "visible materials" on public.materials for select to authenticated using (
  public.is_admin() or created_by=auth.uid() or
  (status in ('Aprobado','Verificado') and (group_id is null or public.is_enrolled_in(group_id) or public.is_teacher_of(group_id)))
);
create policy "members submit material for review" on public.materials for insert to authenticated with check (
  created_by=auth.uid() and public.current_role() in ('alumno','docente') and status='Pendiente'
  and (group_id is null or public.is_teacher_of(group_id) or (public.current_role()='alumno' and public.is_enrolled_in(group_id)))
);
create policy "authors edit pending metadata admin reviews" on public.materials for update to authenticated
using(public.is_admin() or (created_by=auth.uid() and status='Pendiente'))
with check(public.is_admin() or (created_by=auth.uid() and status='Pendiente'));
create policy "authors remove pending material admin manage" on public.materials for delete to authenticated
using(public.is_admin() or (created_by=auth.uid() and status='Pendiente'));

create policy "students read own favorites" on public.material_favorites for select to authenticated using(student_id=auth.uid() or public.is_admin());
create policy "students save visible materials" on public.material_favorites for insert to authenticated with check(
  student_id=auth.uid() and public.current_role()='alumno' and exists(
    select 1 from public.materials m where m.id=material_id and m.status in ('Aprobado','Verificado')
  )
);
create policy "students remove own favorites" on public.material_favorites for delete to authenticated using(student_id=auth.uid());
create policy "admins read material downloads" on public.material_downloads for select to authenticated using(public.is_admin());
create policy "members log own authorized downloads" on public.material_downloads for insert to authenticated with check(
  user_id=auth.uid() and exists(select 1 from public.materials m where m.id=material_id and m.status in ('Aprobado','Verificado')
  and (m.group_id is null or public.is_enrolled_in(m.group_id) or public.is_teacher_of(m.group_id) or public.is_admin()))
);

create policy "visible advisory sessions" on public.advisory_sessions for select to authenticated using(
  public.is_admin() or teacher_id=auth.uid() or (status='Disponible' and starts_at > now())
);
create policy "teachers create own advisory sessions" on public.advisory_sessions for insert to authenticated with check(
  public.current_role()='docente' and teacher_id=auth.uid()
);
create policy "teacher or admin update advisory sessions" on public.advisory_sessions for update to authenticated
using(teacher_id=auth.uid() or public.is_admin()) with check(teacher_id=auth.uid() or public.is_admin());
create policy "teacher or admin delete advisory sessions" on public.advisory_sessions for delete to authenticated
using(teacher_id=auth.uid() or public.is_admin());
create policy "students and session owners see reservations" on public.advisory_reservations for select to authenticated using(
  student_id=auth.uid() or public.is_admin() or exists(select 1 from public.advisory_sessions s where s.id=session_id and s.teacher_id=auth.uid())
);
create policy "students cancel own reservations" on public.advisory_reservations for update to authenticated
using(student_id=auth.uid() or public.is_admin()) with check(student_id=auth.uid() or public.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('academic-materials','academic-materials',false,26214400,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'])
on conflict(id) do update set public=false, file_size_limit=26214400,
  allowed_mime_types=excluded.allowed_mime_types;
create policy "authors upload material files" on storage.objects for insert to authenticated with check(
  bucket_id='academic-materials' and (storage.foldername(name))[1]=auth.uid()::text
);
create policy "authorized users read approved material files" on storage.objects for select to authenticated using(
  bucket_id='academic-materials' and exists(
    select 1 from public.materials m where m.storage_path=name and (
      public.is_admin() or m.created_by=auth.uid() or
      (m.status in ('Aprobado','Verificado') and (m.group_id is null or public.is_enrolled_in(m.group_id) or public.is_teacher_of(m.group_id)))
    )
  )
);
create policy "authors remove own material files" on storage.objects for delete to authenticated using(
  bucket_id='academic-materials' and (
    public.is_admin() or (
      (storage.foldername(name))[1]=auth.uid()::text and not exists(
        select 1 from public.materials m where m.storage_path=name and m.status in ('Aprobado','Verificado')
      )
    )
  )
);
