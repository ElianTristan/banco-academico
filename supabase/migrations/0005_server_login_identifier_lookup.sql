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
