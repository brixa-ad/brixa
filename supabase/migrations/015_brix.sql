-- =====================================================================
-- BRIXA — migration 015: Brix, the AI assistant
--   • the morning brief: at 08:00 a notification with the day in numbers,
--     and Brix's plan for the day on the home screen (kept for the day)
--   • a daily limit on messages to Brix, so costs stay predictable
-- Run once in Supabase → SQL Editor → New query → Run (after 014).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Brix's plan for the day, one per person per day
-- ---------------------------------------------------------------------
create table public.brix_briefs (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now(),
  primary key (profile_id, day)
);

alter table public.brix_briefs enable row level security;
create policy "brix briefs: read own" on public.brix_briefs
  for select to authenticated using (profile_id = auth.uid());
create policy "brix briefs: write own" on public.brix_briefs
  for insert to authenticated with check (profile_id = auth.uid());
create policy "brix briefs: replace own" on public.brix_briefs
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- Messages to Brix per person per day
-- ---------------------------------------------------------------------
create table public.brix_usage (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  messages int not null default 0,
  primary key (profile_id, day)
);
alter table public.brix_usage enable row level security;
create policy "brix usage: read own" on public.brix_usage
  for select to authenticated using (profile_id = auth.uid());

-- One more message, if today's limit allows it.
create or replace function public.brix_take_turn(daily_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  if auth.uid() is null then return false; end if;
  insert into public.brix_usage (profile_id, day, messages)
  values (auth.uid(), public.sofia_today(), 1)
  on conflict (profile_id, day) do update set messages = brix_usage.messages + 1
  where brix_usage.messages < daily_limit
  returning messages into used;
  return used is not null;
end;
$$;

revoke execute on function public.brix_take_turn(int) from public, anon;
grant execute on function public.brix_take_turn(int) to authenticated;

-- ---------------------------------------------------------------------
-- 08:00: the day in numbers (tasks, clients to contact, deal steps)
-- ---------------------------------------------------------------------
create table public.morning_digests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (profile_id, day)
);
alter table public.morning_digests enable row level security;
-- no policies: only the job writes it

create or replace function public.notify_morning_brief(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  end_of_day timestamptz := (today + 1)::timestamp at time zone 'Europe/Sofia';
  stages text[] := array['viewing', 'offer', 'deposit', 'preliminary', 'notary'];
  person record;
  sent integer := 0;
begin
  if local_now::time < time '08:00' then return 0; end if;

  for person in
    select m.organization_id, m.profile_id,
      (select count(*)::int from public.tasks t
        where t.assigned_to = m.profile_id and t.status = 'open' and t.due_date <= today) as tasks,
      (select count(*)::int from public.clients c
        where c.responsible_broker_id = m.profile_id and c.follow_up_at < end_of_day) as followups,
      (select array_to_string((array_agg(c.full_name order by c.follow_up_at))[1:2], ', ') from public.clients c
        where c.responsible_broker_id = m.profile_id and c.follow_up_at < end_of_day) as names,
      (select count(*)::int from public.deals d
        cross join lateral (values
          ('viewing', d.viewing_on), ('offer', d.offer_on), ('deposit', d.deposit_on),
          ('preliminary', d.preliminary_on), ('notary', d.notary_on)
        ) as s (stage, due)
        where d.broker_id = m.profile_id and d.status = 'open' and s.due = today
          and (array_position(stages, s.stage) > array_position(stages, d.stage)
               or (s.stage = d.stage and s.stage in ('viewing', 'notary')))) as steps
    from public.organization_members m
  loop
    continue when person.tasks + person.followups + person.steps = 0;

    insert into public.morning_digests (profile_id, day) values (person.profile_id, today)
    on conflict do nothing;
    if not found then continue; end if;

    perform public.notify(
      person.organization_id, person.profile_id, null, 'morning_brief',
      jsonb_build_object(
        'tasks', person.tasks, 'followups', person.followups, 'steps', person.steps,
        'title', coalesce(person.names, '')
      ),
      '/'
    );
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.notify_morning_brief(timestamptz) from public, anon, authenticated;

-- The follow-up job no longer sends its own 08:30 list (the morning brief has it).
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

  return sent;
end;
$$;

-- ---------------------------------------------------------------------
-- Schedule (needs Cron, on since 007)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-morning-brief', '*/15 * * * *', 'select public.notify_morning_brief()');
  end if;
end;
$$;
