-- Track resource consultations from this migration forward; existing activity
-- has no reliable view history to backfill.
create table if not exists public.material_views (
  id bigint generated always as identity primary key,
  material_id uuid not null references public.materials(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index if not exists material_views_time_idx
  on public.material_views(viewed_at desc);
create index if not exists material_views_material_time_idx
  on public.material_views(material_id, viewed_at desc);

alter table public.material_views enable row level security;

revoke all on public.material_views from public, anon;
grant select, insert on public.material_views to authenticated;

drop policy if exists "members log authorized material views" on public.material_views;
create policy "members log authorized material views" on public.material_views
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.materials as material
      where material.id = material_id
        and material.status in ('Aprobado', 'Verificado')
        and (
          material.group_id is null
          or public.is_enrolled_in(material.group_id)
          or public.is_teacher_of(material.group_id)
          or public.is_admin()
        )
    )
  );

drop policy if exists "admins and assigned teachers read material views" on public.material_views;
create policy "admins and assigned teachers read material views" on public.material_views
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.materials as material
      where material.id = material_id
        and (
          material.created_by = auth.uid()
          or (
            material.group_id is not null
            and public.is_teacher_of(material.group_id)
          )
        )
    )
  );

drop policy if exists "assigned teachers read material downloads" on public.material_downloads;
create policy "assigned teachers read material downloads" on public.material_downloads
  for select to authenticated
  using (
    exists (
      select 1
      from public.materials as material
      where material.id = material_downloads.material_id
        and (
          material.created_by = auth.uid()
          or (
            material.group_id is not null
            and public.is_teacher_of(material.group_id)
          )
        )
    )
  );
