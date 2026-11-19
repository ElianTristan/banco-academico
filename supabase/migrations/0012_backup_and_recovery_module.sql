begin;

-- ============================================================================
-- 0012_backup_and_recovery_module.sql
-- Configura el bucket institucional para almacenamiento seguro de respaldos
-- de la base de datos de Banco Académico con políticas estrictas RLS que
-- restringen el acceso exclusivamente a administradores activos.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'institutional-backups',
  'institutional-backups',
  false,
  104857600, -- 100 MB máximo
  array['application/zip', 'application/x-zip-compressed', 'application/octet-stream']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = array['application/zip', 'application/x-zip-compressed', 'application/octet-stream'];

-- Políticas RLS sobre storage.objects para el bucket institutional-backups
-- Solo administradores activos pueden consultar, subir, actualizar o eliminar respaldos.

drop policy if exists "institutional backups admin read" on storage.objects;
create policy "institutional backups admin read" on storage.objects
  for select to authenticated using (
    bucket_id = 'institutional-backups' and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'administrador' and is_active = true
    )
  );

drop policy if exists "institutional backups admin insert" on storage.objects;
create policy "institutional backups admin insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'institutional-backups' and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'administrador' and is_active = true
    )
  );

drop policy if exists "institutional backups admin update" on storage.objects;
create policy "institutional backups admin update" on storage.objects
  for update to authenticated using (
    bucket_id = 'institutional-backups' and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'administrador' and is_active = true
    )
  ) with check (
    bucket_id = 'institutional-backups' and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'administrador' and is_active = true
    )
  );

drop policy if exists "institutional backups admin delete" on storage.objects;
create policy "institutional backups admin delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'institutional-backups' and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'administrador' and is_active = true
    )
  );

commit;
