-- =====================================================================
-- BRIXA — migration 024: deals actually closed
--   A register the manager fills in week by week (usually at the
--   preliminary contract): date announced, kind, place, sale / purchase,
--   condition, construction, parking, m², prices (total and €/m² computed),
--   our broker and the colleague on the other side with their agency.
--   The market now counts these as the real sold prices.
-- Run once in Supabase → SQL Editor → New query → Run (after 023).
-- =====================================================================

-- ---------------------------------------------------------------------
-- The register of deals the agency actually closed, entered week by week
-- (usually at the preliminary contract) — for the agency's statistics and
-- the market's real sold prices
-- ---------------------------------------------------------------------
create table public.closed_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  -- when the deal was announced (not when it was entered here)
  reported_on date not null,
  subtype_id uuid not null references public.property_subtypes (id),
  settlement_id uuid references public.geo_settlements (id),
  neighborhood_id uuid references public.geo_neighborhoods (id),
  address text check (address is null or char_length(address) <= 300),
  -- we sold (the seller's side) or bought (the buyer's side)
  side text not null default 'sale' check (side in ('sale', 'purchase')),
  conditions text[] not null default '{}' check (conditions <@ array[
    'needs_renovation', 'good', 'renovated', 'furnished', 'unfurnished', 'bds',
    'under_construction', 'act14', 'act15', 'act16', 'new'
  ]),
  construction text check (construction is null or construction in (
    'brick', 'panel', 'epk', 'pk', 'monolithic', 'beam', 'wood', 'prefab'
  )),
  parking boolean not null default false,
  area numeric(10, 2) not null check (area > 0),
  -- euro
  price numeric(14, 2) not null check (price >= 0),
  parking_price numeric(14, 2) check (parking_price is null or parking_price >= 0),
  total_price numeric(14, 2) generated always as (price + coalesce(parking_price, 0)) stored,
  price_per_sqm numeric(12, 2) generated always as (round(price / area, 2)) stored,
  total_per_sqm numeric(12, 2) generated always as (round((price + coalesce(parking_price, 0)) / area, 2)) stored,
  -- our broker; the colleague on the other side: one of ours, or someone at another agency
  broker_id uuid references public.profiles (id) on delete set null,
  colleague_id uuid references public.profiles (id) on delete set null,
  colleague_name text check (colleague_name is null or char_length(colleague_name) <= 120),
  colleague_agency text check (colleague_agency is null or char_length(colleague_agency) <= 120),
  -- both sides ours (two of our brokers, or one broker on both sides)
  double_sided boolean not null default false,
  -- the listing in BRIXA, when there is one
  property_id uuid references public.properties (id) on delete set null,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index closed_deals_org_idx on public.closed_deals (organization_id, reported_on desc);
create index closed_deals_place_idx on public.closed_deals (settlement_id, neighborhood_id);
create index closed_deals_property_idx on public.closed_deals (property_id) where property_id is not null;

create trigger closed_deals_touch_updated_at
  before update on public.closed_deals
  for each row execute function public.touch_updated_at();

alter table public.closed_deals enable row level security;

-- the whole agency learns from them; managers keep the register
create policy "closed deals: read" on public.closed_deals
  for select to authenticated using (public.is_org_member(organization_id));
create policy "closed deals: create" on public.closed_deals
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_org_manager(organization_id));
create policy "closed deals: update" on public.closed_deals
  for update to authenticated
  using (public.is_org_manager(organization_id))
  with check (public.is_org_manager(organization_id));
create policy "closed deals: delete" on public.closed_deals
  for delete to authenticated using (public.is_org_manager(organization_id));

-- The sales a listing is compared with: the register (the real prices) and the
-- listings sold through BRIXA deals that aren't in the register already.
create or replace function public.market_sold(target_property uuid)
returns table (
  same_neighborhood boolean,
  area numeric,
  sold_eur numeric,
  sold_on date,
  listed_on date,
  price_eur numeric,
  from_deal boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select p.*, s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier']) as is_apartment
    from public.properties p
    join public.property_subtypes s on s.id = p.subtype_id
    where p.id = target_property
  )
  select x.same_neighborhood, x.area, x.sold_eur, x.sold_on, x.listed_on, x.price_eur, x.from_deal
  from public.market_pool(target_property) x
  where x.sold_eur > 0
    and not exists (select 1 from public.closed_deals cd where cd.property_id = x.property_id)
  union all
  select cd.neighborhood_id is not distinct from t.neighborhood_id and t.neighborhood_id is not null,
    cd.area, cd.price, cd.reported_on, null::date, null::numeric, false
  from target t
  join public.closed_deals cd
    on cd.organization_id = t.organization_id
   and cd.settlement_id = t.settlement_id
   and cd.property_id is distinct from t.id
  join public.property_subtypes cs on cs.id = cd.subtype_id
  where t.operation_type = 'sale'
    and (case when t.is_apartment then cs.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier']) else cd.subtype_id = t.subtype_id end)
    and (t.area is null or cd.area between t.area * 0.7 and t.area * 1.3);
$$;

revoke execute on function public.market_sold(uuid) from public, anon, authenticated;

-- The listing's facts: sold figures from the register too.
create or replace function public.market_facts(target_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.properties;
  is_apartment boolean;
  own_sqm numeric;
  ref_sqm numeric;
  ref_source text;
  ref_as_of date;
  ref_level text;
  has_ref boolean := false;
  near integer;
  scope text;
  sold_scope text;
  active_count integer;
  active_median numeric;
  sold_count integer;
  sold_median numeric;
  sold_days numeric;
  discount numeric;
  bench numeric;
  basis text;
begin
  select * into p from public.properties where id = target_property;
  if p.id is null or p.operation_type not in ('sale', 'rent') then
    return null;
  end if;
  select s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier'])
    into is_apartment
  from public.property_subtypes s where s.id = p.subtype_id;

  if p.area > 0 and p.current_price > 0 then
    own_sqm := round(public.to_eur(p.current_price, p.currency) / p.area, 2);
  end if;

  -- the reference: this neighborhood, else the whole town (apartments only — that's what the portals publish)
  if is_apartment and p.settlement_id is not null then
    select m.price_per_sqm, m.source, m.as_of,
      case when m.neighborhood_id is null then 'city' else 'neighborhood' end
      into ref_sqm, ref_source, ref_as_of, ref_level
    from public.market_prices m
    where m.organization_id = p.organization_id
      and m.operation = p.operation_type
      and m.settlement_id = p.settlement_id
      and (m.neighborhood_id = p.neighborhood_id or m.neighborhood_id is null)
    order by m.neighborhood_id is null
    limit 1;
    has_ref := found;
  end if;

  -- the agency's own listings: the neighborhood when there are enough, else the town
  select count(*) into near from public.market_pool(p.id) where same_neighborhood;
  scope := case when near >= 3 then 'neighborhood' else 'city' end;

  select count(*), percentile_cont(0.5) within group (order by x.price_eur / x.area)
    into active_count, active_median
  from public.market_pool(p.id) x
  where (scope = 'city' or x.same_neighborhood)
    and x.status in ('active', 'reserved') and x.price_eur > 0;

  -- sales: the neighborhood when it has enough of them, else the town (decided apart from the listings)
  select count(*) into near from public.market_sold(p.id) x
  where x.same_neighborhood and x.sold_on >= public.sofia_today() - 365;
  sold_scope := case when near >= 3 then 'neighborhood' else 'city' end;

  select count(*),
    percentile_cont(0.5) within group (order by x.sold_eur / x.area),
    avg(x.sold_on - x.listed_on) filter (where x.sold_on >= x.listed_on),
    avg((x.price_eur - x.sold_eur) / x.price_eur) filter (where x.from_deal and x.price_eur > 0)
    into sold_count, sold_median, sold_days, discount
  from public.market_sold(p.id) x
  where (sold_scope = 'city' or x.same_neighborhood)
    and x.sold_on >= public.sofia_today() - 365;

  -- what "the market" means for this listing: the reference, else the agency's own listings
  if has_ref then
    bench := ref_sqm;
    basis := 'reference';
  elsif active_count >= 3 then
    bench := round(active_median, 2);
    basis := 'listings';
  end if;
  -- no sales with a deal price → no haggling figure (not 0)
  if discount is not null then
    discount := greatest(0, least(0.3, discount));
  end if;

  return jsonb_build_object(
    'operation', p.operation_type,
    'apartment', coalesce(is_apartment, false),
    'area', p.area,
    'price_eur', round(public.to_eur(p.current_price, p.currency), 2),
    'own_sqm', own_sqm,
    'reference', case when has_ref then jsonb_build_object(
      'sqm', ref_sqm, 'source', ref_source, 'as_of', ref_as_of, 'level', ref_level) end,
    'scope', scope,
    'active', jsonb_build_object('count', active_count, 'median_sqm', round(active_median, 2)),
    'sold', jsonb_build_object('count', sold_count, 'median_sqm', round(sold_median, 2), 'avg_days', round(sold_days), 'scope', sold_scope),
    'discount', round(discount, 4),
    'benchmark', case when bench is not null then jsonb_build_object('sqm', bench, 'basis', basis) end,
    'diff', case when bench > 0 and own_sqm > 0 then round(own_sqm / bench - 1, 4) end,
    'estimate', case when bench > 0 and p.area > 0 then jsonb_build_object(
      'low', round(bench * p.area * 0.95, -2),
      'mid', round(bench * p.area, -2),
      'high', round(bench * p.area * 1.05, -2)) end,
    -- what it's likely to sell for: the agency's own sales, else the market less the usual haggling
    'expected_final', case
      when sold_count >= 3 and p.area > 0 then round(sold_median * p.area, -2)
      when bench > 0 and p.area > 0 and discount is not null then round(bench * p.area * (1 - discount), -2)
    end
  );
end;
$$;

-- The Market page: sold figures from the register too.
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
               case when c.status in ('sold', 'rented') then public.to_eur(c.current_price, c.currency) end) as sold_eur,
      coalesce(w.closed_on,
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

grant execute on function public.market_overview(uuid, text) to authenticated;
revoke execute on function public.market_overview(uuid, text) from anon;
