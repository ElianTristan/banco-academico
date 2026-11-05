-- Grupos, multimedia privada y contador de mensajes sin leer.
alter table public.chat_conversations
  add column if not exists is_group boolean not null default false,
  add column if not exists title text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.chat_participants
  add column if not exists last_read_at timestamptz not null default now();
alter table public.chat_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint;
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages add constraint chat_messages_body_check
  check (length(trim(body)) between 1 and 4000 or attachment_path is not null);
alter table public.chat_messages drop constraint if exists chat_messages_attachment_metadata_check;
alter table public.chat_messages add constraint chat_messages_attachment_metadata_check
  check (
    (attachment_path is null and attachment_name is null and attachment_mime is null and attachment_size is null)
    or (attachment_path is not null and attachment_name is not null and attachment_mime is not null and attachment_size is not null and attachment_size between 1 and 26214400)
  );
create index if not exists chat_messages_unread_idx
  on public.chat_messages(conversation_id, created_at desc, sender_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments', 'chat-attachments', false, 26214400,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_chat_attachment_path(target_path text, target_user uuid)
returns boolean language plpgsql stable security definer set search_path = public, storage, pg_temp set row_security = off as $$
declare folders text[];
begin
  if target_path is null or target_user is null then return false; end if;
  folders := storage.foldername(target_path);
  if coalesce(array_length(folders, 1), 0) < 2
     or folders[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_chat_participant(folders[2]::uuid, target_user);
end;
$$;
revoke all on function public.is_chat_attachment_path(text, uuid) from public, anon;
grant execute on function public.is_chat_attachment_path(text, uuid) to authenticated;

create or replace function public.chat_attachment_is_unlinked(target_path text)
returns boolean language sql stable security definer set search_path = public, pg_temp set row_security = off as $$
  select not exists (select 1 from public.chat_messages m where m.attachment_path = target_path)
$$;
revoke all on function public.chat_attachment_is_unlinked(text) from public, anon;
grant execute on function public.chat_attachment_is_unlinked(text) to authenticated;

drop policy if exists "chat members upload own attachments" on storage.objects;
create policy "chat members upload own attachments" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_chat_attachment_path(name, auth.uid())
  );
drop policy if exists "chat members read attachments" on storage.objects;
create policy "chat members read attachments" on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-attachments'
    and public.is_chat_attachment_path(name, auth.uid())
  );
drop policy if exists "authors delete unlinked chat attachments" on storage.objects;
create policy "authors delete unlinked chat attachments" on storage.objects
  for delete to authenticated using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_chat_attachment_path(name, auth.uid())
    and public.chat_attachment_is_unlinked(name)
  );

drop policy if exists "chat members send own messages" on public.chat_messages;
create policy "chat members send own messages" on public.chat_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and public.is_chat_participant(conversation_id, auth.uid())
    and public.current_role() in ('alumno', 'docente', 'administrador')
    and exists (select 1 from public.profiles active_user where active_user.id = auth.uid() and active_user.is_active = true)
    and (
      attachment_path is null
      or (
        attachment_path like auth.uid()::text || '/' || conversation_id::text || '/%'
        and public.is_chat_attachment_path(attachment_path, auth.uid())
      )
    )
  );
grant insert (conversation_id, sender_id, body, attachment_path, attachment_name, attachment_mime, attachment_size)
  on public.chat_messages to authenticated;

create or replace function public.create_group_chat(target_users uuid[], target_title text)
returns uuid language plpgsql security definer set search_path = public, pg_temp set row_security = off as $$
declare
  members uuid[];
  valid_members integer;
  new_conversation uuid;
  clean_title text := trim(coalesce(target_title, ''));
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true
      and p.role in ('alumno', 'docente', 'administrador')
  ) then raise exception 'La cuenta no puede iniciar grupos'; end if;
  if length(clean_title) < 2 or length(clean_title) > 100 then
    raise exception 'El nombre del grupo debe tener entre 2 y 100 caracteres';
  end if;
  select coalesce(array_agg(distinct member_id), '{}'::uuid[]) into members
    from unnest(coalesce(target_users, '{}'::uuid[])) as requested(member_id)
   where member_id is not null and member_id <> auth.uid();
  if cardinality(members) < 2 or cardinality(members) > 49 then
    raise exception 'Selecciona entre 2 y 49 personas para el grupo';
  end if;
  select count(*) into valid_members from public.profiles p
   where p.id = any(members) and p.is_active = true
     and p.role in ('alumno', 'docente', 'administrador');
  if valid_members <> cardinality(members) then raise exception 'Una cuenta seleccionada no está disponible'; end if;

  insert into public.chat_conversations (direct_key, is_group, title, created_by)
  values ('group:' || gen_random_uuid()::text, true, clean_title, auth.uid())
  returning id into new_conversation;
  insert into public.chat_participants (conversation_id, user_id)
  select new_conversation, member_id from unnest(array_append(members, auth.uid())) as participants(member_id);
  return new_conversation;
end;
$$;
revoke all on function public.create_group_chat(uuid[], text) from public, anon;
grant execute on function public.create_group_chat(uuid[], text) to authenticated;

drop function if exists public.list_my_chats();
create function public.list_my_chats()
returns table (
  conversation_id uuid,
  contact_id uuid,
  full_name text,
  role public.app_role,
  is_group boolean,
  member_count bigint,
  unread_count bigint,
  updated_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp set row_security = off as $$
  select c.id, other_user.id,
         case when c.is_group then coalesce(c.title, 'Grupo de chat') else coalesce(other_user.full_name, 'Usuario académico') end,
         other_user.role,
         c.is_group,
         (select count(*) from public.chat_participants cp join public.profiles p on p.id = cp.user_id and p.is_active = true where cp.conversation_id = c.id),
         (select count(*) from public.chat_messages m where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.created_at > mine.last_read_at),
         c.updated_at
    from public.chat_participants mine
    join public.chat_conversations c on c.id = mine.conversation_id
    left join lateral (
      select p.id, p.role, coalesce(nullif(trim(concat(p.first_name, ' ', p.last_name)), ''), 'Usuario académico') as full_name
        from public.chat_participants cp join public.profiles p on p.id = cp.user_id and p.is_active = true
       where cp.conversation_id = c.id and cp.user_id <> auth.uid()
       order by cp.joined_at, cp.user_id limit 1
    ) other_user on true
   where auth.uid() is not null and mine.user_id = auth.uid()
     and exists (select 1 from public.profiles active_user where active_user.id = auth.uid() and active_user.is_active = true)
   order by c.updated_at desc
$$;
revoke all on function public.list_my_chats() from public, anon;
grant execute on function public.list_my_chats() to authenticated;

drop function if exists public.list_chat_messages(uuid);
create function public.list_chat_messages(target_conversation uuid)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_name text,
  body text,
  created_at timestamptz,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint,
  attachment_path text
)
language sql stable security definer set search_path = public, pg_temp set row_security = off as $$
  select messages.id, messages.conversation_id, messages.sender_id, messages.sender_name,
         messages.body, messages.created_at, messages.attachment_name, messages.attachment_mime,
         messages.attachment_size, messages.attachment_path
    from (
      select m.id, m.conversation_id, m.sender_id,
             coalesce(nullif(trim(concat(p.first_name, ' ', p.last_name)), ''), 'Usuario académico') as sender_name,
             m.body, m.created_at, m.attachment_name, m.attachment_mime, m.attachment_size, m.attachment_path
        from public.chat_messages m join public.profiles p on p.id = m.sender_id
       where m.conversation_id = target_conversation
         and public.is_chat_participant(target_conversation, auth.uid())
       order by m.created_at desc limit 80
    ) messages
   order by messages.created_at asc
$$;
revoke all on function public.list_chat_messages(uuid) from public, anon;
grant execute on function public.list_chat_messages(uuid) to authenticated;

create or replace function public.mark_chat_read(target_conversation uuid)
returns void language plpgsql security definer set search_path = public, pg_temp set row_security = off as $$
begin
  if auth.uid() is null or not public.is_chat_participant(target_conversation, auth.uid()) then
    raise exception 'No tienes acceso a esta conversación';
  end if;
  update public.chat_participants set last_read_at = now()
   where conversation_id = target_conversation and user_id = auth.uid();
end;
$$;
revoke all on function public.mark_chat_read(uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid) to authenticated;

create or replace function public.count_unread_chat_messages()
returns bigint language sql stable security definer set search_path = public, pg_temp set row_security = off as $$
  select count(*)
    from public.chat_participants cp
    join public.profiles p on p.id = cp.user_id and p.is_active = true
    join public.chat_messages m on m.conversation_id = cp.conversation_id
   where cp.user_id = auth.uid() and auth.uid() is not null
     and m.sender_id <> auth.uid() and m.created_at > cp.last_read_at
$$;
revoke all on function public.count_unread_chat_messages() from public, anon;
grant execute on function public.count_unread_chat_messages() to authenticated;
