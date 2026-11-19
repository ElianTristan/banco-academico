-- PDF adjuntos para tareas/anuncios y mensajería directa entre cuentas activas.
alter table public.posts add column if not exists attachment_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('academic-posts', 'academic-posts', false, 15728640, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['application/pdf'];

drop policy if exists "post authors upload pdf attachments" on storage.objects;
create policy "post authors upload pdf attachments" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'academic-posts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.is_active = true
         and p.role in ('alumno', 'docente', 'administrador')
    )
  );

drop policy if exists "post members read pdf attachments" on storage.objects;
create policy "post members read pdf attachments" on storage.objects
  for select to authenticated using (
    bucket_id = 'academic-posts'
    and exists (
      select 1 from public.posts p
       where p.attachment_path = name and p.deleted_at is null
         and (
           public.is_admin()
           or (p.group_id is null and public.current_role() = 'alumno')
           or (p.group_id is not null and (public.is_teacher_of(p.group_id) or public.is_enrolled_in(p.group_id)))
         )
    )
    and exists (select 1 from public.profiles active_user where active_user.id = auth.uid() and active_user.is_active = true)
  );

create or replace function public.post_pdf_is_unlinked(target_path text)
returns boolean language sql stable security definer set search_path = public, pg_temp set row_security = off as $$
  select not exists (select 1 from public.posts p where p.attachment_path = target_path)
$$;
revoke all on function public.post_pdf_is_unlinked(text) from public, anon;
grant execute on function public.post_pdf_is_unlinked(text) to authenticated;

drop policy if exists "authors delete unlinked post pdfs" on storage.objects;
create policy "authors delete unlinked post pdfs" on storage.objects
  for delete to authenticated using (
    bucket_id = 'academic-posts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.post_pdf_is_unlinked(name)
  );

drop policy if exists "teachers publish to own groups" on public.posts;
create policy "teachers publish to own groups" on public.posts
  for insert to authenticated with check (
    created_by = auth.uid() and (
      public.current_role() = 'administrador'
      or (public.current_role() = 'docente' and group_id is not null and public.is_teacher_of(group_id))
      or (public.current_role() = 'alumno' and group_id is not null and public.is_enrolled_in(group_id))
    )
    and exists (select 1 from public.profiles active_user where active_user.id = auth.uid() and active_user.is_active = true)
  );

create or replace function public.notify_post_recipients() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null then
    insert into public.notificaciones(usuario_destino_id, tipo, titulo, mensaje, remitente_id, remitente_nombre, remitente_rol, post_id)
    select distinct recipient.id, new.post_type, new.title, new.body, new.created_by,
           trim(concat(sender.first_name, ' ', sender.last_name)), sender.role, new.id
      from (
        select e.student_id as user_id from public.enrollments e
         where e.group_id = new.group_id and e.status = 'active'
        union
        select tg.teacher_id as user_id from public.teacher_groups tg
         where tg.group_id = new.group_id
      ) group_members
      join public.profiles recipient on recipient.id = group_members.user_id and recipient.is_active = true
      join public.profiles sender on sender.id = new.created_by
     where recipient.id <> new.created_by;
  elsif public.current_role() = 'administrador' then
    insert into public.notificaciones(usuario_destino_id, tipo, titulo, mensaje, remitente_id, remitente_nombre, remitente_rol, post_id)
    select p.id, new.post_type, new.title, new.body, new.created_by,
           trim(concat(sender.first_name, ' ', sender.last_name)), sender.role, new.id
      from public.profiles p
      join public.profiles sender on sender.id = new.created_by
     where p.role = 'alumno' and p.is_active = true and p.id <> new.created_by;
  end if;
  return new;
end;
$$;

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  direct_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.chat_participants (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages(conversation_id, created_at desc);
create index if not exists chat_participants_user_idx
  on public.chat_participants(user_id, conversation_id);

alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_conversations, public.chat_participants, public.chat_messages from anon, authenticated;
grant select on public.chat_conversations, public.chat_participants, public.chat_messages to authenticated;
grant insert (conversation_id, sender_id, body) on public.chat_messages to authenticated;

create or replace function public.is_chat_participant(target_conversation uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp set row_security = off as $$
  select exists (
    select 1 from public.chat_participants cp
     where cp.conversation_id = target_conversation and cp.user_id = target_user
  ) and exists (select 1 from public.profiles active_user where active_user.id = target_user and active_user.is_active = true)
$$;
revoke all on function public.is_chat_participant(uuid, uuid) from public, anon;
grant execute on function public.is_chat_participant(uuid, uuid) to authenticated;

drop policy if exists "chat members read conversations" on public.chat_conversations;
create policy "chat members read conversations" on public.chat_conversations
  for select to authenticated using (public.is_chat_participant(id, auth.uid()));
drop policy if exists "users read their chat participants" on public.chat_participants;
create policy "users read their chat participants" on public.chat_participants
  for select to authenticated using (public.is_chat_participant(conversation_id, auth.uid()));
drop policy if exists "chat members read messages" on public.chat_messages;
create policy "chat members read messages" on public.chat_messages
  for select to authenticated using (public.is_chat_participant(conversation_id, auth.uid()));
drop policy if exists "chat members send own messages" on public.chat_messages;
create policy "chat members send own messages" on public.chat_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and public.is_chat_participant(conversation_id, auth.uid())
    and public.current_role() in ('alumno', 'docente', 'administrador')
    and exists (select 1 from public.profiles active_user where active_user.id = auth.uid() and active_user.is_active = true)
  );

create or replace function public.list_chat_contacts()
returns table (id uuid, full_name text, role public.app_role)
language sql stable security definer set search_path = public, pg_temp set row_security = off as $$
  select p.id, coalesce(nullif(trim(concat(p.first_name, ' ', p.last_name)), ''), 'Usuario académico'), p.role
    from public.profiles p
   where auth.uid() is not null and p.is_active = true and p.id <> auth.uid()
     and exists (select 1 from public.profiles active_user where active_user.id = auth.uid() and active_user.is_active = true)
     and p.role in ('alumno', 'docente', 'administrador')
   order by p.role, p.first_name, p.last_name
$$;
revoke all on function public.list_chat_contacts() from public, anon;
grant execute on function public.list_chat_contacts() to authenticated;

create or replace function public.list_my_chats()
returns table (conversation_id uuid, contact_id uuid, full_name text, role public.app_role, updated_at timestamptz)
language sql stable security definer set search_path = public, pg_temp set row_security = off as $$
  select c.id, other_user.id,
         coalesce(nullif(trim(concat(other_user.first_name, ' ', other_user.last_name)), ''), 'Usuario académico'),
         other_user.role, c.updated_at
    from public.chat_participants mine
    join public.chat_conversations c on c.id = mine.conversation_id
    join public.chat_participants theirs on theirs.conversation_id = mine.conversation_id and theirs.user_id <> auth.uid()
    join public.profiles other_user on other_user.id = theirs.user_id and other_user.is_active = true
   where auth.uid() is not null and mine.user_id = auth.uid()
     and exists (select 1 from public.profiles active_user where active_user.id = auth.uid() and active_user.is_active = true)
   order by c.updated_at desc
$$;
revoke all on function public.list_my_chats() from public, anon;
grant execute on function public.list_my_chats() to authenticated;

create or replace function public.start_direct_chat(target_user uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp set row_security = off as $$
declare
  conversation uuid;
  conversation_key text;
begin
  if auth.uid() is null or target_user = auth.uid() then
    raise exception 'Selecciona otra cuenta para iniciar el chat';
  end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true)
     or not exists (select 1 from public.profiles p where p.id = target_user and p.is_active = true and p.role in ('alumno', 'docente', 'administrador')) then
    raise exception 'La cuenta seleccionada no está disponible';
  end if;
  conversation_key := least(auth.uid()::text, target_user::text) || ':' || greatest(auth.uid()::text, target_user::text);
  insert into public.chat_conversations (direct_key) values (conversation_key)
    on conflict (direct_key) do update set updated_at = public.chat_conversations.updated_at
    returning id into conversation;
  insert into public.chat_participants (conversation_id, user_id)
    values (conversation, auth.uid()), (conversation, target_user) on conflict do nothing;
  return conversation;
end;
$$;
revoke all on function public.start_direct_chat(uuid) from public, anon;
grant execute on function public.start_direct_chat(uuid) to authenticated;

create or replace function public.list_chat_messages(target_conversation uuid)
returns table (id uuid, conversation_id uuid, sender_id uuid, sender_name text, body text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp set row_security = off as $$
  select m.id, m.conversation_id, m.sender_id,
         coalesce(nullif(trim(concat(p.first_name, ' ', p.last_name)), ''), 'Usuario académico'),
         m.body, m.created_at
    from public.chat_messages m
    join public.profiles p on p.id = m.sender_id
   where auth.uid() is not null and m.conversation_id = target_conversation
     and public.is_chat_participant(target_conversation, auth.uid())
   order by m.created_at asc
   limit 300
$$;
revoke all on function public.list_chat_messages(uuid) from public, anon;
grant execute on function public.list_chat_messages(uuid) to authenticated;

create or replace function public.touch_chat_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.chat_conversations set updated_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists chat_messages_touch_conversation on public.chat_messages;
create trigger chat_messages_touch_conversation after insert on public.chat_messages
for each row execute function public.touch_chat_conversation();
revoke all on function public.touch_chat_conversation() from public, anon, authenticated;
