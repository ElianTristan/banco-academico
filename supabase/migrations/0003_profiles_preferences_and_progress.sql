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

create policy "students update own academic profile" on public.students
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy "users upload own profile photo" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "users update own profile photo" on storage.objects
  for update to authenticated using (
    bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "users view own profile photo" on storage.objects
  for select to authenticated using (
    bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "users delete own profile photo" on storage.objects
  for delete to authenticated using (
    bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
