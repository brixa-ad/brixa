-- =====================================================================
-- BRIXA — migration 072: why a listing leaves the market
--   "Delete" on a listing now asks what happened: sold by us, sold by
--   another agency, or taken off the market. The listing moves to
--   "Sold" / "Withdrawn" and keeps the price and the day it was sold for
--   (when the broker knows them). The market's figures count those sales
--   too — another agency's included.
-- Run once in Supabase → SQL Editor → New query → Run (after 071).
-- =====================================================================

alter table public.properties
  add column if not exists sold_price numeric(14, 2) check (sold_price is null or sold_price >= 0),
  add column if not exists sold_on date;

comment on column public.properties.sold_price is 'the price it was sold (or rented) for, in the listing''s currency — told when it left the market';
comment on column public.properties.sold_on is 'the day it was sold (or rented)';

-- The agency's listings around one listing: a sale counts with its own sold price too.
create or replace function public.market_pool(target_property uuid)
returns table (
  property_id uuid,
  same_neighborhood boolean,
  area numeric,
  status text,
  listed_on date,
  price_eur numeric,
  sold_eur numeric,
  sold_on date,
  from_deal boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select p.*, s.code as sub_code,
      s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier']) as is_apartment
    from public.properties p
    join public.property_subtypes s on s.id = p.subtype_id
    where p.id = target_property
  )
  select c.id,
    c.neighborhood_id is not distinct from t.neighborhood_id and t.neighborhood_id is not null,
    c.area,
    c.status,
    (c.created_at at time zone 'Europe/Sofia')::date,
    public.to_eur(c.current_price, c.currency),
    coalesce(public.to_eur(w.price, w.currency),
             case when c.status in ('sold', 'rented', 'sold_elsewhere') then public.to_eur(c.sold_price, c.currency) end,
             case when c.status in ('sold', 'rented') then public.to_eur(c.current_price, c.currency) end),
    coalesce(w.closed_on,
             case when c.status in ('sold', 'rented', 'sold_elsewhere') then c.sold_on end,
             case when c.status in ('sold', 'rented') then (c.updated_at at time zone 'Europe/Sofia')::date end),
    w.price is not null
  from target t
  join public.properties c
    on c.organization_id = t.organization_id
   and c.id <> t.id
   and c.operation_type = t.operation_type
   and c.settlement_id = t.settlement_id
  join public.property_subtypes cs on cs.id = c.subtype_id
  left join lateral (
    select d.price, d.currency, d.closed_on
    from public.deals d
    where d.property_id = c.id and d.status = 'won' and d.price is not null
    order by d.closed_on desc
    limit 1
  ) w on true
  where c.area > 0
    and (case when t.is_apartment
         then cs.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier'])
         else c.subtype_id = t.subtype_id end)
    and (t.area is null or c.area between t.area * 0.7 and t.area * 1.3);
$$;


-- The Market page: the same.
create or replace function public.market_overview(target_org uuid, target_operation text default 'sale')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with apt as (
    select c.id, c.title, c.settlement_id, c.neighborhood_id, c.area, c.status, c.responsible_broker_id,
      public.to_eur(c.current_price, c.currency) as price_eur,
      coalesce(public.to_eur(w.price, w.currency),
               case when c.status in ('sold', 'rented', 'sold_elsewhere') then public.to_eur(c.sold_price, c.currency) end,
               case when c.status in ('sold', 'rented') then public.to_eur(c.current_price, c.currency) end) as sold_eur,
      coalesce(w.closed_on,
               case when c.status in ('sold', 'rented', 'sold_elsewhere') then c.sold_on end,
               case when c.status in ('sold', 'rented') then (c.updated_at at time zone 'Europe/Sofia')::date end) as sold_on,
      (c.created_at at time zone 'Europe/Sofia')::date as listed_on
    from public.properties c
    join public.property_subtypes s on s.id = c.subtype_id
    left join lateral (
      select d.price, d.currency, d.closed_on from public.deals d
      where d.property_id = c.id and d.status = 'won' and d.price is not null
      order by d.closed_on desc limit 1
    ) w on true
    where c.organization_id = target_org
      and c.operation_type = target_operation
      and c.settlement_id is not null
      and c.area > 0
      and s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier'])
  ),
  registered as (
    select cd.settlement_id, cd.neighborhood_id, cd.area, cd.price as sold_eur, cd.reported_on as sold_on, null::date as listed_on
    from public.closed_deals cd
    join public.property_subtypes s on s.id = cd.subtype_id
    where cd.organization_id = target_org
      and target_operation = 'sale'
      and cd.settlement_id is not null
      and s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier'])
  ),
  sold as (
    select a.settlement_id, a.neighborhood_id, a.area, a.sold_eur, a.sold_on, a.listed_on
    from apt a
    where a.sold_eur > 0 and not exists (select 1 from public.closed_deals cd where cd.property_id = a.id)
    union all
    select * from registered
  ),
  places as (
    select settlement_id, neighborhood_id from apt
    union
    select settlement_id, neighborhood_id from registered
    union
    select settlement_id, neighborhood_id from public.market_prices
    where organization_id = target_org and operation = target_operation
  ),
  rows as (
    select pl.settlement_id, pl.neighborhood_id,
      gs.settlement_type || ' ' || gs.name as town,
      gn.name as neighborhood,
      m.price_per_sqm as ref_sqm, m.source, m.as_of,
      (select count(*) from apt a where a.settlement_id = pl.settlement_id
         and a.neighborhood_id is not distinct from pl.neighborhood_id
         and a.status in ('active', 'reserved') and a.price_eur > 0) as active_count,
      (select round(percentile_cont(0.5) within group (order by a.price_eur / a.area)::numeric, 2) from apt a
         where a.settlement_id = pl.settlement_id and a.neighborhood_id is not distinct from pl.neighborhood_id
           and a.status in ('active', 'reserved') and a.price_eur > 0) as active_sqm,
      (select count(*) from sold a where a.settlement_id = pl.settlement_id
         and a.neighborhood_id is not distinct from pl.neighborhood_id
         and a.sold_on >= public.sofia_today() - 365) as sold_count,
      (select round(percentile_cont(0.5) within group (order by a.sold_eur / a.area)::numeric, 2) from sold a
         where a.settlement_id = pl.settlement_id and a.neighborhood_id is not distinct from pl.neighborhood_id
           and a.sold_on >= public.sofia_today() - 365) as sold_sqm,
      (select round(avg(a.sold_on - a.listed_on)) from sold a
         where a.settlement_id = pl.settlement_id and a.neighborhood_id is not distinct from pl.neighborhood_id
           and a.sold_on >= public.sofia_today() - 365 and a.sold_on >= a.listed_on) as sold_days
    from places pl
    join public.geo_settlements gs on gs.id = pl.settlement_id
    left join public.geo_neighborhoods gn on gn.id = pl.neighborhood_id
    left join public.market_prices m
      on m.organization_id = target_org and m.operation = target_operation
     and m.settlement_id = pl.settlement_id and m.neighborhood_id is not distinct from pl.neighborhood_id
  ),
  -- each active listing against the neighborhood's reference (else the town's)
  priced as (
    select a.id, a.title, a.area, a.price_eur, a.responsible_broker_id,
      gn.name as neighborhood,
      round(a.price_eur / a.area, 2) as own_sqm,
      coalesce(
        (select m.price_per_sqm from public.market_prices m
          where m.organization_id = target_org and m.operation = target_operation
            and m.settlement_id = a.settlement_id and m.neighborhood_id = a.neighborhood_id),
        (select m.price_per_sqm from public.market_prices m
          where m.organization_id = target_org and m.operation = target_operation
            and m.settlement_id = a.settlement_id and m.neighborhood_id is null)
      ) as bench
    from apt a
    left join public.geo_neighborhoods gn on gn.id = a.neighborhood_id
    where a.status in ('active', 'reserved') and a.price_eur > 0
  )
  select jsonb_build_object(
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object(
          'settlement_id', r.settlement_id, 'neighborhood_id', r.neighborhood_id,
          'town', r.town, 'neighborhood', r.neighborhood,
          'ref_sqm', r.ref_sqm, 'source', r.source, 'as_of', r.as_of,
          'active_count', r.active_count, 'active_sqm', r.active_sqm,
          'sold_count', r.sold_count, 'sold_sqm', r.sold_sqm, 'sold_days', r.sold_days)
        order by r.town, r.neighborhood nulls first)
      from rows r
      where public.is_org_member(target_org)), '[]'::jsonb),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', x.id, 'title', x.title, 'neighborhood', x.neighborhood,
          'broker', public.person_name(x.responsible_broker_id),
          'own_sqm', x.own_sqm, 'bench', x.bench, 'diff', round(x.own_sqm / x.bench - 1, 4))
        order by abs(x.own_sqm / x.bench - 1) desc)
      from priced x
      where x.bench > 0 and abs(x.own_sqm / x.bench - 1) >= 0.05
        and public.is_org_member(target_org)), '[]'::jsonb)
  );
$$;

