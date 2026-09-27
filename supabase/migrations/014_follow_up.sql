-- =====================================================================
-- BRIXA — migration 014: follow-up and free contacts
--   • every client with a broker has a "next contact by" deadline:
--     a new / newly assigned client within 24 h, then by class
--     (A every 2 days, B every 7, C every 30) after the last contact
--   • missed → the broker and the managers hear at once; 7 days later
--     still nothing → the client goes back to the free contacts
--   • free contacts (no broker) are open to the whole agency; the first
--     broker to press "Take" gets the client
-- Run once in Supabase → SQL Editor → New query → Run (after 013).
-- =====================================================================

-- ---------------------------------------------------------------------
-- The agency's rules (the managers can change them)
-- ---------------------------------------------------------------------
alter table public.organizations
  add column follow_up_first_hours int not null default 24 check (follow_up_first_hours between 1 and 720),
  add column follow_up_days_a int not null default 2 check (follow_up_days_a between 1 and 365),
  add column follow_up_days_b int not null default 7 check (follow_up_days_b between 1 and 365),
  add column follow_up_days_c int not null default 30 check (follow_up_days_c between 1 and 365),
  -- 0 = never give clients back automatically
  add column release_after_days int not null default 7 check (release_after_days between 0 and 365);

-- ---------------------------------------------------------------------
-- Each client's deadline
-- ---------------------------------------------------------------------
alter table public.clients
  add column assigned_at timestamptz,
  add column follow_up_at timestamptz,
  add column follow_up_notified_at timestamptz;

create index clients_follow_up_idx on public.clients (follow_up_at) where follow_up_at is not null;

-- The next contact is due: a fresh client within N hours of getting them, otherwise
-- the class's days after the last contact. No broker, a closed deal or a lost client → none.
create or replace function public.compute_follow_up(
  target_org uuid, target_client uuid, broker uuid, client_stage text, client_class text, assigned timestamptz
)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when broker is null or client_stage in ('deal', 'lost') then null
    when last_contact.at is null or last_contact.at < assigned then assigned + make_interval(hours => o.follow_up_first_hours)
    else last_contact.at + make_interval(days => case client_class
      when 'A' then o.follow_up_days_a when 'B' then o.follow_up_days_b else o.follow_up_days_c end)
  end
  from public.organizations o
  left join lateral (
    select max(a.occurred_at) as at
    from public.activities a
    where a.client_id = target_client and a.type <> 'note'
  ) last_contact on true
  where o.id = target_org;
$$;

create or replace function public.follow_up_due(target_client uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select public.compute_follow_up(
    c.organization_id, c.id, c.responsible_broker_id, c.stage, c.client_class, coalesce(c.assigned_at, c.created_at)
  )
  from public.clients c
  where c.id = target_client;
$$;

revoke execute on function public.compute_follow_up(uuid, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.follow_up_due(uuid) from public, anon, authenticated;

-- Broker, class or stage changes → the deadline moves with them.
create or replace function public.guard_client_follow_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.assigned_at := case when new.responsible_broker_id is null then null else now() end;
  elsif new.responsible_broker_id is distinct from old.responsible_broker_id then
    new.assigned_at := case when new.responsible_broker_id is null then null else now() end;
  end if;

  if tg_op = 'INSERT'
     or new.responsible_broker_id is distinct from old.responsible_broker_id
     or new.client_class is distinct from old.client_class
     or new.stage is distinct from old.stage then
    new.follow_up_at := public.compute_follow_up(
      new.organization_id, new.id, new.responsible_broker_id, new.stage, new.client_class,
      coalesce(new.assigned_at, new.created_at, now())
    );
    new.follow_up_notified_at := null;
  end if;
  return new;
end;
$$;

create trigger clients_guard_follow_up
  before insert or update on public.clients
  for each row execute function public.guard_client_follow_up();

-- Who needs to know: a new free contact → everyone; a client handed to you → you;
-- a free contact taken → the managers.
create or replace function public.on_client_owner_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member record;
  previous uuid := case when tg_op = 'UPDATE' then old.responsible_broker_id end;
begin
  if tg_op = 'UPDATE' and new.responsible_broker_id is not distinct from old.responsible_broker_id then
    return new;
  end if;

  if new.responsible_broker_id is null then
    for member in
      select profile_id from public.organization_members
      where organization_id = new.organization_id
        and profile_id is distinct from auth.uid()
        and profile_id is distinct from previous
    loop
      perform public.notify(
        new.organization_id, member.profile_id, auth.uid(), 'free_contact',
        jsonb_build_object('title', new.full_name), '/contacts'
      );
    end loop;
  elsif new.responsible_broker_id is distinct from auth.uid() then
    perform public.notify(
      new.organization_id, new.responsible_broker_id, auth.uid(), 'client_assigned',
      jsonb_build_object(
        'title', new.full_name,
        'hours', (select follow_up_first_hours from public.organizations where id = new.organization_id)
      ),
      '/clients/' || new.id
    );
  elsif tg_op = 'UPDATE' and previous is null then
    for member in
      select profile_id from public.organization_members
      where organization_id = new.organization_id and role in ('owner', 'manager') and profile_id <> auth.uid()
    loop
      perform public.notify(
        new.organization_id, member.profile_id, auth.uid(), 'contact_claimed',
        jsonb_build_object('title', new.full_name, 'actor', public.person_name(auth.uid())),
        '/clients/' || new.id
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger clients_on_owner_changed
  after insert or update of responsible_broker_id on public.clients
  for each row execute function public.on_client_owner_changed();

-- A call, meeting, viewing… with the client resets the deadline (a plain note doesn't).
create or replace function public.on_client_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.client_id else new.client_id end;
begin
  if target is not null then
    update public.clients
    set follow_up_at = public.follow_up_due(id), follow_up_notified_at = null
    where id = target;
  end if;
  return null;
end;
$$;

create trigger activities_follow_up
  after insert or delete on public.activities
  for each row execute function public.on_client_contact();

-- ---------------------------------------------------------------------
-- Taking a free contact: the first one wins
-- ---------------------------------------------------------------------
create or replace function public.claim_client(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clients
  set responsible_broker_id = auth.uid()
  where id = target
    and responsible_broker_id is null
    and public.is_org_member(organization_id);
  return found;
end;
$$;

revoke execute on function public.claim_client(uuid) from public, anon;
grant execute on function public.claim_client(uuid) to authenticated;

-- The managers set the rules; everyone's deadlines follow.
create or replace function public.set_follow_up_rules(
  first_hours int, days_a int, days_b int, days_c int, release_days int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  select organization_id into org from public.organization_members
  where profile_id = auth.uid() and role in ('owner', 'manager')
  limit 1;
  if org is null then raise exception 'forbidden'; end if;

  update public.organizations
  set follow_up_first_hours = first_hours,
      follow_up_days_a = days_a,
      follow_up_days_b = days_b,
      follow_up_days_c = days_c,
      release_after_days = release_days
  where id = org;

  update public.clients
  set follow_up_at = public.follow_up_due(id), follow_up_notified_at = null
  where organization_id = org and responsible_broker_id is not null;
end;
$$;

revoke execute on function public.set_follow_up_rules(int, int, int, int, int) from public, anon;
grant execute on function public.set_follow_up_rules(int, int, int, int, int) to authenticated;

-- Duplicate phone: say when the number is already among the free contacts.
create or replace function public.client_phone_owner(target_org uuid, raw_phone text, exclude_client uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when c.responsible_broker_id is null then '#free' else coalesce(p.full_name, p.email, '—') end
  from public.clients c
  left join public.profiles p on p.id = c.responsible_broker_id
  where public.is_org_member(target_org)
    and c.organization_id = target_org
    and c.phone_normalized = public.normalize_phone(raw_phone)
    and (exclude_client is null or c.id <> exclude_client)
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- The job (every 15 minutes): missed deadlines, giving clients back,
-- and the morning list of who to contact today
-- ---------------------------------------------------------------------
create table public.follow_up_digests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (profile_id, day)
);
alter table public.follow_up_digests enable row level security;
-- no policies: only the job writes it

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
      where organization_id = client.organization_id and role in ('owner', 'manager')
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
  loop
    update public.clients set responsible_broker_id = null where id = client.id;
    perform public.notify(
      client.organization_id, client.responsible_broker_id, null, 'client_released',
      jsonb_build_object('title', client.full_name), '/contacts'
    );
    for manager in
      select profile_id from public.organization_members
      where organization_id = client.organization_id and role in ('owner', 'manager')
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

  -- 3) from 08:30: who each broker should contact today
  if local_now::time >= time '08:30' then
    for person in
      select c.organization_id, c.responsible_broker_id as broker, count(*)::int as n,
        array_to_string((array_agg(c.full_name order by c.follow_up_at))[1:3], ', ') as names
      from public.clients c
      where c.responsible_broker_id is not null
        and c.follow_up_at > at_time
        and (c.follow_up_at at time zone 'Europe/Sofia')::date = today
      group by c.organization_id, c.responsible_broker_id
    loop
      insert into public.follow_up_digests (profile_id, day) values (person.broker, today)
      on conflict do nothing;
      if not found then continue; end if;
      perform public.notify(
        person.organization_id, person.broker, null, 'follow_ups_today',
        jsonb_build_object('count', person.n, 'title', person.names), '/follow-up'
      );
      sent := sent + 1;
    end loop;
  end if;

  return sent;
end;
$$;

revoke execute on function public.notify_follow_ups(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Access: free contacts are open to the whole agency
-- ---------------------------------------------------------------------
create policy "clients: free contacts readable by the agency" on public.clients
  for select to authenticated
  using (responsible_broker_id is null and public.is_org_member(organization_id));

-- ---------------------------------------------------------------------
-- Start everyone's deadlines fresh (no burst of "missed" on day one)
-- ---------------------------------------------------------------------
update public.clients
set assigned_at = coalesce(assigned_at, created_at),
    follow_up_at = greatest(public.follow_up_due(id), now() + interval '1 day')
where responsible_broker_id is not null and stage not in ('deal', 'lost');

-- ---------------------------------------------------------------------
-- Schedule (needs Cron, on since 007)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-follow-ups', '*/15 * * * *', 'select public.notify_follow_ups()');
  end if;
end;
$$;
