-- Keep student academic assignments under active administrator control.
create or replace function public.guard_student_academic_profile()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  institutional_career uuid;
  trusted_writer boolean;
begin
  trusted_writer := public.is_admin() or coalesce(auth.role(), '') = 'service_role';

  if tg_op = 'UPDATE' and not trusted_writer and auth.uid() is not null
     and (new.career_id is distinct from old.career_id
       or new.semester is distinct from old.semester
       or new.specialty is distinct from old.specialty) then
    raise exception 'Solo administración puede cambiar la carrera, el semestre o la especialidad';
  end if;

  if tg_op = 'INSERT' and not trusted_writer and auth.uid() is not null
     and (new.career_id is not null or new.semester is not null or new.specialty is not null) then
    raise exception 'Solo administración puede asignar datos académicos';
  end if;

  if new.career_id is null then
    select id into institutional_career
    from public.careers
    where name = 'Ingeniería en Sistemas' and active;

    if institutional_career is null then
      raise exception 'La carrera institucional no está configurada';
    end if;

    new.career_id := institutional_career;
  elsif not exists (
    select 1 from public.careers where id = new.career_id and active
  ) then
    raise exception 'La carrera seleccionada no existe o está inactiva';
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
revoke all on function public.guard_student_academic_profile() from public, anon, authenticated;

-- Retain the existing RPC signature for deployed clients, but never accept
-- academic assignments from the student's own profile form.
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
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.current_role() <> 'alumno' then
    raise exception 'Solo un alumno autenticado puede actualizar su perfil';
  end if;
  if length(btrim(coalesce(target_first_name, ''))) not between 1 and 80
     or length(btrim(coalesce(target_last_name, ''))) not between 1 and 100 then
    raise exception 'El nombre o los apellidos no son válidos';
  end if;
  if target_preferred_theme not in ('light', 'dark') then
    raise exception 'El tema visual no es válido';
  end if;
  if coalesce(target_avatar_path, '') <> ''
     and split_part(target_avatar_path, '/', 1) <> auth.uid()::text then
    raise exception 'La fotografía no pertenece a la cuenta';
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

  if not exists (select 1 from public.students where id = auth.uid()) then
    raise exception 'No se encontró el registro académico del alumno';
  end if;

  insert into public.activity_logs (user_id, action, module, description)
  values (auth.uid(), 'Actualizó su perfil', 'Perfil', 'Datos personales y preferencias');
end;
$$;

revoke all on function public.save_student_academic_profile(text, text, text, text, smallint, text)
  from public, anon;
grant execute on function public.save_student_academic_profile(text, text, text, text, smallint, text)
  to authenticated;

-- Admins can correct grades through the authenticated client while RLS continues
-- to restrict teachers to groups assigned to them.
drop policy if exists "administrators manage grades" on public.grades;
create policy "administrators manage grades" on public.grades
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.grades'::regclass
      and conname = 'grades_recorded_by_fkey'
      and confrelid <> 'public.profiles'::regclass
  ) then
    alter table public.grades drop constraint grades_recorded_by_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.grades'::regclass
      and conname = 'grades_recorded_by_fkey'
      and confrelid = 'public.profiles'::regclass
  ) then
    alter table public.grades
      add constraint grades_recorded_by_fkey
      foreign key (recorded_by) references public.profiles(id) on delete set null;
  end if;
end;
$$;

create or replace function public.audit_grade_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  grade_row public.grades;
  actor_id uuid;
begin
  if tg_op = 'DELETE' then
    grade_row := old;
  else
    grade_row := new;
  end if;
  actor_id := coalesce(auth.uid(), grade_row.recorded_by);

  insert into public.activity_logs (user_id, action, module, record_id, description, details)
  values (
    actor_id,
    case tg_op when 'INSERT' then 'GRADE_CREATED' when 'UPDATE' then 'GRADE_UPDATED' else 'GRADE_DELETED' end,
    'Calificaciones',
    grade_row.id::text,
    case tg_op
      when 'INSERT' then 'Registró una calificación'
      when 'UPDATE' then 'Actualizó una calificación'
      else 'Eliminó una calificación'
    end,
    jsonb_build_object(
      'enrollment_id', grade_row.enrollment_id,
      'assessment', grade_row.assessment,
      'previous_score', case when tg_op = 'INSERT' then null else old.score end,
      'score', case when tg_op = 'DELETE' then null else new.score end
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_grade_change() from public, anon, authenticated;
drop trigger if exists grades_audit_changes on public.grades;
create trigger grades_audit_changes
  after insert or update or delete on public.grades
  for each row execute function public.audit_grade_change();
