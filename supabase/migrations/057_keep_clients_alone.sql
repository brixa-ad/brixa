-- =====================================================================
-- BRIXA — migration 057: someone working alone keeps their clients
-- A client still not contacted N days after the deadline goes back to the free contacts, for a
-- colleague to take. With nobody else in the agency (a broker on their own, or an agency's
-- first days) there is no one to take it: the client would just vanish from the broker's list.
-- =====================================================================

create or replace function public.notify_follow_ups(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  client record;
  person record;
  manager record;
  sent integer := 0;
begin
  -- 1) deadline passed → the broker and the managers, once per deadline
  for client in
    select c.id, c.organization_id, c.full_name, c.responsible_broker_id
    from public.clients c
    where c.follow_up_at <= at_time and c.follow_up_notified_at is null and c.responsible_broker_id is not null
  loop
    perform public.notify(
      client.organization_id, client.responsible_broker_id, null, 'follow_up_missed',
      jsonb_build_object('title', client.full_name), '/clients/' || client.id
    );
    for manager in
      select profile_id from public.organization_members
      where organization_id = client.organization_id and public.oversees_as(profile_id, client.responsible_broker_id)
        and profile_id <> client.responsible_broker_id
    loop
      perform public.notify(
        client.organization_id, manager.profile_id, client.responsible_broker_id, 'follow_up_missed_team',
        jsonb_build_object('title', client.full_name, 'actor', public.person_name(client.responsible_broker_id)),
        '/clients/' || client.id
      );
    end loop;
    update public.clients set follow_up_notified_at = at_time where id = client.id;
    sent := sent + 1;
  end loop;

  -- 2) still nothing N days after the deadline → back to the free contacts
  for client in
    select c.id, c.organization_id, c.full_name, c.responsible_broker_id
    from public.clients c
    join public.organizations o on o.id = c.organization_id
    where o.release_after_days > 0
      and c.responsible_broker_id is not null
      and c.follow_up_at <= at_time - make_interval(days => o.release_after_days)
      -- only when someone else could take the client (alone, "free" would just hide it)
      and exists (
        select 1 from public.organization_members m
        where m.organization_id = c.organization_id and m.profile_id <> c.responsible_broker_id
      )
  loop
    update public.clients set responsible_broker_id = null where id = client.id;
    perform public.notify(
      client.organization_id, client.responsible_broker_id, null, 'client_released',
      jsonb_build_object('title', client.full_name), '/contacts'
    );
    for manager in
      select profile_id from public.organization_members
      where organization_id = client.organization_id and public.oversees_as(profile_id, client.responsible_broker_id)
        and profile_id <> client.responsible_broker_id
    loop
      perform public.notify(
        client.organization_id, manager.profile_id, client.responsible_broker_id, 'client_released_team',
        jsonb_build_object('title', client.full_name, 'actor', public.person_name(client.responsible_broker_id)),
        '/contacts'
      );
    end loop;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.notify_follow_ups(timestamptz) from public, anon, authenticated;
