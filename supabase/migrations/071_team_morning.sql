-- =====================================================================
-- BRIXA — migration 071: one word a morning for a team's leader
--   The owner and the managers no longer get a notification for every
--   task, follow-up or deal date someone in the team missed (some got 20
--   to 30 a day). Those go into the 08:00 word instead, next to their
--   own day: "Your day: 3 tasks… Your team: 7 overdue tasks (Иван,
--   Мария…), 4 clients not called, 2 deal steps today, 1 client freed."
-- Run once in Supabase → SQL Editor → New query → Run (after 070).
-- =====================================================================

-- what happened in the team, kept for the leader's morning word
create table if not exists public.team_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  manager_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists team_events_manager_idx on public.team_events (manager_id, created_at desc);
alter table public.team_events enable row level security;
revoke all on public.team_events from anon, authenticated;

-- every notification goes through here: a team's misses wait for the morning, the rest go at once
create or replace function public.notify(
  target_org uuid, recipient uuid, actor uuid, kind text, payload jsonb, target_link text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if kind in ('task_overdue_team', 'tasks_missed_team', 'follow_up_missed_team', 'client_released_team', 'deal_date_team') then
    insert into public.team_events (organization_id, manager_id, actor_id, kind)
    values (target_org, recipient, actor, kind);
    return;
  end if;
  insert into public.notifications (organization_id, recipient_id, actor_id, type, data, link)
  values (target_org, recipient, actor, kind, coalesce(payload, '{}'), target_link);
end;
$$;
revoke execute on function public.notify(uuid, uuid, uuid, text, jsonb, text) from public, anon, authenticated;

-- 08:00: my day, and — for whoever leads people — the team's, in the same word
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
  since timestamptz := at_time - interval '24 hours';
  stages text[] := array['viewing', 'offer', 'deposit', 'preliminary', 'notary'];
  person record;
  team_tasks integer;
  team_followups integer;
  team_steps integer;
  team_released integer;
  team_names text;
  sent integer := 0;
begin
  if local_now::time < time '08:00' then return 0; end if;

  for person in
    select m.organization_id, m.profile_id, m.role,
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
    team_tasks := 0; team_followups := 0; team_steps := 0; team_released := 0; team_names := null;
    if person.role <> 'broker' then
      -- the people this person leads, as they stand this morning
      select
        (select count(*)::int from public.tasks t
          where t.organization_id = person.organization_id and t.status = 'open' and t.due_date < today
            and t.assigned_to <> person.profile_id and public.oversees_as(person.profile_id, t.assigned_to)) as tasks,
        (select count(*)::int from public.clients c
          where c.organization_id = person.organization_id and c.follow_up_at < at_time
            and c.responsible_broker_id is not null and c.responsible_broker_id <> person.profile_id
            and public.oversees_as(person.profile_id, c.responsible_broker_id)) as followups,
        (select count(*)::int from public.deals d
          cross join lateral (values
            ('viewing', d.viewing_on), ('offer', d.offer_on), ('deposit', d.deposit_on),
            ('preliminary', d.preliminary_on), ('notary', d.notary_on)
          ) as s (stage, due)
          where d.organization_id = person.organization_id and d.status = 'open' and s.due = today
            and d.broker_id <> person.profile_id and public.oversees_as(person.profile_id, d.broker_id)) as steps,
        (select count(*)::int from public.team_events e
          where e.manager_id = person.profile_id and e.kind = 'client_released_team' and e.created_at >= since) as released,
        -- who is behind the most
        (select array_to_string((array_agg(x.name order by x.late desc))[1:3], ', ')
          from (
            select public.person_name(t.assigned_to) as name, count(*) as late
            from public.tasks t
            where t.organization_id = person.organization_id and t.status = 'open' and t.due_date < today
              and t.assigned_to <> person.profile_id and public.oversees_as(person.profile_id, t.assigned_to)
            group by t.assigned_to
          ) x) as names
      into team_tasks, team_followups, team_steps, team_released, team_names;
    end if;

    continue when person.tasks + person.followups + person.steps
      + team_tasks + team_followups + team_steps + team_released = 0;

    insert into public.morning_digests (profile_id, day) values (person.profile_id, today)
    on conflict do nothing;
    if not found then continue; end if;

    perform public.notify(
      person.organization_id, person.profile_id, null, 'morning_brief',
      jsonb_build_object(
        'tasks', person.tasks, 'followups', person.followups, 'steps', person.steps,
        'title', coalesce(person.names, ''),
        'team_tasks', team_tasks, 'team_followups', team_followups,
        'team_steps', team_steps, 'team_released', team_released,
        'team_names', coalesce(team_names, '')
      ),
      '/'
    );
    sent := sent + 1;
  end loop;

  delete from public.team_events where created_at < at_time - interval '7 days';
  return sent;
end;
$$;
revoke execute on function public.notify_morning_brief(timestamptz) from public, anon, authenticated;
