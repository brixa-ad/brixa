-- =====================================================================
-- BRIXA — migration 020: the market
--   Reference prices per neighborhood that the agency keeps (€/m² of
--   apartments, e.g. from the portals' statistics), compared with the
--   agency's own listings and sales: a listing's €/m² against the market,
--   a price range, the usual haggling, days to sell, and the Market page.
--   The owner's report shows the price against the market too.
-- Run once in Supabase → SQL Editor → New query → Run (after 019).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reference prices the agency keeps: average €/m² of apartments by
-- neighborhood (or the whole town when neighborhood_id is null),
-- e.g. taken monthly from the portals' statistics.
-- ---------------------------------------------------------------------
create table public.market_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  operation text not null default 'sale' check (operation in ('sale', 'rent')),
  settlement_id uuid not null references public.geo_settlements (id) on delete cascade,
  neighborhood_id uuid references public.geo_neighborhoods (id) on delete cascade,
  -- euro per m² (rent: per month)
  price_per_sqm numeric(10, 2) not null check (price_per_sqm > 0),
  source text check (source is null or char_length(source) <= 120),
  as_of date not null default public.sofia_today(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint market_prices_one unique nulls not distinct (organization_id, operation, settlement_id, neighborhood_id)
);

alter table public.market_prices enable row level security;

-- everyone in the agency reads them; only managers change them (through set_market_prices)
create policy "market prices: read" on public.market_prices
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Euro, whatever the listing was entered in (the lev at the fixed rate).
create or replace function public.to_eur(amount numeric, currency text)
returns numeric
language sql
immutable
as $$
  select case currency when 'EUR' then amount when 'BGN' then amount / 1.95583 else null end;
$$;

-- A manager saves a town's prices at once; an empty price removes the row.
create or replace function public.set_market_prices(
  target_org uuid, target_operation text, target_settlement uuid, prices jsonb, price_source text, price_date date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  hood uuid;
  amount numeric;
  saved integer := 0;
begin
  if not public.is_org_manager(target_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if target_operation not in ('sale', 'rent') then
    raise exception 'bad operation';
  end if;
  if price_source is not null and char_length(price_source) > 120 then
    raise exception 'source too long';
  end if;

  for item in select * from jsonb_array_elements(coalesce(prices, '[]'::jsonb)) loop
    hood := nullif(item ->> 'neighborhood_id', '')::uuid;
    amount := nullif(item ->> 'price', '')::numeric;
    -- the neighborhood has to be in this town
    if hood is not null and not exists (
      select 1 from public.geo_neighborhoods n where n.id = hood and n.settlement_id = target_settlement
    ) then
      continue;
    end if;

    if amount is null or amount <= 0 then
      delete from public.market_prices
      where organization_id = target_org and operation = target_operation
        and settlement_id = target_settlement and neighborhood_id is not distinct from hood;
    else
      insert into public.market_prices
        (organization_id, operation, settlement_id, neighborhood_id, price_per_sqm, source, as_of, updated_by, updated_at)
      values
        (target_org, target_operation, target_settlement, hood, round(amount, 2),
         nullif(trim(price_source), ''), coalesce(price_date, public.sofia_today()), auth.uid(), now())
      on conflict on constraint market_prices_one do update
        set price_per_sqm = excluded.price_per_sqm,
            source = excluded.source,
            as_of = excluded.as_of,
            updated_by = excluded.updated_by,
            updated_at = now();
      saved := saved + 1;
    end if;
  end loop;
  return saved;
end;
$$;

-- ---------------------------------------------------------------------
-- The listings a property is compared with: the agency's own, same
-- kind (any apartment for an apartment, else the same subtype), same
-- town and operation, area within ±30%. Sold ones carry the deal price.
-- ---------------------------------------------------------------------
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
             case when c.status in ('sold', 'rented') then public.to_eur(c.current_price, c.currency) end),
    coalesce(w.closed_on,
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

-- Everything the app says about one listing's price: its €/m², the
-- agency's reference for the neighborhood, the agency's own listings and
-- sales around it, and a price range. Only aggregates — never whose.
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

  select count(*),
    percentile_cont(0.5) within group (order by x.sold_eur / x.area),
    avg(x.sold_on - x.listed_on) filter (where x.sold_on >= x.listed_on),
    avg((x.price_eur - x.sold_eur) / x.price_eur) filter (where x.from_deal and x.price_eur > 0)
    into sold_count, sold_median, sold_days, discount
  from public.market_pool(p.id) x
  where (scope = 'city' or x.same_neighborhood)
    and x.sold_eur > 0 and x.sold_on >= public.sofia_today() - 365;

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
    'sold', jsonb_build_object('count', sold_count, 'median_sqm', round(sold_median, 2), 'avg_days', round(sold_days)),
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

revoke execute on function public.market_pool(uuid) from public, anon, authenticated;
revoke execute on function public.market_facts(uuid) from public, anon, authenticated;

-- For the app: anyone in the listing's agency.
create or replace function public.market_snapshot(target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.market_facts(p.id)
  from public.properties p
  where p.id = target_property and public.is_org_member(p.organization_id);
$$;

-- The Market page: every town / neighborhood the agency has apartments or a
-- reference price in, and the listings priced away from the market.
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
  places as (
    select settlement_id, neighborhood_id from apt
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
      (select count(*) from apt a where a.settlement_id = pl.settlement_id
         and a.neighborhood_id is not distinct from pl.neighborhood_id
         and a.sold_eur > 0 and a.sold_on >= public.sofia_today() - 365) as sold_count,
      (select round(percentile_cont(0.5) within group (order by a.sold_eur / a.area)::numeric, 2) from apt a
         where a.settlement_id = pl.settlement_id and a.neighborhood_id is not distinct from pl.neighborhood_id
           and a.sold_eur > 0 and a.sold_on >= public.sofia_today() - 365) as sold_sqm,
      (select round(avg(a.sold_on - a.listed_on)) from apt a
         where a.settlement_id = pl.settlement_id and a.neighborhood_id is not distinct from pl.neighborhood_id
           and a.sold_eur > 0 and a.sold_on >= public.sofia_today() - 365 and a.sold_on >= a.listed_on) as sold_days
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

grant execute on function public.market_snapshot(uuid) to authenticated;
grant execute on function public.market_overview(uuid, text) to authenticated;
grant execute on function public.set_market_prices(uuid, text, uuid, jsonb, text, date) to authenticated;
revoke execute on function public.market_snapshot(uuid) from anon;
revoke execute on function public.market_overview(uuid, text) from anon;
revoke execute on function public.set_market_prices(uuid, text, uuid, jsonb, text, date) from anon;

-- The owner's report: the price against the market too.
create or replace function public.owner_report(report_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.owner_reports;
  p public.properties;
  result jsonb;
begin
  select * into r from public.owner_reports where token = report_token and revoked_at is null;
  if r.id is null then
    return null;
  end if;
  select * into p from public.properties where id = r.property_id;

  with
  -- a viewing logged by hand and the same one on a deal count once
  viewings as (
    select (a.occurred_at at time zone 'Europe/Sofia')::date as on_day, a.client_id
    from public.activities a
    where a.property_id = p.id and a.type = 'viewing'
      and a.client_id is distinct from p.owner_client_id
    union
    select d.viewing_on, d.client_id
    from public.deals d
    where d.property_id = p.id and d.viewing_on is not null
  ),
  period_viewings as (
    select on_day from viewings where on_day between r.period_start and r.period_end
  ),
  -- buyers calling, writing, meeting about it (not the owner; not the links sent — counted apart)
  inquiries as (
    select (a.occurred_at at time zone 'Europe/Sofia')::date as on_day
    from public.activities a
    where a.property_id = p.id
      and a.type in ('call', 'email', 'message', 'meeting')
      and a.client_id is distinct from p.owner_client_id
      and not (a.type = 'message' and coalesce(a.note, '') like '🔗%')
      and (a.occurred_at at time zone 'Europe/Sofia')::date between r.period_start and r.period_end
  ),
  shares as (
    select sh.views, sh.first_viewed_at
    from public.property_shares sh
    where sh.property_id = p.id
      and (sh.created_at at time zone 'Europe/Sofia')::date between r.period_start and r.period_end
  ),
  offers as (
    select o.amount, o.currency, o.offered_on, o.status
    from public.deal_offers o
    join public.deals d on d.id = o.deal_id
    where d.property_id = p.id and o.offered_on between r.period_start and r.period_end
  )
  select jsonb_build_object(
    'report', jsonb_build_object(
      'period_start', r.period_start,
      'period_end', r.period_end,
      'comment', r.comment,
      'created_at', r.created_at
    ),
    'owner', (select c.full_name from public.clients c where c.id = p.owner_client_id),
    'property', jsonb_build_object(
      'title', p.title,
      'operation', p.operation_type,
      'status', p.status,
      'price', p.current_price,
      'asking_price', p.asking_price,
      'currency', p.currency,
      'area', p.area,
      'listed_at', p.created_at,
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'cover', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1)
    ),
    'totals', jsonb_build_object(
      'viewings', (select count(*) from period_viewings),
      'inquiries', (select count(*) from inquiries),
      'shared', (select count(*) from shares),
      'opened', (select count(*) from shares where first_viewed_at is not null),
      'offers', (select count(*) from offers),
      'best_offer', (select max(amount) from offers where status <> 'rejected')
    ),
    'viewings', coalesce((select jsonb_agg(on_day order by on_day desc) from period_viewings), '[]'::jsonb),
    'inquiries', coalesce((select jsonb_agg(on_day order by on_day desc) from inquiries), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object('amount', amount, 'currency', currency, 'on', offered_on, 'status', status)
        order by offered_on desc)
      from offers), '[]'::jsonb),
    -- where the interested clients are now (open deals, by stage)
    'in_progress', coalesce((
      select jsonb_agg(jsonb_build_object('stage', stage, 'kind', kind, 'count', n) order by n desc)
      from (
        select d.stage, d.kind, count(*) as n
        from public.deals d
        where d.property_id = p.id and d.status = 'open'
        group by d.stage, d.kind
      ) s), '[]'::jsonb),
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object('at', h.changed_at, 'old', h.old_price, 'new', h.new_price, 'currency', h.currency)
        order by h.changed_at)
      from public.property_price_history h
      where h.property_id = p.id), '[]'::jsonb),
    'market', public.market_facts(p.id),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = coalesce(p.responsible_broker_id, r.created_by)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  ) into result;

  return result;
end;
$$;
