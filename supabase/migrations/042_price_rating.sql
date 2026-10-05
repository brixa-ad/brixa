-- =====================================================================
-- BRIXA — migration 042: how a listing stands on the market (stars) and the analysis
--   • a broker adds comparable listings found on the portals (link, price, m²)
--   • the stars: the listing's €/m² against the market — the comparables (ours and
--     the added ones) when there are any, else the market BRIXA already uses:
--     5 at least 10% under · 4 3–10% under · 3 within 3% · 2 3–10% over · 1 over 10%
--   • the analysis (for the owner's and the buyer's PDF): the rating, the price
--     range, the comparables and the sales around
--   • the client's link and the website show the stars only at 4–5
-- Run once in Supabase → SQL Editor → New query → Run (after 041).
-- =====================================================================

create table public.property_comparables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  url text check (url is null or (url ~* '^https?://' and char_length(url) <= 500)),
  -- the portal, from the link (imot.bg, homes.bg…)
  source text check (source is null or char_length(source) <= 60),
  title text check (title is null or char_length(title) <= 160),
  price numeric(12, 2) not null check (price > 0 and price < 100000000),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN')),
  area numeric(10, 2) not null check (area > 0 and area < 100000),
  floor int check (floor is null or floor between -5 and 200),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index property_comparables_property_idx on public.property_comparables (property_id, created_at);

alter table public.property_comparables enable row level security;

-- the agency reads them; whoever may change the listing adds and removes them
create policy "comparables: read" on public.property_comparables
  for select to authenticated using (public.is_org_member(organization_id));
create policy "comparables: add" on public.property_comparables
  for insert to authenticated
  with check (
    public.can_edit_property(property_id)
    and exists (select 1 from public.properties p where p.id = property_comparables.property_id and p.organization_id = property_comparables.organization_id)
  );
create policy "comparables: change" on public.property_comparables
  for update to authenticated
  using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
create policy "comparables: remove" on public.property_comparables
  for delete to authenticated using (public.can_edit_property(property_id));

-- How a listing's price stands: the market facts plus the stars (null: no market to compare with).
create or replace function public.price_rating(target_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.properties;
  facts jsonb;
  own numeric;
  added int;
  pool int;
  pool_median numeric;
  bench numeric;
  basis text;
  diff numeric;
  stars int;
begin
  select * into p from public.properties where id = target_property;
  if p.id is null or p.operation_type not in ('sale', 'rent') then
    return null;
  end if;
  facts := public.market_facts(p.id);
  if facts is null then
    return null;
  end if;
  own := (facts ->> 'own_sqm')::numeric;

  -- the comparables: the ones the broker added and the agency's own similar listings nearby
  select count(*) into added from public.property_comparables c where c.property_id = p.id;
  select count(*), percentile_cont(0.5) within group (order by sqm)
    into pool, pool_median
  from (
    select public.to_eur(c.price, c.currency) / c.area as sqm
    from public.property_comparables c
    where c.property_id = p.id
    union all
    select x.price_eur / x.area
    from public.market_pool(p.id) x
    where (facts ->> 'scope' = 'city' or x.same_neighborhood)
      and x.status in ('active', 'reserved') and x.price_eur > 0
  ) found_comparables
  where sqm > 0;

  if added > 0 and pool >= 3 then
    bench := round(pool_median, 2);
    basis := 'comparables';
  else
    bench := (facts -> 'benchmark' ->> 'sqm')::numeric;
    basis := facts -> 'benchmark' ->> 'basis';
  end if;

  if bench > 0 and own > 0 then
    diff := own / bench - 1;
    stars := case
      when diff <= -0.10 then 5
      when diff <= -0.03 then 4
      when diff < 0.03 then 3
      when diff < 0.10 then 2
      else 1
    end;
  end if;

  return facts || jsonb_build_object(
    'rating', case when stars is not null then jsonb_build_object(
      'stars', stars,
      'diff', round(diff, 4),
      'bench_sqm', bench,
      'basis', basis,
      'added', added,
      'pool', pool,
      'estimate', case when p.area > 0 then jsonb_build_object(
        'low', round(bench * p.area * 0.95, -2),
        'mid', round(bench * p.area, -2),
        'high', round(bench * p.area * 1.05, -2)) end
    ) end
  );
end;
$$;

revoke execute on function public.price_rating(uuid) from public, anon, authenticated;

-- For the client's eyes: the stars only when they're 4 or 5.
create or replace function public.public_rating(target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when (r -> 'rating' ->> 'stars')::int >= 4
    then jsonb_build_object('stars', (r -> 'rating' ->> 'stars')::int) end
  from (select public.price_rating(target_property) as r) x;
$$;

revoke execute on function public.public_rating(uuid) from public, anon, authenticated;

-- The stars of several listings at once (the cards in Properties).
create or replace function public.listing_ratings(ids uuid[])
returns table (property_id uuid, stars int)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, (public.price_rating(p.id) -> 'rating' ->> 'stars')::int
  from public.properties p
  where p.id = any (ids[1:300])
    and p.operation_type in ('sale', 'rent')
    and public.is_org_member(p.organization_id);
$$;

revoke execute on function public.listing_ratings(uuid[]) from public, anon;
grant execute on function public.listing_ratings(uuid[]) to authenticated;

-- The analysis of one listing for the agency's people: the rating, the comparables and the sales around.
create or replace function public.property_analysis(target_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.properties;
  r jsonb;
begin
  select * into p from public.properties where id = target_property;
  if p.id is null or not public.is_org_member(p.organization_id) then
    return null;
  end if;
  r := public.price_rating(p.id);
  if r is null then
    return null;
  end if;

  return r || jsonb_build_object(
    -- what the broker found on the portals
    'added', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'url', c.url, 'source', c.source, 'title', c.title, 'area', c.area, 'floor', c.floor,
        'price_eur', round(public.to_eur(c.price, c.currency), 2),
        'sqm', round(public.to_eur(c.price, c.currency) / c.area, 2)) order by c.created_at)
      from public.property_comparables c where c.property_id = p.id), '[]'::jsonb),
    -- the agency's own similar listings nearby, the closest in size first
    'listings', coalesce((
      select jsonb_agg(row_to_json(l)::jsonb)
      from (
        select c.title, n.name as neighborhood, x.area, c.floor, round(x.price_eur, 2) as price_eur,
          round(x.price_eur / x.area, 2) as sqm, x.status
        from public.market_pool(p.id) x
        join public.properties c on c.id = x.property_id
        left join public.geo_neighborhoods n on n.id = c.neighborhood_id
        where (r ->> 'scope' = 'city' or x.same_neighborhood)
          and x.status in ('active', 'reserved') and x.price_eur > 0
        order by abs(x.area - coalesce(p.area, x.area))
        limit 10
      ) l), '[]'::jsonb),
    -- sold in the last year (the agency's deals and the register)
    'sales', coalesce((
      select jsonb_agg(row_to_json(s)::jsonb)
      from (
        select x.area, round(x.sold_eur, 2) as price_eur, round(x.sold_eur / x.area, 2) as sqm, x.sold_on, x.same_neighborhood
        from public.market_sold(p.id) x
        where x.sold_on >= public.sofia_today() - 365
          and (r -> 'sold' ->> 'scope' = 'city' or x.same_neighborhood)
        order by x.sold_on desc
        limit 10
      ) s), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.property_analysis(uuid) from public, anon;
grant execute on function public.property_analysis(uuid) to authenticated;

-- The link sent to a client and the agency's website: the stars when they're good
create or replace function public.shared_property(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'operation', p.operation_type,
      'status', p.status,
      'price', p.current_price,
      'currency', p.currency,
      'area', p.area,
      'rooms', p.rooms,
      'bedrooms', p.bedrooms,
      'floor', p.floor,
      'total_floors', p.total_floors,
      'construction', p.construction_type,
      'condition', p.condition,
      'furnishing', p.furnishing,
      'heating', p.heating,
      'exposures', p.exposures,
      'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((
        select jsonb_agg(ph.storage_path order by ph.position)
        from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb),
      -- for a listing for sale: the rent the broker expects, or BRIXA's estimate from the agency's market
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end,
      -- the stars against the market, only when the price is good
      'rating', public.public_rating(p.id)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = coalesce(sh.created_by, p.responsible_broker_id)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  )
  from public.property_shares sh
  join public.properties p on p.id = sh.property_id
  where sh.token = share_token and sh.revoked_at is null;
$$;

create or replace function public.site_listing(site text, target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
      'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms, 'bedrooms', p.bedrooms,
      'floor', p.floor, 'total_floors', p.total_floors, 'construction', p.construction_type, 'condition', p.condition,
      'furnishing', p.furnishing, 'heating', p.heating, 'exposures', p.exposures, 'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position) from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb),
      -- for a listing for sale: the rent the broker expects, or BRIXA's estimate from the agency's market
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end,
      -- the stars against the market, only when the price is good
      'rating', public.public_rating(p.id)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = p.responsible_broker_id
    ),
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
  )
  from public.properties p
  join public.organizations o on o.id = p.organization_id
  where o.site_slug = lower(site) and o.site_enabled and p.id = target_property
    and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
    and not p.off_market;
$$;
