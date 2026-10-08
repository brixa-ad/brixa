-- =====================================================================
-- BRIXA — migration 056: a number on the app's icon
-- Each push says how many things wait for the person (unread chat messages in the conversations
-- they haven't muted, message requests, unread notifications), and the phone puts that number on
-- BRIXA's icon, as Messenger does. Opening BRIXA takes it off.
-- =====================================================================

create or replace function public.waiting_for(target uuid)
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
      where me.profile_id = target and me.status = 'active' and not me.muted
        and not (r.kind = 'office' and (select count(*) from public.offices o where o.organization_id = r.organization_id) < 2)
        and x.kind <> 'system' and x.deleted_at is null
        and x.created_at > me.last_read_at and x.sender_id is distinct from me.profile_id
        and (r.kind = 'brixa' or me.organization_id = r.organization_id or x.created_at >= me.joined_at)
        and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id))
    + (select count(*) from public.chat_members where profile_id = target and status = 'invited')
    + (select count(*) from public.notifications
        where recipient_id = target and read_at is null and type not in ('chat_message', 'chat_invite'))
  )::int;
$$;

revoke execute on function public.waiting_for(uuid) from public, anon, authenticated;

drop function if exists public.claim_push(uuid, uuid);

create function public.claim_push(target uuid, token uuid)
returns table (
  type text, data jsonb, link text, endpoint text, p256dh text, auth_key text, lang text,
  phone text, email text, waiting int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed record;
  contact_phone text;
  contact_email text;
begin
  update public.notifications n
  set pushed_at = now()
  where n.id = target and n.push_token = token and n.pushed_at is null
  returning n.recipient_id, n.type, n.data, n.link into claimed;

  if not found then return; end if;

  if claimed.link ~ '^/tasks/[0-9a-f-]{36}$' then
    select c.phone, c.email into contact_phone, contact_email
    from public.tasks t
    join public.clients c on c.id = t.client_id
    where t.id = substr(claimed.link, 8)::uuid
      and (
        c.responsible_broker_id = claimed.recipient_id
        or public.oversees_as(claimed.recipient_id, c.responsible_broker_id)
      );
  end if;

  return query
  select claimed.type, claimed.data, claimed.link, s.endpoint, s.p256dh, s.auth_key, s.lang,
    contact_phone, contact_email, public.waiting_for(claimed.recipient_id)
  from public.push_subscriptions s
  where s.profile_id = claimed.recipient_id;
end;
$$;

grant execute on function public.claim_push(uuid, uuid) to anon, authenticated;
