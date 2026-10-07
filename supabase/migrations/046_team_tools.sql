-- =====================================================================
-- BRIXA — migration 046: tools for leading a team
--   • the week of the people one leads: calls, meetings, viewings, new clients,
--     new listings, deals and commission — against the week before; every Monday
--     morning the leaders are told it's ready
--   • commission goals for the whole agency, an office or a team, by month, with
--     what has been reached (everyone in the agency sees them)
--   • handing a broker's work to a colleague: clients, listings on the market,
--     open deals, open tasks — whichever are chosen
-- Run once in Supabase → SQL Editor → New query → Run (after 045).
-- =====================================================================

-- ---------------------------------------------------------------------
-- The numbers of each person between two days (Sofia time)
-- ---------------------------------------------------------------------
create or replace function public.people_numbers(target_org uuid, from_day date, to_day date)
returns table (
  profile_id uuid,
  calls int,
  meetings int,
  viewings int,
  new_clients int,
  listings int,
  deals int,
  commission numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select from_day::timestamp at time zone 'Europe/Sofia' as f, to_day::timestamp at time zone 'Europe/Sofia' as t
  ),
  acts as (
    select a.profile_id as pid,
      (count(*) filter (where a.type = 'call'))::int as c,
      (count(*) filter (where a.type = 'meeting'))::int as m,
      (count(*) filter (where a.type = 'viewing'))::int as v
    from public.activities a, b
    where a.organization_id = target_org and a.occurred_at >= b.f and a.occurred_at < b.t
    group by a.profile_id
  ),
  signed as (
    select c.responsible_broker_id as pid, count(*)::int as n
    from public.clients c, b
    where c.organization_id = target_org and c.created_at >= b.f and c.created_at < b.t
    group by c.responsible_broker_id
  ),
  listed as (
    select p.responsible_broker_id as pid, count(*)::int as n
    from public.properties p, b
    where p.organization_id = target_org and p.operation_type in ('sale', 'rent') and p.created_at >= b.f and p.created_at < b.t
    group by p.responsible_broker_id
  ),
  won as (
    select d.broker_id as pid, count(*)::int as n, sum(d.net_commission) as total
    from public.deals d
    where d.organization_id = target_org and d.status = 'won' and d.confirmed_at is not null
      and d.closed_on >= from_day and d.closed_on < to_day
    group by d.broker_id
  )
  select m.profile_id,
    coalesce(acts.c, 0), coalesce(acts.m, 0), coalesce(acts.v, 0),
    coalesce(signed.n, 0), coalesce(listed.n, 0), coalesce(won.n, 0), coalesce(won.total, 0)
  from public.organization_members m
  left join acts on acts.pid = m.profile_id
  left join signed on signed.pid = m.profile_id
  left join listed on listed.pid = m.profile_id
  left join won on won.pid = m.profile_id
  where m.organization_id = target_org;
$$;

revoke execute on function public.people_numbers(uuid, date, date) from public, anon, authenticated;

-- The week (from its Monday) of the people the viewer leads — and the viewer — against the week before.
create or replace function public.team_week(target_org uuid, week_start date)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  avatar_path text,
  role text,
  office_id uuid,
  team_id uuid,
  calls int, meetings int, viewings int, new_clients int, listings int, deals int, commission numeric,
  prev_calls int, prev_meetings int, prev_viewings int, prev_new_clients int, prev_listings int, prev_deals int, prev_commission numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select date_trunc('week', coalesce(week_start, public.sofia_today())::timestamp)::date as d)
  select m.profile_id, pr.full_name, pr.email, pr.avatar_path, m.role,
    coalesce((select tm.office_id from public.teams tm where tm.id = m.team_id), m.office_id), m.team_id,
    cur.calls, cur.meetings, cur.viewings, cur.new_clients, cur.listings, cur.deals, cur.commission,
    prev.calls, prev.meetings, prev.viewings, prev.new_clients, prev.listings, prev.deals, prev.commission
  from w,
    public.organization_members m
    join public.profiles pr on pr.id = m.profile_id
    join public.people_numbers(target_org, (select d from w), (select d + 7 from w)) cur on cur.profile_id = m.profile_id
    join public.people_numbers(target_org, (select d - 7 from w), (select d from w)) prev on prev.profile_id = m.profile_id
  where m.organization_id = target_org
    and public.is_org_member(target_org)
    and (m.profile_id = auth.uid() or public.oversees_as(auth.uid(), m.profile_id))
  order by cur.commission desc, cur.deals desc, (cur.calls + cur.meetings + cur.viewings) desc, pr.full_name;
$$;

revoke execute on function public.team_week(uuid, date) from public, anon;
grant execute on function public.team_week(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- Commission goals of the agency, an office, a team — by month
-- ---------------------------------------------------------------------
create table public.group_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scope text not null check (scope in ('agency', 'office', 'team')),
  scope_id uuid,
  month date not null check (extract(day from month) = 1),
  target numeric(14, 2) not null check (target > 0 and target < 1000000000),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint group_goals_one unique nulls not distinct (organization_id, scope, scope_id, month),
  constraint group_goals_scope check ((scope = 'agency') = (scope_id is null))
);

alter table public.group_goals enable row level security;

-- who may set a goal: the owner any; an office manager their office and its teams; a team manager their team
create or replace function public.can_set_group_goal(target_org uuid, goal_scope text, goal_scope_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members me
    where me.organization_id = target_org and me.profile_id = auth.uid()
      and (
        me.role = 'owner'
        or (me.role = 'office_manager' and me.office_id is not null and (
          (goal_scope = 'office' and goal_scope_id = me.office_id)
          or (goal_scope = 'team' and exists (
            select 1 from public.teams tm where tm.id = goal_scope_id and tm.organization_id = target_org and tm.office_id = me.office_id))
        ))
        or (me.role = 'manager' and goal_scope = 'team' and exists (
          select 1 from public.teams tm where tm.id = goal_scope_id and tm.organization_id = target_org and tm.manager_id = auth.uid()))
      )
  );
$$;

create policy "group goals: read" on public.group_goals
  for select to authenticated using (public.is_org_member(organization_id));
create policy "group goals: set" on public.group_goals
  for insert to authenticated with check (public.can_set_group_goal(organization_id, scope, scope_id));
create policy "group goals: change" on public.group_goals
  for update to authenticated
  using (public.can_set_group_goal(organization_id, scope, scope_id))
  with check (public.can_set_group_goal(organization_id, scope, scope_id));
create policy "group goals: remove" on public.group_goals
  for delete to authenticated using (public.can_set_group_goal(organization_id, scope, scope_id));

-- A month's goals and what has been reached (the confirmed deals of the people in each).
create or replace function public.group_goal_progress(target_org uuid, goal_month date)
returns table (scope text, scope_id uuid, name text, target numeric, reached numeric, people int)
language sql
stable
security definer
set search_path = public
as $$
  with mo as (select date_trunc('month', coalesce(goal_month, public.sofia_today())::timestamp)::date as d),
  people as (
    select m.profile_id, m.team_id, coalesce((select tm.office_id from public.teams tm where tm.id = m.team_id), m.office_id) as office_id
    from public.organization_members m where m.organization_id = target_org
  ),
  won as (
    select d.broker_id, sum(d.net_commission) as total
    from public.deals d, mo
    where d.organization_id = target_org and d.status = 'won' and d.confirmed_at is not null
      and d.closed_on >= mo.d and d.closed_on < (mo.d + interval '1 month')::date
    group by d.broker_id
  )
  select g.scope, g.scope_id,
    case g.scope
      when 'agency' then (select o.name from public.organizations o where o.id = target_org)
      when 'office' then (select f.name from public.offices f where f.id = g.scope_id)
      else (select tm.name from public.teams tm where tm.id = g.scope_id)
    end,
    g.target,
    coalesce((
      select sum(won.total) from people p join won on won.broker_id = p.profile_id
      where g.scope = 'agency' or (g.scope = 'office' and p.office_id = g.scope_id) or (g.scope = 'team' and p.team_id = g.scope_id)
    ), 0),
    (select count(*)::int from people p
      where g.scope = 'agency' or (g.scope = 'office' and p.office_id = g.scope_id) or (g.scope = 'team' and p.team_id = g.scope_id))
  from public.group_goals g, mo
  where g.organization_id = target_org and g.month = mo.d and public.is_org_member(target_org)
  order by case g.scope when 'agency' then 0 when 'office' then 1 else 2 end, 3;
$$;

revoke execute on function public.group_goal_progress(uuid, date) from public, anon;
grant execute on function public.group_goal_progress(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- Handing a broker's work to a colleague
-- ---------------------------------------------------------------------
create or replace function public.hand_over_work(target_org uuid, from_profile uuid, to_profile uuid, what text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  claim_sub text;
  claims text;
  c record;
  n_clients int := 0;
  n_properties int := 0;
  n_deals int := 0;
  n_tasks int := 0;
begin
  if from_profile is null or to_profile is null or from_profile = to_profile
     or not exists (select 1 from public.organization_members m where m.organization_id = target_org and m.profile_id = from_profile)
     or not exists (select 1 from public.organization_members m where m.organization_id = target_org and m.profile_id = to_profile) then
    raise exception 'invalid';
  end if;
  -- the one handing over leads the broker; the work goes to themself or to someone they lead
  if not (public.oversees_as(me, from_profile) and (to_profile = me or public.oversees_as(me, to_profile))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- one notice at the end, not one per client
  perform set_config('brixa.importing', 'on', true);

  if 'clients' = any (what) then
    for c in select id, follow_up_at, client_class from public.clients
             where organization_id = target_org and responsible_broker_id = from_profile loop
      update public.clients set responsible_broker_id = to_profile where id = c.id;
      -- the next contact stays as it was (or follows the class) — not "within 24 hours" for every one
      update public.clients
      set follow_up_at = case when c.follow_up_at > now() then c.follow_up_at else public.import_follow_up(target_org, c.client_class) end
      where id = c.id;
      n_clients := n_clients + 1;
    end loop;
  end if;

  if 'properties' = any (what) then
    update public.properties set responsible_broker_id = to_profile
    where organization_id = target_org and responsible_broker_id = from_profile and status in ('active', 'reserved', 'withdrawn');
    get diagnostics n_properties = row_count;
  end if;

  if 'deals' = any (what) then
    -- the authority was checked above; the deal guard sees no caller for this move
    claim_sub := current_setting('request.jwt.claim.sub', true);
    claims := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    update public.deals set broker_id = to_profile
    where organization_id = target_org and broker_id = from_profile and status = 'open';
    get diagnostics n_deals = row_count;
    perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  end if;

  if 'tasks' = any (what) then
    update public.tasks set assigned_to = to_profile
    where organization_id = target_org and assigned_to = from_profile and status = 'open';
    get diagnostics n_tasks = row_count;
  end if;

  if n_clients + n_properties + n_deals + n_tasks > 0 and to_profile <> me then
    perform public.notify(
      target_org, to_profile, me, 'work_handed',
      jsonb_build_object('title', public.person_name(from_profile), 'clients', n_clients, 'properties', n_properties, 'deals', n_deals, 'tasks', n_tasks),
      '/'
    );
  end if;
  return jsonb_build_object('clients', n_clients, 'properties', n_properties, 'deals', n_deals, 'tasks', n_tasks);
end;
$$;

revoke execute on function public.hand_over_work(uuid, uuid, uuid, text[]) from public, anon;
grant execute on function public.hand_over_work(uuid, uuid, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Monday morning: the leaders hear the last week's report is ready
-- ---------------------------------------------------------------------
create or replace function public.notify_team_week()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  leader record;
  last_monday date := date_trunc('week', public.sofia_today()::timestamp)::date - 7;
  n int := 0;
begin
  for leader in
    select m.organization_id, m.profile_id from public.organization_members m
    where m.role in ('owner', 'office_manager', 'manager')
      and exists (
        select 1 from public.organization_members o
        where o.organization_id = m.organization_id and o.profile_id <> m.profile_id and public.oversees_as(m.profile_id, o.profile_id)
      )
  loop
    perform public.notify(
      leader.organization_id, leader.profile_id, null, 'team_week',
      jsonb_build_object('title', to_char(last_monday, 'DD.MM')),
      '/team/report?week=' || last_monday
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.notify_team_week() from public, anon, authenticated;

-- Mondays 9:00 (Sofia, summer time)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-team-week', '0 6 * * 1', 'select public.notify_team_week()');
  end if;
end;
$$;
