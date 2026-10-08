-- =====================================================================
-- BRIXA — migration 053: the chat like Messenger
-- Each office and each team has its own conversation (its people and their manager, kept up to date
-- as people move); personal chats are their own kind, with anyone in BRIXA (someone of another agency
-- gets a message request to accept); one conversation for everyone in BRIXA (no pushes unless one
-- turns them on; BRIXA may take a message down there). Reactions, replying to a message, "seen", and
-- finding anyone in BRIXA by name.
-- =====================================================================

alter table public.chat_rooms drop constraint if exists chat_rooms_kind_check;
alter table public.chat_rooms
  add constraint chat_rooms_kind_check check (kind in ('agency', 'office', 'team', 'group', 'direct', 'brixa'));
alter table public.chat_rooms alter column organization_id drop not null;
alter table public.chat_rooms
  add constraint chat_rooms_org_check check (organization_id is not null or kind = 'brixa'),
  add column office_id uuid references public.offices (id) on delete cascade,
  add column team_id uuid references public.teams (id) on delete cascade;

create unique index chat_rooms_one_brixa on public.chat_rooms (kind) where kind = 'brixa';
create unique index chat_rooms_one_per_office on public.chat_rooms (office_id) where office_id is not null;
create unique index chat_rooms_one_per_team on public.chat_rooms (team_id) where team_id is not null;

-- the personal chats made so far (two people, no name)
update public.chat_rooms r set kind = 'direct'
where r.kind = 'group' and r.title is null
  and (select count(*) from public.chat_members m where m.room_id = r.id) = 2;

alter table public.chat_messages
  add column reply_to uuid references public.chat_messages (id) on delete set null;

-- ---------------------------------------------------------------------
-- Reading: everyone in BRIXA's own conversation reads all of it
-- ---------------------------------------------------------------------
create or replace function public.can_read_chat_message(target_room uuid, sent_at timestamptz, message_kind text, sender_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members m
    join public.chat_rooms r on r.id = m.room_id
    where m.room_id = target_room and m.profile_id = auth.uid() and m.status = 'active'
      and (r.kind = 'brixa' or m.organization_id = r.organization_id or sent_at >= m.joined_at)
      and (message_kind not in ('client', 'deal') or sender_org = m.organization_id)
  );
$$;

-- a reply points within its own conversation
drop policy if exists "chat messages: write" on public.chat_messages;
create policy "chat messages: write" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and kind in ('text', 'image', 'file', 'voice')
    and ref_id is null and card is null
    and public.is_chat_member(room_id)
    and organization_id = (select m.organization_id from public.chat_members m where m.room_id = chat_messages.room_id and m.profile_id = auth.uid())
    and (file_path is null or file_path like room_id::text || '/%')
    and (chat_messages.reply_to is null or exists (select 1 from public.chat_messages x where x.id = chat_messages.reply_to and x.room_id = chat_messages.room_id))
  );

-- ---------------------------------------------------------------------
-- Offices and teams: a conversation each, with their people
-- ---------------------------------------------------------------------
create or replace function public.sync_unit_chats(target_profile uuid, target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.chat_members c
  using public.chat_rooms r
  where r.id = c.room_id and c.profile_id = target_profile
    and r.organization_id = target_org and r.kind in ('office', 'team')
    and not exists (
      select 1 from public.organization_members m
      where m.organization_id = target_org and m.profile_id = target_profile
        and ((r.kind = 'office' and r.office_id = m.office_id)
          or (r.kind = 'team' and (r.team_id = m.team_id or exists (select 1 from public.teams t where t.id = r.team_id and t.manager_id = target_profile)))));

  insert into public.chat_members (room_id, profile_id, organization_id)
  select r.id, target_profile, target_org
  from public.chat_rooms r
  join public.organization_members m on m.organization_id = r.organization_id and m.profile_id = target_profile
  where r.organization_id = target_org and r.kind in ('office', 'team')
    and ((r.kind = 'office' and r.office_id = m.office_id)
      or (r.kind = 'team' and (r.team_id = m.team_id or exists (select 1 from public.teams t where t.id = r.team_id and t.manager_id = target_profile))))
  on conflict (room_id, profile_id) do update set status = 'active';
end;
$$;

revoke execute on function public.sync_unit_chats(uuid, uuid) from public, anon, authenticated;

create or replace function public.chat_on_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'offices' then
    insert into public.chat_rooms (organization_id, kind, office_id) values (new.organization_id, 'office', new.id) on conflict do nothing;
  else
    if tg_op = 'INSERT' then
      insert into public.chat_rooms (organization_id, kind, team_id) values (new.organization_id, 'team', new.id) on conflict do nothing;
    elsif old.manager_id is not null and old.manager_id is distinct from new.manager_id then
      perform public.sync_unit_chats(old.manager_id, new.organization_id);
    end if;
    if new.manager_id is not null then
      perform public.sync_unit_chats(new.manager_id, new.organization_id);
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.chat_on_unit() from public, anon, authenticated;

create trigger offices_chat_room
  after insert on public.offices
  for each row execute function public.chat_on_unit();

create trigger teams_chat_room
  after insert or update of manager_id on public.teams
  for each row execute function public.chat_on_unit();

-- ---------------------------------------------------------------------
-- Everyone in BRIXA: one conversation (no pushes unless one turns them on)
-- ---------------------------------------------------------------------
insert into public.chat_rooms (organization_id, kind, title, shared) values (null, 'brixa', null, true)
on conflict do nothing;

create or replace function public.chat_on_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- leaving the agency: out of its conversations (the messages stay)
    delete from public.chat_members where profile_id = old.profile_id and organization_id = old.organization_id;
    return old;
  end if;
  if tg_op = 'INSERT' then
    insert into public.chat_members (room_id, profile_id, organization_id)
    select r.id, new.profile_id, new.organization_id
    from public.chat_rooms r
    where r.organization_id = new.organization_id and r.kind = 'agency'
    on conflict (room_id, profile_id) do update set status = 'active', organization_id = excluded.organization_id;
    insert into public.chat_members (room_id, profile_id, organization_id, muted)
    select r.id, new.profile_id, new.organization_id, true
    from public.chat_rooms r where r.kind = 'brixa'
    on conflict (room_id, profile_id) do nothing;
  end if;
  perform public.sync_unit_chats(new.profile_id, new.organization_id);
  return new;
end;
$$;

drop trigger if exists organization_members_chat on public.organization_members;
create trigger organization_members_chat
  after insert or delete or update of office_id, team_id on public.organization_members
  for each row execute function public.chat_on_member_change();

-- what's here already
insert into public.chat_rooms (organization_id, kind, office_id)
select organization_id, 'office', id from public.offices
on conflict do nothing;
insert into public.chat_rooms (organization_id, kind, team_id)
select organization_id, 'team', id from public.teams
on conflict do nothing;
do $$
declare
  m record;
begin
  for m in select profile_id, organization_id from public.organization_members loop
    perform public.sync_unit_chats(m.profile_id, m.organization_id);
  end loop;
end;
$$;
insert into public.chat_members (room_id, profile_id, organization_id, muted, last_read_at)
select (select id from public.chat_rooms where kind = 'brixa'), m.profile_id, m.organization_id, true, now()
from (select distinct on (profile_id) profile_id, organization_id from public.organization_members order by profile_id, created_at) m
on conflict do nothing;

-- ---------------------------------------------------------------------
-- A new message: the office's or team's name on the push; nothing for the muted
-- ---------------------------------------------------------------------
create or replace function public.chat_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room record;
  member record;
  room_name text;
begin
  update public.chat_rooms set last_message_at = new.created_at where id = new.room_id
  returning * into room;
  if new.kind = 'system' then return new; end if;

  room_name := case room.kind
    when 'agency' then (select name from public.organizations where id = room.organization_id)
    when 'office' then (select name from public.offices where id = room.office_id)
    when 'team' then (select name from public.teams where id = room.team_id)
    when 'brixa' then 'BRIXA'
    else room.title end;
  for member in
    select * from public.chat_members
    where room_id = new.room_id and status = 'active' and not muted and profile_id is distinct from new.sender_id
      and (new.kind not in ('client', 'deal') or organization_id = new.organization_id)
  loop
    perform public.notify(member.organization_id, member.profile_id, new.sender_id, 'chat_message',
      jsonb_build_object(
        'title', room_name,
        'kind', case when room.kind = 'direct' then 'direct' else 'group' end,
        'actor', public.person_name(new.sender_id),
        'text', public.chat_preview(new.kind, new.body, new.card, new.file_name)),
      '/chat/' || new.room_id);
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Personal chats: with a colleague at once; with someone of another agency, a request they accept
-- ---------------------------------------------------------------------
create or replace function public.start_direct_chat(person uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_org uuid;
  their_org uuid;
  found_room uuid;
  new_room uuid;
begin
  select organization_id into my_org from public.organization_members where profile_id = me order by created_at limit 1;
  select organization_id into their_org from public.organization_members where profile_id = person order by created_at limit 1;
  if my_org is null or their_org is null or person = me then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select r.id into found_room
  from public.chat_rooms r
  where r.kind = 'direct'
    and exists (select 1 from public.chat_members a where a.room_id = r.id and a.profile_id = me and a.status <> 'left')
    and exists (select 1 from public.chat_members b where b.room_id = r.id and b.profile_id = person and b.status <> 'left')
  limit 1;
  if found_room is not null then return found_room; end if;

  insert into public.chat_rooms (organization_id, kind, created_by, shared)
  values (my_org, 'direct', me, their_org <> my_org)
  returning id into new_room;
  insert into public.chat_members (room_id, profile_id, organization_id) values (new_room, me, my_org);
  if their_org = my_org then
    insert into public.chat_members (room_id, profile_id, organization_id, invited_by) values (new_room, person, their_org, me);
  else
    insert into public.chat_members (room_id, profile_id, organization_id, status, invited_by) values (new_room, person, their_org, 'invited', me);
    perform public.notify(their_org, person, me, 'chat_invite',
      jsonb_build_object('room', new_room, 'title', public.person_name(me), 'actor', public.person_name(me),
        'agency', (select name from public.organizations where id = my_org), 'direct', true),
      '/chat');
  end if;
  return new_room;
end;
$$;

revoke execute on function public.start_direct_chat(uuid) from public, anon;
grant execute on function public.start_direct_chat(uuid) to authenticated;

-- A group with one colleague and no name is a personal chat.
create or replace function public.create_chat_group(group_title text, people uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  org uuid;
  everyone uuid[];
  clean_title text := nullif(btrim(coalesce(group_title, '')), '');
  new_room uuid;
begin
  select organization_id into org from public.organization_members where profile_id = me order by created_at limit 1;
  if org is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  select array_agg(distinct m.profile_id) into everyone
  from public.organization_members m
  where m.organization_id = org and (m.profile_id = any (coalesce(people, '{}')) or m.profile_id = me);
  if cardinality(everyone) < 2 then raise exception 'no_people'; end if;
  if clean_title is null and cardinality(everyone) = 2 then
    return public.start_direct_chat((select p from unnest(everyone) p where p <> me));
  end if;

  insert into public.chat_rooms (organization_id, kind, title, created_by)
  values (org, 'group', left(clean_title, 80), me)
  returning id into new_room;
  insert into public.chat_members (room_id, profile_id, organization_id, invited_by)
  select new_room, p, org, case when p = me then null else me end from unnest(everyone) p;
  return new_room;
end;
$$;

-- An invitation accepted: one sees what was written since one was invited (a message request too).
create or replace function public.answer_chat_invite(target_room uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.chat_members where room_id = target_room and profile_id = me and status = 'invited') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if accept then
    update public.chat_members set status = 'active', last_read_at = now()
    where room_id = target_room and profile_id = me;
    if (select kind from public.chat_rooms where id = target_room) <> 'direct' then
      insert into public.chat_messages (room_id, sender_id, organization_id, kind, body)
      values (target_room, me, public.my_chat_org(target_room), 'system',
        'joined:' || public.person_name(me) || ' (' || (select name from public.organizations where id = public.my_chat_org(target_room)) || ')');
    end if;
  else
    delete from public.chat_members where room_id = target_room and profile_id = me;
  end if;
  delete from public.notifications where recipient_id = me and type = 'chat_invite' and data ->> 'room' = target_room::text;
end;
$$;

-- BRIXA may take a message down in everyone's conversation.
create or replace function public.delete_chat_message(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  done uuid;
begin
  update public.chat_messages x
  set deleted_at = now(), body = null, card = null, file_path = null
  where x.id = target and x.deleted_at is null and x.kind <> 'system'
    and (x.sender_id = auth.uid()
      or (public.is_platform_admin() and exists (select 1 from public.chat_rooms r where r.id = x.room_id and r.kind = 'brixa')))
  returning x.id into done;
  if done is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  return done;
end;
$$;

-- ---------------------------------------------------------------------
-- Reactions: one per person per message
-- ---------------------------------------------------------------------
create table public.chat_reactions (
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '👍', '😂', '😮', '😢', '🙏')),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

create index chat_reactions_room_idx on public.chat_reactions (room_id);

alter table public.chat_reactions enable row level security;

create or replace function public.can_react(target_message uuid, target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_messages x
    where x.id = target_message and x.room_id = target_room and x.deleted_at is null and x.kind <> 'system'
      and public.can_read_chat_message(x.room_id, x.created_at, x.kind, x.organization_id)
  );
$$;

revoke execute on function public.can_react(uuid, uuid) from public, anon;
grant execute on function public.can_react(uuid, uuid) to authenticated;

create policy "chat reactions: read" on public.chat_reactions
  for select to authenticated using (public.can_react(message_id, room_id));
create policy "chat reactions: add own" on public.chat_reactions
  for insert to authenticated with check (profile_id = auth.uid() and public.can_react(message_id, room_id));
create policy "chat reactions: change own" on public.chat_reactions
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.can_react(message_id, room_id));
create policy "chat reactions: take back own" on public.chat_reactions
  for delete to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- Anyone in BRIXA by name (to write to them): name, photo, agency
-- ---------------------------------------------------------------------
create or replace function public.search_brixa_people(q text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by same desc, name), '[]'::jsonb)
  from (
    select distinct on (pr.id)
      jsonb_build_object('id', pr.id, 'name', coalesce(pr.full_name, split_part(pr.email, '@', 1)), 'avatar_path', pr.avatar_path,
        'job_title', pr.job_title, 'agency', o.name,
        'same', o.id = (select organization_id from public.organization_members where profile_id = auth.uid() order by created_at limit 1)) as row,
      o.id = (select organization_id from public.organization_members where profile_id = auth.uid() order by created_at limit 1) as same,
      coalesce(pr.full_name, pr.email) as name
    from public.profiles pr
    join public.organization_members m on m.profile_id = pr.id
    join public.organizations o on o.id = m.organization_id
    where auth.uid() is not null and pr.id <> auth.uid()
      and char_length(btrim(coalesce(q, ''))) >= 2
      and (pr.full_name ilike '%' || btrim(q) || '%' or o.name ilike '%' || btrim(q) || '%')
      and pr.email not like '%@demo.brixa.invalid'
    order by pr.id, m.created_at
    limit 30
  ) found;
$$;

revoke execute on function public.search_brixa_people(text) from public, anon;
grant execute on function public.search_brixa_people(text) to authenticated;

-- ---------------------------------------------------------------------
-- The people of a conversation (in everyone's: those who wrote), with when they last read
-- ---------------------------------------------------------------------
create or replace function public.chat_people(target_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_org uuid := public.my_chat_org(target_room);
  everyone boolean := (select kind = 'brixa' from public.chat_rooms where id = target_room);
begin
  if not public.is_in_chat(target_room) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', coalesce(pr.full_name, pr.email), 'avatar_path', pr.avatar_path,
        'agency', case when m.organization_id <> my_org then (select name from public.organizations where id = m.organization_id) end,
        'status', m.status, 'last_read_at', m.last_read_at)
      order by m.joined_at)
    from public.chat_members m join public.profiles pr on pr.id = m.profile_id
    where m.room_id = target_room
      and (not everyone or m.profile_id = auth.uid()
        or exists (select 1 from public.chat_messages x where x.room_id = target_room and x.sender_id = m.profile_id))), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- My conversations, newest first (invitations on top), with the unread
-- ---------------------------------------------------------------------
create or replace function public.my_chats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by row ->> 'status' <> 'invited', (row ->> 'last_at') desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'title', r.title, 'shared', r.shared,
      'status', me.status, 'muted', me.muted,
      'agency', case when r.kind = 'agency' then (select name from public.organizations where id = r.organization_id) end,
      'unit', case r.kind when 'office' then (select name from public.offices where id = r.office_id)
                          when 'team' then (select name from public.teams where id = r.team_id) end,
      'home_agency', (select name from public.organizations where id = r.organization_id),
      'count', (select count(*) from public.chat_members c where c.room_id = r.id and c.status = 'active'),
      'people', case when r.kind in ('group', 'direct') then coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', pr.id, 'name', coalesce(pr.full_name, pr.email), 'avatar_path', pr.avatar_path,
            'agency', case when m.organization_id <> me.organization_id then (select name from public.organizations where id = m.organization_id) end,
            'invited', m.status = 'invited')
          order by m.joined_at)
        from public.chat_members m join public.profiles pr on pr.id = m.profile_id
        where m.room_id = r.id and m.profile_id <> me.profile_id and m.status in ('active', 'invited')), '[]'::jsonb) else '[]'::jsonb end,
      'last_at', coalesce(r.last_message_at, r.created_at),
      'last', case when me.status = 'active' or r.kind = 'direct' then (
        select jsonb_build_object('kind', x.kind, 'text', public.chat_preview(x.kind, x.body, x.card, x.file_name),
          'sender', public.person_name(x.sender_id), 'mine', x.sender_id = me.profile_id, 'deleted', x.deleted_at is not null)
        from public.chat_messages x
        where x.room_id = r.id and x.kind <> 'system'
          and (r.kind = 'brixa' or me.organization_id = r.organization_id or x.created_at >= me.joined_at)
          and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id)
        order by x.created_at desc limit 1) end,
      'unread', case when me.status = 'active' then (
        select count(*) from public.chat_messages x
        where x.room_id = r.id and x.kind <> 'system' and x.deleted_at is null
          and x.created_at > me.last_read_at and x.sender_id is distinct from me.profile_id
          and (r.kind = 'brixa' or me.organization_id = r.organization_id or x.created_at >= me.joined_at)
          and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id)) else 0 end
    ) as row
    from public.chat_members me
    join public.chat_rooms r on r.id = me.room_id
    where me.profile_id = auth.uid() and me.status in ('active', 'invited')
      -- one office only: its conversation would be the agency's again
      and not (r.kind = 'office' and (select count(*) from public.offices o where o.organization_id = r.organization_id) < 2)
  ) rows;
$$;

create or replace function public.chat_unread()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*) from public.chat_members me
      join public.chat_rooms r on r.id = me.room_id
      join public.chat_messages x on x.room_id = me.room_id
      where me.profile_id = auth.uid() and me.status = 'active' and not me.muted
        and not (r.kind = 'office' and (select count(*) from public.offices o where o.organization_id = r.organization_id) < 2)
        and x.kind <> 'system' and x.deleted_at is null
        and x.created_at > me.last_read_at and x.sender_id is distinct from me.profile_id
        and (r.kind = 'brixa' or me.organization_id = r.organization_id or x.created_at >= me.joined_at)
        and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id))
    + (select count(*) from public.chat_members where profile_id = auth.uid() and status = 'invited')
  )::int;
$$;

-- ---------------------------------------------------------------------
-- "Seen" and the reactions reach an open conversation at once
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_reactions') then
      alter publication supabase_realtime add table public.chat_reactions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_members') then
      alter publication supabase_realtime add table public.chat_members;
    end if;
  end if;
end;
$$;
