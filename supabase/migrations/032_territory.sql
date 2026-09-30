-- =====================================================================
-- BRIXA — migration 032: the territory board
--   • per neighbourhood and broker: active listings (and exclusives),
--     deals closed in the last year (BRIXA and the register, counted once),
--     viewings in the last 90 days — for the "who owns the neighbourhood" game
--   • numbers only, for everyone in the agency (no clients, no prices)
-- Run once in Supabase → SQL Editor → New query → Run (after 031).
-- =====================================================================

create or replace function public.territory_board(target_org uuid)
returns table (
  neighborhood_id uuid,
  neighborhood text,
  town text,
  broker_id uuid,
  broker_name text,
  listings integer,
  exclusives integer,
  deals integer,
  viewings integer
)
language sql
stable
security definer
set search_path = public
as $$
  with won as (
    select d.broker_id, p.neighborhood_id, d.property_id
    from public.deals d
    join public.properties p on p.id = d.property_id
    where d.organization_id = target_org and d.status = 'won' and d.closed_on >= public.sofia_today() - 365
      and p.neighborhood_id is not null
  ),
  events as (
    -- active listings now
    select p.neighborhood_id as nid, p.responsible_broker_id as bid, null::text as bname,
      1 as listings, (case when p.exclusive_contract then 1 else 0 end) as exclusives, 0 as deals, 0 as viewings
    from public.properties p
    where p.organization_id = target_org and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
      and p.neighborhood_id is not null and p.responsible_broker_id is not null
    union all
    -- deals closed in BRIXA in the last year
    select w.neighborhood_id, w.broker_id, null, 0, 0, 1, 0 from won w where w.broker_id is not null
    union all
    -- the register's deals of the last year (by the broker's name), unless the same listing is a BRIXA deal
    select c.neighborhood_id, null, btrim(c.broker_name), 0, 0, 1, 0
    from public.closed_deals c
    where c.organization_id = target_org and c.reported_on >= public.sofia_today() - 365 and c.neighborhood_id is not null
      and (c.property_id is null or not exists (select 1 from won w where w.property_id = c.property_id))
    union all
    -- viewings of the last 90 days
    select p.neighborhood_id, a.profile_id, null, 0, 0, 0, 1
    from public.activities a
    join public.properties p on p.id = a.property_id
    where a.organization_id = target_org and a.type = 'viewing'
      and a.occurred_at >= (public.sofia_today() - 90)::timestamp at time zone 'Europe/Sofia'
      and p.neighborhood_id is not null
  )
  select e.nid, n.name, s.settlement_type || ' ' || s.name, e.bid, e.bname,
    sum(e.listings)::int, sum(e.exclusives)::int, sum(e.deals)::int, sum(e.viewings)::int
  from events e
  join public.geo_neighborhoods n on n.id = e.nid
  join public.geo_settlements s on s.id = n.settlement_id
  where public.is_org_member(target_org)
  group by e.nid, n.name, s.settlement_type, s.name, e.bid, e.bname;
$$;

grant execute on function public.territory_board(uuid) to authenticated;
revoke execute on function public.territory_board(uuid) from anon;
