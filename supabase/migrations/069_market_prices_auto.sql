-- =====================================================================
-- BRIXA — migration 069: the market's prices keep themselves up to date
--   1. Every Monday Brix reads the portals' price statistics (average €/m²
--      of apartments by neighbourhood, for sale and for rent) for the towns
--      the agency works in, and Market → Prices by area is filled in by
--      itself. A price a person entered stays untouched for 30 days.
--   2. A listing's stars and its estimate count the real sales too: the
--      deals closed nearby in the last year (the register and BRIXA's own),
--      turned back into asking prices with the usual haggling, weigh up to
--      half — the more sales there are, the more they weigh.
-- Run once in Supabase → SQL Editor → New query → Run (after 068).
-- =====================================================================

-- the jobs: a town's prices, for sale or for rent
alter table public.scout_jobs drop constraint if exists scout_jobs_kind_check;
alter table public.scout_jobs add constraint scout_jobs_kind_check check (kind in ('search', 'track', 'prices'));
alter table public.scout_jobs
  add column if not exists settlement_id uuid references public.geo_settlements (id) on delete cascade,
  add column if not exists operation text check (operation is null or operation in ('sale', 'rent'));

-- One town's prices, for sale and for rent: the jobs handed to the app (/api/brix/scout).
create or replace function public.start_price_jobs(target_org uuid, target_settlement uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  op text;
  job record;
  started integer := 0;
  today date := public.sofia_today();
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return 0; end if;
  foreach op in array array['sale', 'rent'] loop
    continue when exists (
      select 1 from public.scout_jobs j
      where j.kind = 'prices' and j.organization_id = target_org and j.settlement_id = target_settlement
        and j.operation = op and j.day = today
    );
    insert into public.scout_jobs (organization_id, kind, settlement_id, operation, day)
    values (target_org, 'prices', target_settlement, op, today)
    returning id, token into job;
    perform net.http_post(
      url := 'https://brixa-yavlena.vercel.app/api/brix/scout',
      body := jsonb_build_object('id', job.id, 'token', job.token),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 150000
    );
    started := started + 1;
  end loop;
  return started;
end;
$$;
revoke execute on function public.start_price_jobs(uuid, uuid) from public, anon, authenticated;

-- Monday morning: the three towns each agency works in most (that have neighbourhoods to price).
create or replace function public.start_price_refresh()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  town record;
  started integer := 0;
begin
  for town in
    select x.organization_id, x.settlement_id
    from (
      select p.organization_id, p.settlement_id,
        row_number() over (partition by p.organization_id order by count(*) desc) as place
      from public.properties p
      where p.settlement_id is not null
        and exists (select 1 from public.geo_neighborhoods n where n.settlement_id = p.settlement_id)
      group by p.organization_id, p.settlement_id
    ) x
    where x.place <= 3
  loop
    started := started + public.start_price_jobs(town.organization_id, town.settlement_id);
  end loop;
  return started;
end;
$$;
revoke execute on function public.start_price_refresh() from public, anon, authenticated;

-- "Refresh now" in Market (the owner or an office manager): today's look for one town.
create or replace function public.refresh_market_prices(target_settlement uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  select m.organization_id into org from public.organization_members m where m.profile_id = auth.uid() order by m.created_at limit 1;
  if org is null or not public.is_org_leader(org) then return 0; end if;
  if not exists (select 1 from public.geo_neighborhoods n where n.settlement_id = target_settlement) then return 0; end if;
  return public.start_price_jobs(org, target_settlement);
end;
$$;
revoke execute on function public.refresh_market_prices(uuid) from public, anon;
grant execute on function public.refresh_market_prices(uuid) to authenticated;

-- The app takes a job with its token: now also a town's prices (its neighbourhoods by name).
create or replace function public.scout_claim(target uuid, job_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job record;
  result jsonb;
begin
  update public.scout_jobs set claimed_at = now()
  where id = target and token = job_token and claimed_at is null and created_at > now() - interval '6 hours'
  returning * into job;
  if not found then return null; end if;

  if job.kind = 'search' then
    select jsonb_build_object(
      'kind', 'search',
      'operation', w.operation,
      'town', s.name,
      'neighborhoods', coalesce((select jsonb_agg(n.name order by n.name) from public.geo_neighborhoods n where n.id = any (w.neighborhood_ids)), '[]'),
      'kinds', coalesce((select jsonb_agg(p.name order by p.sort_order) from public.property_subtypes p where p.id = any (w.subtype_ids)), '[]'),
      'price_max', w.price_max,
      'private_only', w.private_only,
      'known', coalesce((
        select jsonb_agg(k.url) from (
          select l.url from public.market_listings l
          where l.organization_id = w.organization_id
          order by l.last_seen desc limit 150
        ) k
      ), '[]')
    ) into result
    from public.market_watches w
    join public.geo_settlements s on s.id = w.settlement_id
    where w.id = job.watch_id;
  elsif job.kind = 'prices' then
    select jsonb_build_object(
      'kind', 'prices',
      'operation', job.operation,
      'town', s.name,
      'neighborhoods', coalesce((select jsonb_agg(n.name order by n.name) from public.geo_neighborhoods n where n.settlement_id = s.id), '[]')
    ) into result
    from public.geo_settlements s
    where s.id = job.settlement_id;
  else
    select jsonb_build_object(
      'kind', 'track',
      'listings', coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'url', l.url, 'price_eur', l.price_eur)), '[]')
    ) into result
    from public.market_listings l
    where l.id = any (job.listing_ids);
  end if;
  return result;
end;
$$;
revoke execute on function public.scout_claim(uuid, uuid) from public;
grant execute on function public.scout_claim(uuid, uuid) to anon, authenticated;

-- A town's prices, as the app read them from the portals' statistics:
--   {"source": "imot.bg", "town_price": 2150, "prices": [{"neighborhood": "Левски", "price": 2300}]}
-- Each neighbourhood is matched by its name; a price a person entered in the last 30 days stays.
create or replace function public.report_market_prices(job public.scout_jobs, payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  hood uuid;
  amount numeric;
  label text := left('Brix · ' || coalesce(nullif(btrim(payload ->> 'source'), ''), 'порталите'), 120);
  saved integer := 0;
  rows jsonb := coalesce(payload -> 'prices', '[]');
begin
  -- the whole town, as one more row (no neighbourhood)
  if (payload ->> 'town_price') ~ '^[0-9]+(\.[0-9]+)?$' then
    rows := rows || jsonb_build_array(jsonb_build_object('neighborhood', null, 'price', payload ->> 'town_price'));
  end if;

  for item in select * from jsonb_array_elements(rows) limit 200 loop
    amount := case when (item ->> 'price') ~ '^[0-9]+(\.[0-9]+)?$' then (item ->> 'price')::numeric end;
    -- a sane €/m² only (rent: a month)
    continue when amount is null
      or (job.operation = 'sale' and (amount < 200 or amount > 20000))
      or (job.operation = 'rent' and (amount < 1 or amount > 100));
    hood := null;
    if item ->> 'neighborhood' is not null then
      select n.id into hood from public.geo_neighborhoods n
      where n.settlement_id = job.settlement_id and lower(btrim(n.name)) = lower(btrim(item ->> 'neighborhood'))
      limit 1;
      continue when hood is null;
    end if;

    insert into public.market_prices
      (organization_id, operation, settlement_id, neighborhood_id, price_per_sqm, source, as_of, updated_by, updated_at)
    values (job.organization_id, job.operation, job.settlement_id, hood, round(amount, 2), label, public.sofia_today(), null, now())
    on conflict on constraint market_prices_one do update
      set price_per_sqm = excluded.price_per_sqm, source = excluded.source, as_of = excluded.as_of,
          updated_by = null, updated_at = now()
      where public.market_prices.updated_by is null or public.market_prices.updated_at < now() - interval '30 days';
    if found then saved := saved + 1; end if;
  end loop;

  if saved > 0 then
    perform public.refresh_org_stars(job.organization_id);
  end if;
  return saved;
end;
$$;
revoke execute on function public.report_market_prices(public.scout_jobs, jsonb) from public, anon, authenticated;

-- scout_report: the prices job goes to report_market_prices (search and track as in 068)
create or replace function public.scout_report(target uuid, job_token uuid, payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.scout_jobs;
  w record;
  item jsonb;
  link text;
  price numeric;
  listing record;
  counted integer := 0;
begin
  update public.scout_jobs set finished_at = now()
  where id = target and token = job_token and claimed_at is not null and finished_at is null
  returning * into job;
  if not found then return null; end if;

  if job.kind = 'prices' then
    counted := public.report_market_prices(job, payload);
  elsif job.kind = 'search' then
    select * into w from public.market_watches where id = job.watch_id;
    if not found then return 0; end if;
    update public.market_watches set last_run_at = now() where id = w.id;
    for item in select * from jsonb_array_elements(coalesce(payload -> 'listings', '[]')) limit 30 loop
      link := left(btrim(coalesce(item ->> 'url', '')), 600);
      continue when link !~ '^https?://[^ ]+\.[^ ]+';
      price := case when (item ->> 'price_eur') ~ '^[0-9]+(\.[0-9]+)?$' then (item ->> 'price_eur')::numeric end;
      insert into public.market_listings (organization_id, url, portal, title, operation, place, price_eur, area, private, found_by, watch_id)
      values (
        w.organization_id, link, substring(link from '^https?://(?:www\.)?([^/]+)'),
        left(item ->> 'title', 200), w.operation, left(item ->> 'place', 120), price,
        case when (item ->> 'area') ~ '^[0-9]+(\.[0-9]+)?$' and (item ->> 'area')::numeric < 100000 then (item ->> 'area')::numeric end,
        case when item ->> 'private' in ('true', 'false') then (item ->> 'private')::boolean end,
        w.profile_id, w.id
      )
      on conflict (organization_id, url) do update set last_seen = public.sofia_today()
      returning id, (xmax = 0) as fresh into listing;
      if listing.fresh then
        insert into public.market_listing_events (listing_id, kind, price_eur) values (listing.id, 'new', price);
        counted := counted + 1;
      end if;
    end loop;
  else
    for item in select * from jsonb_array_elements(coalesce(payload -> 'listings', '[]')) loop
      select * into listing from public.market_listings
      where id = public.uuid_or_null(item ->> 'id') and id = any (job.listing_ids);
      continue when not found;
      price := case when (item ->> 'price_eur') ~ '^[0-9]+(\.[0-9]+)?$' then (item ->> 'price_eur')::numeric end;
      if item ->> 'status' = 'gone' then
        if listing.status = 'active' then
          update public.market_listings set status = 'gone', checked_at = now() where id = listing.id;
          insert into public.market_listing_events (listing_id, kind, price_eur) values (listing.id, 'gone', listing.price_eur);
          counted := counted + 1;
        end if;
      elsif item ->> 'status' = 'active' then
        if listing.price_eur is not null and price is not null and abs(price - listing.price_eur) >= greatest(1, listing.price_eur * 0.005) then
          insert into public.market_listing_events (listing_id, kind, price_eur, old_price_eur) values (listing.id, 'price', price, listing.price_eur);
          counted := counted + 1;
        end if;
        update public.market_listings
        set price_eur = coalesce(price, price_eur), last_seen = public.sofia_today(), checked_at = now(),
            title = coalesce(title, left(item ->> 'title', 200)),
            area = coalesce(area, case when (item ->> 'area') ~ '^[0-9]+(\.[0-9]+)?$' and (item ->> 'area')::numeric < 100000 then (item ->> 'area')::numeric end),
            place = coalesce(place, left(item ->> 'place', 120)),
            private = coalesce(private, case when item ->> 'private' in ('true', 'false') then (item ->> 'private')::boolean end)
        where id = listing.id;
      else
        update public.market_listings set checked_at = now() where id = listing.id;
      end if;
    end loop;
  end if;

  update public.scout_jobs set found = counted where id = job.id;
  return counted;
end;
$$;
revoke execute on function public.scout_report(uuid, uuid, jsonb) from public;
grant execute on function public.scout_report(uuid, uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- The stars count the real sales: what sold nearby in the last year,
-- turned back into an asking price (÷ (1 − the usual haggling)), weighs
-- 5% a sale, up to half; the rest is what the stars measured before
-- (the comparables, the Market price, else the agency's listings).
-- ---------------------------------------------------------------------
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
  sold_count int;
  sold_sqm numeric;
  haggling numeric;
  sold_ask numeric;
  sold_weight numeric := 0;
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

  -- the real sales (sale listings only: a rent's "sale" is a let, kept apart)
  sold_count := coalesce((facts -> 'sold' ->> 'count')::int, 0);
  sold_sqm := (facts -> 'sold' ->> 'median_sqm')::numeric;
  if p.operation_type = 'sale' and sold_count >= 2 and sold_sqm > 0 then
    haggling := coalesce((facts ->> 'discount')::numeric, 0.05);
    sold_ask := sold_sqm / (1 - least(greatest(haggling, 0), 0.3));
    if bench > 0 then
      sold_weight := least(0.5, 0.05 * sold_count);
      bench := round(bench * (1 - sold_weight) + sold_ask * sold_weight, 2);
    elsif sold_count >= 3 then
      sold_weight := 1;
      bench := round(sold_ask, 2);
      basis := 'sold';
    end if;
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
      -- the sales counted, and how much they weighed
      'sold', case when sold_weight > 0 then sold_count else 0 end,
      'sold_weight', round(sold_weight, 2),
      'estimate', case when p.area > 0 then jsonb_build_object(
        'low', round(bench * p.area * 0.95, -2),
        'mid', round(bench * p.area, -2),
        'high', round(bench * p.area * 1.05, -2)) end
    ) end
  );
end;
$$;
revoke execute on function public.price_rating(uuid) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Mondays, 06:10 Sofia in summer (05:10 in winter)
    perform cron.schedule('brixa-market-prices', '10 3 * * 1', 'select public.start_price_refresh()');
  end if;
end;
$$;

-- every listing's stars at once, with the sales in
select public.refresh_all_stars();
