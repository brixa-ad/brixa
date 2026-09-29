-- =====================================================================
-- BRIXA — migration 027: the game — business plan, levels, streaks
--   • the ranking can count everything so far (experience for the levels)
--   • activity points day by day (streaks: days with enough points)
--   • each broker's own plan: the yearly goal and why it matters
-- Run once in Supabase → SQL Editor → New query → Run (after 026).
-- =====================================================================

-- ---------------------------------------------------------------------
-- The ranking: this month, this year, or everything ('all')
-- ---------------------------------------------------------------------
create or replace function public.leaderboard(target_org uuid, period text default 'month', ref_day date default null)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  avatar_path text,
  commission numeric,
  deals integer,
  listings integer,
  exclusives integer,
  viewings integer,
  meetings integer,
  calls integer,
  new_clients integer,
  points integer
)
language sql
stable
security definer
set search_path = public
as $$
  with span as (
    select
      case when period = 'all' then date '2000-01-01' else date_trunc(unit, day::timestamp)::date end as from_day,
      case when period = 'all' then date '3000-01-01'
        else (date_trunc(unit, day::timestamp) + ('1 ' || unit)::interval)::date end as to_day
    from (
      select
        case when period = 'year' then 'year' else 'month' end as unit,
        coalesce(ref_day, public.sofia_today()) as day
    ) p
  ),
  bounds as (
    select from_day, to_day,
      from_day::timestamp at time zone 'Europe/Sofia' as from_ts,
      to_day::timestamp at time zone 'Europe/Sofia' as to_ts
    from span
  ),
  won as (
    select d.broker_id as pid, sum(d.net_commission) as total, count(*)::int as n,
      sum(case when d.double_sided then o.points_deal_double else o.points_deal end)::int as dp
    from public.deals d, bounds b, public.organizations o
    where d.organization_id = target_org and o.id = target_org and d.status = 'won' and d.confirmed_at is not null
      and d.closed_on >= b.from_day and d.closed_on < b.to_day
    group by d.broker_id
  ),
  listed as (
    select p.responsible_broker_id as pid, count(*)::int as n,
      (count(*) filter (where p.exclusive_contract))::int as x
    from public.properties p, bounds b
    where p.organization_id = target_org and p.operation_type in ('sale', 'rent')
      and p.created_at >= b.from_ts and p.created_at < b.to_ts
    group by p.responsible_broker_id
  ),
  acts as (
    select a.profile_id as pid,
      (count(*) filter (where a.type = 'viewing'))::int as v,
      (count(*) filter (where a.type = 'meeting'))::int as m,
      (count(*) filter (where a.type = 'call'))::int as c
    from public.activities a, bounds b
    where a.organization_id = target_org and a.occurred_at >= b.from_ts and a.occurred_at < b.to_ts
    group by a.profile_id
  ),
  signed as (
    select c.responsible_broker_id as pid, count(*)::int as n
    from public.clients c, bounds b
    where c.organization_id = target_org and c.created_at >= b.from_ts and c.created_at < b.to_ts
    group by c.responsible_broker_id
  ),
  ranked as (
    select
      m.profile_id, pr.full_name, pr.email, pr.avatar_path,
      coalesce(won.total, 0) as commission,
      coalesce(won.n, 0) as deals,
      coalesce(listed.n, 0) as listings,
      coalesce(listed.x, 0) as exclusives,
      coalesce(acts.v, 0) as viewings,
      coalesce(acts.m, 0) as meetings,
      coalesce(acts.c, 0) as calls,
      coalesce(signed.n, 0) as new_clients,
      coalesce(won.dp, 0) as deal_points
    from public.organization_members m
    join public.profiles pr on pr.id = m.profile_id
    left join won on won.pid = m.profile_id
    left join listed on listed.pid = m.profile_id
    left join acts on acts.pid = m.profile_id
    left join signed on signed.pid = m.profile_id
    where m.organization_id = target_org and public.is_org_member(target_org)
  )
  select r.profile_id, r.full_name, r.email, r.avatar_path, r.commission, r.deals, r.listings,
    r.exclusives, r.viewings, r.meetings, r.calls, r.new_clients,
    (r.deal_points + r.listings * o.points_listing + r.exclusives * o.points_exclusive + r.viewings * o.points_viewing
      + r.meetings * o.points_meeting + r.new_clients * o.points_client + r.calls * o.points_call)::int as points
  from ranked r
  join public.organizations o on o.id = target_org
  order by r.commission desc, points desc, r.full_name;
$$;

-- ---------------------------------------------------------------------
-- Activity points day by day, for everyone in the agency (the streaks)
--   the same points as the ranking, on the day they were earned
-- ---------------------------------------------------------------------
create or replace function public.daily_points(target_org uuid, since date)
returns table (profile_id uuid, day date, points integer)
language sql
stable
security definer
set search_path = public
as $$
  with o as (
    select * from public.organizations where id = target_org
  ),
  start as (
    select since::timestamp at time zone 'Europe/Sofia' as ts
  ),
  earned as (
    select d.broker_id as pid, d.closed_on as day,
      case when d.double_sided then o.points_deal_double else o.points_deal end as pts
    from public.deals d, o
    where d.organization_id = target_org and d.status = 'won' and d.confirmed_at is not null and d.closed_on >= since
    union all
    select p.responsible_broker_id, (p.created_at at time zone 'Europe/Sofia')::date,
      o.points_listing + case when p.exclusive_contract then o.points_exclusive else 0 end
    from public.properties p, o, start
    where p.organization_id = target_org and p.operation_type in ('sale', 'rent') and p.created_at >= start.ts
    union all
    select a.profile_id, (a.occurred_at at time zone 'Europe/Sofia')::date,
      case a.type when 'viewing' then o.points_viewing when 'meeting' then o.points_meeting else o.points_call end
    from public.activities a, o, start
    where a.organization_id = target_org and a.type in ('viewing', 'meeting', 'call') and a.occurred_at >= start.ts
    union all
    select c.responsible_broker_id, (c.created_at at time zone 'Europe/Sofia')::date, o.points_client
    from public.clients c, o, start
    where c.organization_id = target_org and c.created_at >= start.ts
  )
  select e.pid, e.day, sum(e.pts)::int
  from earned e
  join public.organization_members m on m.organization_id = target_org and m.profile_id = e.pid
  where public.is_org_member(target_org)
  group by e.pid, e.day
  order by e.pid, e.day;
$$;

-- ---------------------------------------------------------------------
-- The broker's own plan: the goal for the year and the "why"
--   (the manager's target stays as it is; this is the broker's own)
-- ---------------------------------------------------------------------
create table public.broker_plans (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- commission in euro the broker wants to earn this year
  yearly_goal numeric(12, 2) check (yearly_goal is null or yearly_goal between 0 and 100000000),
  big_why text check (big_why is null or char_length(big_why) <= 500),
  updated_at timestamptz not null default now()
);

alter table public.broker_plans enable row level security;

-- my own plan; managers read the agency's
create policy "plans: read" on public.broker_plans
  for select to authenticated
  using (profile_id = auth.uid() or public.is_org_manager(organization_id));

create policy "plans: create my own" on public.broker_plans
  for insert to authenticated
  with check (profile_id = auth.uid() and public.is_org_member(organization_id));

create policy "plans: update my own" on public.broker_plans
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.is_org_member(organization_id));

grant execute on function public.daily_points(uuid, date) to authenticated;
revoke execute on function public.daily_points(uuid, date) from anon;
