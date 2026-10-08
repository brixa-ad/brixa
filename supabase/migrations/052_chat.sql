-- =====================================================================
-- BRIXA — migration 052: the chat
-- Every agency has its own chat (everyone in it, by itself); anyone makes a group with the colleagues
-- they choose (two people: a personal chat), and may invite a broker of another agency in BRIXA, who
-- accepts first. Text, a listing / client / deal from BRIXA, photos, files and voice messages. A push
-- for each message, unless the conversation is muted. Someone from another agency sees only what was
-- written after they joined, and never a client or a deal of the agency.
-- =====================================================================

create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  -- the agency it belongs to (whoever made it)
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('agency', 'group')),
  title text check (title is null or char_length(btrim(title)) between 1 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  -- has people from another agency
  shared boolean not null default false,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index chat_rooms_one_per_agency on public.chat_rooms (organization_id) where kind = 'agency';

create table public.chat_members (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- the member's own agency
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- invited: from another agency, not accepted yet
  status text not null default 'active' check (status in ('active', 'invited', 'left')),
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (room_id, profile_id)
);

create index chat_members_profile_idx on public.chat_members (profile_id, status);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  -- the sender's agency (a client or a deal shows only to their agency)
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null default 'text'
    check (kind in ('text', 'property', 'client', 'deal', 'image', 'file', 'voice', 'system')),
  body text check (body is null or char_length(body) <= 4000),
  -- a listing, client or deal, and what its card shows (as it was when sent)
  ref_id uuid,
  card jsonb,
  -- chat-files/<room>/<file>
  file_path text check (file_path is null or char_length(file_path) <= 300),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_type text check (file_type is null or char_length(file_type) <= 100),
  file_size int check (file_size is null or file_size between 0 and 30000000),
  duration_s int check (duration_s is null or duration_s between 0 and 3600),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind <> 'text' or char_length(btrim(coalesce(body, ''))) >= 1 or deleted_at is not null),
  check (kind not in ('image', 'file', 'voice') or file_path is not null or deleted_at is not null)
);

create index chat_messages_room_idx on public.chat_messages (room_id, created_at desc);

alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

-- ---------------------------------------------------------------------
-- Who is in a conversation
-- ---------------------------------------------------------------------
create or replace function public.is_chat_member(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where room_id = target_room and profile_id = auth.uid() and status = 'active'
  );
$$;

revoke execute on function public.is_chat_member(uuid) from public, anon;
grant execute on function public.is_chat_member(uuid) to authenticated;

-- (any status: an invited person sees the conversation's name and who is in it)
create or replace function public.is_in_chat(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where room_id = target_room and profile_id = auth.uid() and status in ('active', 'invited')
  );
$$;

revoke execute on function public.is_in_chat(uuid) from public, anon;
grant execute on function public.is_in_chat(uuid) to authenticated;

-- Can I read this message: I'm in the conversation; someone from another agency only since they
-- joined; a client or a deal only within the sender's agency.
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
      and (m.organization_id = r.organization_id or sent_at >= m.joined_at)
      and (message_kind not in ('client', 'deal') or sender_org = m.organization_id)
  );
$$;

revoke execute on function public.can_read_chat_message(uuid, timestamptz, text, uuid) from public, anon;
grant execute on function public.can_read_chat_message(uuid, timestamptz, text, uuid) to authenticated;

create policy "chat rooms: those in it" on public.chat_rooms
  for select to authenticated using (public.is_in_chat(id));

create policy "chat members: those in the conversation" on public.chat_members
  for select to authenticated using (public.is_in_chat(room_id));

create policy "chat messages: read" on public.chat_messages
  for select to authenticated using (public.can_read_chat_message(room_id, created_at, kind, organization_id));

-- text, photos, files and voice straight in; cards and the rest through the functions below
create policy "chat messages: write" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and kind in ('text', 'image', 'file', 'voice')
    and ref_id is null and card is null
    and public.is_chat_member(room_id)
    and organization_id = (select m.organization_id from public.chat_members m where m.room_id = chat_messages.room_id and m.profile_id = auth.uid())
    and (file_path is null or file_path like room_id::text || '/%')
  );

-- ---------------------------------------------------------------------
-- The agency's own chat: made with the agency, everyone in it
-- ---------------------------------------------------------------------
create or replace function public.chat_on_new_agency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_rooms (organization_id, kind) values (new.id, 'agency') on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.chat_on_new_agency() from public, anon, authenticated;

create trigger organizations_chat_room
  after insert on public.organizations
  for each row execute function public.chat_on_new_agency();

create or replace function public.chat_on_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.chat_members (room_id, profile_id, organization_id)
    select r.id, new.profile_id, new.organization_id
    from public.chat_rooms r
    where r.organization_id = new.organization_id and r.kind = 'agency'
    on conflict (room_id, profile_id) do update set status = 'active', organization_id = excluded.organization_id;
    return new;
  end if;
  -- leaving the agency: out of its conversations (the messages stay)
  delete from public.chat_members where profile_id = old.profile_id and organization_id = old.organization_id;
  return old;
end;
$$;

revoke execute on function public.chat_on_member_change() from public, anon, authenticated;

create trigger organization_members_chat
  after insert or delete on public.organization_members
  for each row execute function public.chat_on_member_change();

-- the agencies already here
insert into public.chat_rooms (organization_id, kind)
select o.id, 'agency' from public.organizations o
on conflict do nothing;

insert into public.chat_members (room_id, profile_id, organization_id, joined_at, last_read_at)
select r.id, m.profile_id, m.organization_id, m.created_at, now()
from public.organization_members m
join public.chat_rooms r on r.organization_id = m.organization_id and r.kind = 'agency'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- A new message: the conversation moves up, and the people in it hear (unless they muted it)
-- ---------------------------------------------------------------------
create or replace function public.chat_preview(message_kind text, message_body text, message_card jsonb, message_file text)
returns text
language sql
immutable
as $$
  select case message_kind
    when 'text' then left(message_body, 140)
    when 'image' then '📷'
    when 'voice' then '🎤'
    when 'file' then '📎 ' || coalesce(message_file, '')
    when 'property' then '🏠 ' || coalesce(message_card ->> 'title', '')
    when 'client' then '👤 ' || coalesce(message_card ->> 'name', '')
    when 'deal' then '🤝 ' || coalesce(message_card ->> 'title', '')
    else coalesce(message_body, '')
  end;
$$;

create or replace function public.chat_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room record;
  member record;
  people int;
begin
  update public.chat_rooms set last_message_at = new.created_at where id = new.room_id
  returning * into room;
  if new.kind = 'system' then return new; end if;

  select count(*) into people from public.chat_members where room_id = new.room_id and status = 'active';
  for member in
    select * from public.chat_members
    where room_id = new.room_id and status = 'active' and not muted and profile_id is distinct from new.sender_id
      and (new.kind not in ('client', 'deal') or organization_id = new.organization_id)
  loop
    perform public.notify(member.organization_id, member.profile_id, new.sender_id, 'chat_message',
      jsonb_build_object(
        'title', case when room.kind = 'agency' then (select name from public.organizations where id = room.organization_id) else room.title end,
        'kind', case when room.kind = 'agency' then 'agency' when people <= 2 and room.title is null then 'direct' else 'group' end,
        'actor', public.person_name(new.sender_id),
        'text', public.chat_preview(new.kind, new.body, new.card, new.file_name)),
      '/chat/' || new.room_id);
  end loop;
  return new;
end;
$$;

revoke execute on function public.chat_on_message() from public, anon, authenticated;

create trigger chat_messages_on_insert
  after insert on public.chat_messages
  for each row execute function public.chat_on_message();

-- ---------------------------------------------------------------------
-- Groups: made with colleagues (two people: a personal chat, found again rather than made twice)
-- ---------------------------------------------------------------------
create or replace function public.my_chat_org(target_room uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.chat_members where room_id = target_room and profile_id = auth.uid();
$$;

revoke execute on function public.my_chat_org(uuid) from public, anon, authenticated;

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
  found_room uuid;
  new_room uuid;
begin
  select organization_id into org from public.organization_members where profile_id = me order by created_at limit 1;
  if org is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  -- only colleagues of the same agency (another agency's broker is invited by e-mail)
  select array_agg(distinct m.profile_id) into everyone
  from public.organization_members m
  where m.organization_id = org and (m.profile_id = any (coalesce(people, '{}')) or m.profile_id = me);
  if cardinality(everyone) < 2 then raise exception 'no_people'; end if;

  -- a personal chat already there
  if clean_title is null and cardinality(everyone) = 2 then
    select r.id into found_room
    from public.chat_rooms r
    where r.kind = 'group' and r.title is null and r.organization_id = org
      and (select array_agg(c.profile_id order by c.profile_id) from public.chat_members c where c.room_id = r.id and c.status = 'active')
          = (select array_agg(x order by x) from unnest(everyone) x)
    limit 1;
    if found_room is not null then return found_room; end if;
  end if;

  insert into public.chat_rooms (organization_id, kind, title, created_by)
  values (org, 'group', left(clean_title, 80), me)
  returning id into new_room;
  insert into public.chat_members (room_id, profile_id, organization_id, invited_by)
  select new_room, p, org, case when p = me then null else me end from unnest(everyone) p;
  return new_room;
end;
$$;

revoke execute on function public.create_chat_group(text, uuid[]) from public, anon;
grant execute on function public.create_chat_group(text, uuid[]) to authenticated;

-- More colleagues into a group.
create or replace function public.add_chat_people(target_room uuid, people uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid := public.my_chat_org(target_room);
begin
  if not public.is_chat_member(target_room) or (select kind from public.chat_rooms where id = target_room) <> 'group' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.chat_members (room_id, profile_id, organization_id, invited_by)
  select target_room, m.profile_id, org, auth.uid()
  from public.organization_members m
  where m.organization_id = org and m.profile_id = any (coalesce(people, '{}'))
  on conflict (room_id, profile_id) do update
    set status = 'active', joined_at = case when chat_members.status = 'active' then chat_members.joined_at else now() end;
  insert into public.chat_messages (room_id, sender_id, organization_id, kind, body)
  select target_room, auth.uid(), org, 'system', 'added:' || public.person_name(p)
  from unnest(people) p
  where exists (select 1 from public.organization_members m where m.organization_id = org and m.profile_id = p);
end;
$$;

revoke execute on function public.add_chat_people(uuid, uuid[]) from public, anon;
grant execute on function public.add_chat_people(uuid, uuid[]) to authenticated;

-- A broker of another agency in BRIXA, by e-mail: invited, and in once they accept.
create or replace function public.invite_to_chat(target_room uuid, invite_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_org uuid := public.my_chat_org(target_room);
  room record;
  guest uuid;
  guest_org uuid;
  existing text;
begin
  select * into room from public.chat_rooms where id = target_room;
  if not public.is_chat_member(target_room) or room.kind <> 'group' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select p.id into guest from public.profiles p where lower(p.email) = lower(btrim(coalesce(invite_email, ''))) limit 1;
  if guest is null then return 'not_found'; end if;
  select status into existing from public.chat_members where room_id = target_room and profile_id = guest;
  if existing in ('active', 'invited') then return 'already'; end if;
  select organization_id into guest_org from public.organization_members where profile_id = guest order by created_at limit 1;
  if guest_org is null then return 'not_found'; end if;

  if guest_org = my_org then
    perform public.add_chat_people(target_room, array[guest]);
    return 'added';
  end if;

  insert into public.chat_members (room_id, profile_id, organization_id, status, invited_by)
  values (target_room, guest, guest_org, 'invited', me)
  on conflict (room_id, profile_id) do update set status = 'invited', organization_id = excluded.organization_id, invited_by = me;
  update public.chat_rooms set shared = true where id = target_room;
  perform public.notify(guest_org, guest, me, 'chat_invite',
    jsonb_build_object(
      'room', target_room,
      'title', coalesce(room.title, public.person_name(me)),
      'actor', public.person_name(me),
      'agency', (select name from public.organizations where id = my_org)),
    '/chat');
  return 'invited';
end;
$$;

revoke execute on function public.invite_to_chat(uuid, text) from public, anon;
grant execute on function public.invite_to_chat(uuid, text) to authenticated;

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
    update public.chat_members set status = 'active', joined_at = now(), last_read_at = now()
    where room_id = target_room and profile_id = me;
    insert into public.chat_messages (room_id, sender_id, organization_id, kind, body)
    values (target_room, me, public.my_chat_org(target_room), 'system',
      'joined:' || public.person_name(me) || ' (' || (select name from public.organizations where id = public.my_chat_org(target_room)) || ')');
  else
    delete from public.chat_members where room_id = target_room and profile_id = me;
  end if;
  delete from public.notifications where recipient_id = me and type = 'chat_invite' and data ->> 'room' = target_room::text;
end;
$$;

revoke execute on function public.answer_chat_invite(uuid, boolean) from public, anon;
grant execute on function public.answer_chat_invite(uuid, boolean) to authenticated;

create or replace function public.rename_chat(target_room uuid, new_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_chat_member(target_room) or (select kind from public.chat_rooms where id = target_room) <> 'group' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.chat_rooms set title = left(nullif(btrim(coalesce(new_title, '')), ''), 80) where id = target_room;
end;
$$;

revoke execute on function public.rename_chat(uuid, text) from public, anon;
grant execute on function public.rename_chat(uuid, text) to authenticated;

create or replace function public.leave_chat(target_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_chat_member(target_room) or (select kind from public.chat_rooms where id = target_room) <> 'group' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.chat_messages (room_id, sender_id, organization_id, kind, body)
  values (target_room, auth.uid(), public.my_chat_org(target_room), 'system', 'left:' || public.person_name(auth.uid()));
  update public.chat_members set status = 'left' where room_id = target_room and profile_id = auth.uid();
end;
$$;

revoke execute on function public.leave_chat(uuid) from public, anon;
grant execute on function public.leave_chat(uuid) to authenticated;

create or replace function public.set_chat_muted(target_room uuid, mute boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_members set muted = coalesce(mute, false)
  where room_id = target_room and profile_id = auth.uid();
$$;

revoke execute on function public.set_chat_muted(uuid, boolean) from public, anon;
grant execute on function public.set_chat_muted(uuid, boolean) to authenticated;

-- Read up to now: the conversation's pushes go from the notifications too.
create or replace function public.mark_chat_read(target_room uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_members set last_read_at = now()
  where room_id = target_room and profile_id = auth.uid() and status = 'active';
  delete from public.notifications
  where recipient_id = auth.uid() and type = 'chat_message' and link = '/chat/' || target_room::text;
$$;

revoke execute on function public.mark_chat_read(uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- A listing, client or deal of BRIXA into the conversation, as a card
-- ---------------------------------------------------------------------
create or replace function public.send_chat_card(target_room uuid, card_kind text, target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid := public.my_chat_org(target_room);
  shared_room boolean;
  card_data jsonb;
  new_id uuid;
begin
  if not public.is_chat_member(target_room) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select shared into shared_room from public.chat_rooms where id = target_room;
  -- a client or a deal never goes to another agency
  if card_kind in ('client', 'deal') and shared_room then
    raise exception 'not_with_other_agencies';
  end if;

  if card_kind = 'property' then
    if not public.can_view_property(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'title', p.title, 'operation', p.operation_type, 'status', p.status,
        'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms,
        'place', concat_ws(', ', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
                                 (select s.name from public.geo_settlements s where s.id = p.settlement_id)),
        'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
        'org', p.organization_id)
    into card_data
    from public.properties p where p.id = target and p.organization_id = org;
  elsif card_kind = 'client' then
    if not public.can_view_client(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'name', c.full_name, 'types', c.types, 'class', c.client_class,
        'operation', s.operation, 'budget_max', s.budget_max, 'currency', s.currency)
    into card_data
    from public.clients c left join public.client_searches s on s.client_id = c.id
    where c.id = target and c.organization_id = org;
  elsif card_kind = 'deal' then
    if not public.can_view_deal(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'title', coalesce(p.title, c.full_name, '—'), 'client', c.full_name,
        'stage', d.stage, 'status', d.status, 'kind', d.kind, 'price', d.price, 'currency', d.currency)
    into card_data
    from public.deals d
    left join public.properties p on p.id = d.property_id
    left join public.clients c on c.id = d.client_id
    where d.id = target and d.organization_id = org;
  else
    raise exception 'bad_kind';
  end if;
  if card_data is null then raise exception 'not_allowed' using errcode = '42501'; end if;

  insert into public.chat_messages (room_id, sender_id, organization_id, kind, ref_id, card)
  values (target_room, auth.uid(), org, card_kind, target, card_data)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.send_chat_card(uuid, text, uuid) from public, anon;
grant execute on function public.send_chat_card(uuid, text, uuid) to authenticated;

-- One's own message, taken back.
create or replace function public.delete_chat_message(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  path text;
begin
  update public.chat_messages
  set deleted_at = now(), body = null, card = null, file_path = null
  where id = target and sender_id = auth.uid() and deleted_at is null and kind <> 'system'
  returning id into path;
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
  return path;
end;
$$;

revoke execute on function public.delete_chat_message(uuid) from public, anon;
grant execute on function public.delete_chat_message(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- My conversations: the agency's first, then by the last message; what's unread
-- ---------------------------------------------------------------------
create or replace function public.my_chats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by (row ->> 'kind') <> 'agency', row ->> 'status' <> 'invited', (row ->> 'last_at') desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'title', r.title, 'shared', r.shared,
      'status', me.status, 'muted', me.muted,
      'agency', case when r.kind = 'agency' then (select name from public.organizations where id = r.organization_id) end,
      'home_agency', (select name from public.organizations where id = r.organization_id),
      'people', coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', pr.id, 'name', coalesce(pr.full_name, pr.email), 'avatar_path', pr.avatar_path,
            'agency', case when m.organization_id <> me.organization_id then (select name from public.organizations where id = m.organization_id) end,
            'invited', m.status = 'invited')
          order by m.joined_at)
        from public.chat_members m join public.profiles pr on pr.id = m.profile_id
        where m.room_id = r.id and m.profile_id <> me.profile_id and m.status in ('active', 'invited')), '[]'::jsonb),
      'last_at', coalesce(r.last_message_at, r.created_at),
      'last', case when me.status = 'active' then (
        select jsonb_build_object('kind', x.kind, 'text', public.chat_preview(x.kind, x.body, x.card, x.file_name),
          'sender', public.person_name(x.sender_id), 'mine', x.sender_id = me.profile_id, 'deleted', x.deleted_at is not null)
        from public.chat_messages x
        where x.room_id = r.id and x.kind <> 'system'
          and (me.organization_id = r.organization_id or x.created_at >= me.joined_at)
          and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id)
        order by x.created_at desc limit 1) end,
      'unread', case when me.status = 'active' then (
        select count(*) from public.chat_messages x
        where x.room_id = r.id and x.kind <> 'system' and x.deleted_at is null
          and x.created_at > me.last_read_at and x.sender_id is distinct from me.profile_id
          and (me.organization_id = r.organization_id or x.created_at >= me.joined_at)
          and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id)) else 0 end
    ) as row
    from public.chat_members me
    join public.chat_rooms r on r.id = me.room_id
    where me.profile_id = auth.uid() and me.status in ('active', 'invited')
  ) rows;
$$;

revoke execute on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;

-- Everyone a conversation has had (to put a name on each message), with their agency when it's another.
create or replace function public.chat_people(target_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_org uuid := public.my_chat_org(target_room);
begin
  if not public.is_in_chat(target_room) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', coalesce(pr.full_name, pr.email), 'avatar_path', pr.avatar_path,
        'agency', case when m.organization_id <> my_org then (select name from public.organizations where id = m.organization_id) end,
        'status', m.status)
      order by m.joined_at)
    from public.chat_members m join public.profiles pr on pr.id = m.profile_id
    where m.room_id = target_room), '[]'::jsonb);
end;
$$;

revoke execute on function public.chat_people(uuid) from public, anon;
grant execute on function public.chat_people(uuid) to authenticated;

-- The number on the chat's icon: unread messages in the conversations not muted.
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
        and x.kind <> 'system' and x.deleted_at is null
        and x.created_at > me.last_read_at and x.sender_id is distinct from me.profile_id
        and (me.organization_id = r.organization_id or x.created_at >= me.joined_at)
        and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id))
    + (select count(*) from public.chat_members where profile_id = auth.uid() and status = 'invited')
  )::int;
$$;

revoke execute on function public.chat_unread() from public, anon;
grant execute on function public.chat_unread() to authenticated;

-- ---------------------------------------------------------------------
-- Photos, files and voice messages: chat-files/<conversation>/<file>, for those in it
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 26214400, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
  'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/wav'
])
on conflict (id) do nothing;

create or replace function public.can_use_chat_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_chat_member(split_part(object_name, '/', 1)::uuid);
$$;

revoke execute on function public.can_use_chat_file(text) from public, anon;
grant execute on function public.can_use_chat_file(text) to authenticated;

create policy "chat files: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-files' and public.can_use_chat_file(name));

create policy "chat files: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-files' and public.can_use_chat_file(name));

-- ---------------------------------------------------------------------
-- New messages reach an open conversation at once
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;
