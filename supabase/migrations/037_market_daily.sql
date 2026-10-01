-- =====================================================================
-- BRIXA — migration 037: the market, every day, from the agency's own data
--   • every morning: the average price per m² by neighbourhood and by type
--     (studio, two-room… house) — from the listings on the market, the deals of
--     the last 90 days (the register and our sold listings) and the buyers' searches
--   • kept day by day: how the prices move
-- Run once in Supabase → SQL Editor → New query → Run (after 036).
-- =====================================================================

create table public.market_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  day date not null,
  operation text not null check (operation in ('sale', 'rent')),
  settlement_id uuid not null references public.geo_settlements (id) on delete cascade,
  -- none: the whole town
  neighborhood_id uuid references public.geo_neighborhoods (id) on delete cascade,
  -- none: every type
  subtype_id uuid references public.property_subtypes (id) on delete cascade,
  -- the listings on the market: how many, the average and the median € per m² (rent: per month)
  listings int not null default 0,
  listing_avg numeric(12, 2),
  listing_median numeric(12, 2),
  -- sold / rented in the last 90 days
  sold_count int not null default 0,
  sold_avg numeric(12, 2),
  -- the buyers (tenants) looking there now
  demand int not null default 0,
  constraint market_daily_cell unique nulls not distinct (organization_id, day, operation, settlement_id, neighborhood_id, subtype_id)
);

create index market_daily_org_day_idx on public.market_daily (organization_id, day desc, operation);

alter table public.market_daily enable row level security;

create policy "market daily: read" on public.market_daily
  for select to authenticated
  using (public.is_org_member(organization_id));

-- One agency's day: worked out again from scratch (so it can run more than once a day).
create or replace function public.snapshot_market(target_org uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.sofia_today();
  made int;
begin
  delete from public.market_daily where organization_id = target_org and day = today;

  with offers as (
    select p.operation_type as operation, p.settlement_id, p.neighborhood_id, p.subtype_id,
      public.to_eur(p.current_price, p.currency) / p.area as sqm
    from public.properties p
    where p.organization_id = target_org
      and p.status in ('active', 'reserved')
      and p.operation_type in ('sale', 'rent')
      and p.settlement_id is not null and p.subtype_id is not null
      and p.area > 0 and p.current_price > 0
  ),
  sold as (
    -- the register of closed deals (sales)…
    select 'sale'::text as operation, cd.settlement_id, cd.neighborhood_id, cd.subtype_id, cd.price / cd.area as sqm
    from public.closed_deals cd
    where cd.organization_id = target_org and cd.settlement_id is not null
      and cd.reported_on >= today - 90 and cd.price > 0
    union all
    -- …and our listings sold / rented that aren't in it
    select p.operation_type, p.settlement_id, p.neighborhood_id, p.subtype_id,
      coalesce(public.to_eur(w.price, w.currency), public.to_eur(p.current_price, p.currency)) / p.area
    from public.properties p
    left join lateral (
      select d.price, d.currency, d.closed_on from public.deals d
      where d.property_id = p.id and d.status = 'won' and d.price is not null
      order by d.closed_on desc limit 1
    ) w on true
    where p.organization_id = target_org
      and p.status in ('sold', 'rented')
      and p.operation_type in ('sale', 'rent')
      and p.settlement_id is not null and p.subtype_id is not null and p.area > 0
      and coalesce(w.closed_on, (p.updated_at at time zone 'Europe/Sofia')::date) >= today - 90
      and coalesce(public.to_eur(w.price, w.currency), public.to_eur(p.current_price, p.currency)) > 0
      and not exists (select 1 from public.closed_deals cd where cd.property_id = p.id)
  ),
  -- each place and type, each place, the town by type, the whole town
  o as (
    select operation, settlement_id,
      case when grouping(neighborhood_id) = 0 then neighborhood_id end as neighborhood_id,
      case when grouping(subtype_id) = 0 then subtype_id end as subtype_id,
      count(*)::int as listings,
      round(avg(sqm), 2) as listing_avg,
      round(percentile_cont(0.5) within group (order by sqm)::numeric, 2) as listing_median
    from offers
    group by grouping sets (
      (operation, settlement_id, neighborhood_id, subtype_id), (operation, settlement_id, neighborhood_id),
      (operation, settlement_id, subtype_id), (operation, settlement_id)
    )
    -- a listing with no neighbourhood counts for the town only
    having not (grouping(neighborhood_id) = 0 and neighborhood_id is null)
  ),
  s as (
    select operation, settlement_id,
      case when grouping(neighborhood_id) = 0 then neighborhood_id end as neighborhood_id,
      case when grouping(subtype_id) = 0 then subtype_id end as subtype_id,
      count(*)::int as sold_count,
      round(avg(sqm), 2) as sold_avg
    from sold
    group by grouping sets (
      (operation, settlement_id, neighborhood_id, subtype_id), (operation, settlement_id, neighborhood_id),
      (operation, settlement_id, subtype_id), (operation, settlement_id)
    )
    having not (grouping(neighborhood_id) = 0 and neighborhood_id is null)
  ),
  cells as (
    select operation, settlement_id, neighborhood_id, subtype_id, listings, listing_avg, listing_median, 0 as sold_count, null::numeric as sold_avg from o
    union all
    select operation, settlement_id, neighborhood_id, subtype_id, 0, null, null, sold_count, sold_avg from s
  )
  insert into public.market_daily (
    organization_id, day, operation, settlement_id, neighborhood_id, subtype_id,
    listings, listing_avg, listing_median, sold_count, sold_avg
  )
  select target_org, today, operation, settlement_id, neighborhood_id, subtype_id,
    sum(listings)::int, max(listing_avg), max(listing_median), sum(sold_count)::int, max(sold_avg)
  from cells
  group by operation, settlement_id, neighborhood_id, subtype_id;

  -- where buyers look but there's nothing on offer yet (each neighbourhood, every type)
  insert into public.market_daily (organization_id, day, operation, settlement_id, neighborhood_id, subtype_id)
  select distinct target_org, today, cs.operation, g.settlement_id, g.id, null::uuid
  from public.client_searches cs
  join public.clients c on c.id = cs.client_id
  cross join lateral unnest(cs.neighborhood_ids) as nid
  join public.geo_neighborhoods g on g.id = nid
  where c.organization_id = target_org and c.responsible_broker_id is not null and c.stage not in ('deal', 'lost')
  on conflict on constraint market_daily_cell do nothing;

  -- the buyers (tenants) looking in each place, for each type
  update public.market_daily m
  set demand = (
    select count(*)
    from public.client_searches cs
    join public.clients c on c.id = cs.client_id
    where c.organization_id = target_org and c.responsible_broker_id is not null and c.stage not in ('deal', 'lost')
      and cs.operation = m.operation
      and (m.subtype_id is null or cardinality(cs.subtype_ids) = 0 or m.subtype_id = any (cs.subtype_ids))
      and case
        when m.neighborhood_id is not null then m.neighborhood_id = any (cs.neighborhood_ids)
        else m.settlement_id = any (cs.settlement_ids)
          or exists (select 1 from public.geo_neighborhoods g where g.id = any (cs.neighborhood_ids) and g.settlement_id = m.settlement_id)
      end
  )
  where m.organization_id = target_org and m.day = today;

  select count(*) into made from public.market_daily where organization_id = target_org and day = today;
  return made;
end;
$$;

-- every agency (the morning job)
create or replace function public.snapshot_market_all()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  n int := 0;
begin
  for o in select id from public.organizations loop
    perform public.snapshot_market(o.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.snapshot_market(uuid) from public, anon, authenticated;
revoke execute on function public.snapshot_market_all() from public, anon, authenticated;

-- a manager can work today's numbers out again now (after entering many listings, say)
create or replace function public.refresh_market_today(target_org uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_manager(target_org) then
    raise exception 'not allowed';
  end if;
  return public.snapshot_market(target_org);
end;
$$;

revoke execute on function public.refresh_market_today(uuid) from public, anon;
grant execute on function public.refresh_market_today(uuid) to authenticated;

-- every morning at 6:30 (Sofia)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-market-daily', '30 3 * * *', 'select public.snapshot_market_all()');
  end if;
end;
$$;

-- the first day, now
select public.snapshot_market_all();
