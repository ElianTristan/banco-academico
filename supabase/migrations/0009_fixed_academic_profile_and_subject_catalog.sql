begin;

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

commit;
