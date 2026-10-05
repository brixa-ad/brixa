-- =====================================================================
-- BRIXA — migration 041: what a listing for sale would rent for, and its yield
--   • a broker may write the monthly rent they expect for a listing for sale
--   • otherwise BRIXA estimates it from the agency's own market: the rent per m²
--     of the same type in the neighbourhood, then in the town (from the rent listings
--     and the rented deals), or the averages typed in by hand in Market
--   • the yield (12 and 10 months) shows in the listing, in the link sent to a
--     client and on the agency's website
-- Run once in Supabase → SQL Editor → New query → Run (after 040).
-- =====================================================================

alter table public.properties
  add column expected_rent numeric(12, 2) check (expected_rent is null or (expected_rent > 0 and expected_rent < 1000000));

-- The monthly rent in euro a listing would bring, from the agency's own market (null: not enough to go on).
-- From the most exact place with at least 3 examples: the same type in the neighbourhood; the
-- neighbourhood's price typed in by hand; the same type in the town — and for homes also every home
-- in the neighbourhood, the town's price typed in by hand, every home in the town.
create or replace function public.rent_estimate(target_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
  homes boolean;
  last_day date;
  best_rank int;
  best_sqm numeric;
  best_samples int;
begin
  select pr.organization_id, pr.settlement_id, pr.neighborhood_id, pr.subtype_id, pr.area, c.code as category
  into p
  from public.properties pr
  left join public.property_subtypes st on st.id = pr.subtype_id
  left join public.property_categories c on c.id = st.category_id
  where pr.id = target_property;
  if not found or p.area is null or p.area <= 0 or p.settlement_id is null then
    return null;
  end if;
  homes := p.category = 'residential';

  select max(day) into last_day from public.market_daily where organization_id = p.organization_id and operation = 'rent';

  select rank, per_sqm, samples into best_rank, best_sqm, best_samples
  from (
    select
      case
        when m.neighborhood_id is not null and m.subtype_id is not null then 1
        when m.subtype_id is not null then 3
        when m.neighborhood_id is not null then 4
        else 6
      end as rank,
      -- rented deals when there are a couple, else what the listings ask
      case when m.sold_count >= 2 then m.sold_avg else coalesce(m.listing_median, m.listing_avg) end as per_sqm,
      m.listings + m.sold_count as samples
    from public.market_daily m
    where m.organization_id = p.organization_id and m.operation = 'rent' and m.day = last_day
      and m.settlement_id = p.settlement_id
      and (m.neighborhood_id = p.neighborhood_id or m.neighborhood_id is null)
      and (m.subtype_id = p.subtype_id or (homes and m.subtype_id is null))
      and m.listings + m.sold_count >= 3
    union all
    select case when mp.neighborhood_id is null then 5 else 2 end, mp.price_per_sqm, null
    from public.market_prices mp
    where homes and mp.organization_id = p.organization_id and mp.operation = 'rent'
      and mp.settlement_id = p.settlement_id
      and (mp.neighborhood_id = p.neighborhood_id or mp.neighborhood_id is null)
  ) found_prices
  where per_sqm > 0
  order by rank
  limit 1;

  if best_sqm is null then
    return null;
  end if;

  return jsonb_build_object(
    'per_sqm', round(best_sqm, 2),
    -- to the nearest 10 €
    'rent', greatest(10, round(best_sqm * p.area / 10) * 10),
    'basis', case best_rank
      when 1 then 'hood_type' when 2 then 'manual_hood' when 3 then 'town_type'
      when 4 then 'hood' when 5 then 'manual_town' else 'town' end,
    'samples', best_samples
  );
end;
$$;

revoke execute on function public.rent_estimate(uuid) from public, anon, authenticated;

-- For the agency's own people: the estimate for one of its listings.
create or replace function public.property_rent_estimate(target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.rent_estimate(p.id)
  from public.properties p
  where p.id = target_property and public.is_org_member(p.organization_id);
$$;

revoke execute on function public.property_rent_estimate(uuid) from public, anon;
grant execute on function public.property_rent_estimate(uuid) to authenticated;

-- The link sent to a client and the agency's website: the rent and its estimate too
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
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end
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
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end
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
