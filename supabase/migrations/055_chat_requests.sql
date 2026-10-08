-- =====================================================================
-- BRIXA — migration 055: message requests like Messenger's
-- Someone of another agency who got a personal message reads it before accepting (from the
-- invitation on), sees it as unread in their list, and accepts or declines at the bottom of it.
-- =====================================================================

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
    where m.room_id = target_room and m.profile_id = auth.uid()
      -- a message request: read before accepting
      and (m.status = 'active' or (m.status = 'invited' and r.kind = 'direct'))
      and (r.kind = 'brixa' or m.organization_id = r.organization_id or sent_at >= m.joined_at)
      and (message_kind not in ('client', 'deal') or sender_org = m.organization_id)
  );
$$;

-- read up to now (a request too: its count goes)
create or replace function public.mark_chat_read(target_room uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_members set last_read_at = now()
  where room_id = target_room and profile_id = auth.uid() and status in ('active', 'invited');
  delete from public.notifications
  where recipient_id = auth.uid() and type = 'chat_message' and link = '/chat/' || target_room::text;
$$;

-- a request shows its unread like any conversation
create or replace function public.my_chats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by (row ->> 'status' <> 'invited' or row ->> 'kind' = 'direct'), (row ->> 'last_at') desc nulls last), '[]'::jsonb)
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
      'unread', case when me.status = 'active' or r.kind = 'direct' then (
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

-- the invited person's "since" is when they were asked: a request accepted keeps what came before
update public.chat_members m set joined_at = least(m.joined_at, r.created_at)
from public.chat_rooms r
where r.id = m.room_id and r.kind = 'direct' and m.status = 'invited';
