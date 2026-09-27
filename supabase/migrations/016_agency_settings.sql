-- =====================================================================
-- BRIXA — migration 016: agency settings
--   contact details and logo (shown on shared listings and owner reports),
--   the default currency, and the ranking's point values
-- Run once in Supabase → SQL Editor → New query → Run (after 014).
-- =====================================================================

alter table public.organizations
  add column phone text check (phone is null or char_length(phone) <= 40),
  add column email text check (email is null or char_length(email) <= 200),
  add column website text check (website is null or char_length(website) <= 200),
  add column address text check (address is null or char_length(address) <= 300),
  -- agency-logos/<organization_id>/<file>
  add column logo_path text check (logo_path is null or logo_path like id::text || '/%'),
  add column default_currency text not null default 'EUR' check (default_currency in ('EUR', 'BGN', 'USD')),
  add column points_deal_double int not null default 50 check (points_deal_double between 0 and 1000),
  add column points_deal int not null default 30 check (points_deal between 0 and 1000),
  add column points_listing int not null default 10 check (points_listing between 0 and 1000),
  add column points_exclusive int not null default 10 check (points_exclusive between 0 and 1000),
  add column points_viewing int not null default 5 check (points_viewing between 0 and 1000),
  add column points_meeting int not null default 3 check (points_meeting between 0 and 1000),
  add column points_client int not null default 2 check (points_client between 0 and 1000),
  add column points_call int not null default 1 check (points_call between 0 and 1000);

-- Managers look after the agency's settings too (the owner already could).
create policy "organizations: managers update" on public.organizations
  for update to authenticated
  using (public.is_org_manager(id)) with check (public.is_org_manager(id));

-- ---------------------------------------------------------------------
-- The logo: a public bucket, written by the agency's managers
-- ---------------------------------------------------------------------
-- The agency a storage path belongs to (null when the first folder isn't an id).
create or replace function public.org_from_path(object_name text)
returns uuid
language sql
immutable
as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agency-logos', 'agency-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "agency logos: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'agency-logos' and public.is_org_manager(public.org_from_path(name)));
create policy "agency logos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'agency-logos' and public.is_org_manager(public.org_from_path(name)));
create policy "agency logos: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'agency-logos' and public.is_org_member(public.org_from_path(name)));

-- ---------------------------------------------------------------------
-- The ranking uses the agency's point values
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
      date_trunc(unit, day::timestamp)::date as from_day,
      (date_trunc(unit, day::timestamp) + ('1 ' || unit)::interval)::date as to_day
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
    select d.broker_id as pid, sum(d.commission) as total, count(*)::int as n,
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
