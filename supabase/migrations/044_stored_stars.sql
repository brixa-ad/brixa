-- =====================================================================
-- BRIXA — migration 044: the stars kept on the listing (a faster Properties page)
--   • each listing on the market keeps its stars, worked out again when its price,
--     size, place or status changes, when a comparable is added or removed, when the
--     agency's prices in Market are saved, and every night
--   • the cards in Properties read them instead of working the market out each time
-- Run once in Supabase → SQL Editor → New query → Run (after 043).
-- =====================================================================

alter table public.properties add column market_stars smallint check (market_stars between 1 and 5);

-- the stars changing is not the listing being changed: "updated" stays as it was
create or replace function public.touch_property_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'market_stars' - 'updated_at') is distinct from (to_jsonb(old) - 'market_stars' - 'updated_at') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists properties_touch_updated_at on public.properties;
create trigger properties_touch_updated_at
  before update on public.properties
  for each row execute function public.touch_property_updated_at();

-- One listing's stars again (none when it isn't on the market).
create or replace function public.refresh_listing_stars(target_property uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stars smallint;
begin
  if exists (
    select 1 from public.properties p
    where p.id = target_property and p.operation_type in ('sale', 'rent') and p.status in ('active', 'reserved')
  ) then
    stars := (public.price_rating(target_property) -> 'rating' ->> 'stars')::smallint;
  end if;
  update public.properties set market_stars = stars
  where id = target_property and market_stars is distinct from stars;
end;
$$;

-- Every listing of an agency (after its prices in Market change, and at night).
create or replace function public.refresh_org_stars(target_org uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  n int := 0;
begin
  for p in
    select id from public.properties
    where organization_id = target_org and (market_stars is not null or (operation_type in ('sale', 'rent') and status in ('active', 'reserved')))
  loop
    perform public.refresh_listing_stars(p.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.refresh_all_stars()
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
    n := n + public.refresh_org_stars(o.id);
  end loop;
  return n;
end;
$$;

revoke execute on function public.refresh_listing_stars(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_org_stars(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_all_stars() from public, anon, authenticated;

-- when what the stars rest on changes
create or replace function public.stars_on_property_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_listing_stars(new.id);
  return null;
end;
$$;

create trigger properties_stars_on_insert
  after insert on public.properties
  for each row execute function public.stars_on_property_change();
create trigger properties_stars_on_change
  after update of current_price, currency, area, status, operation_type, subtype_id, settlement_id, neighborhood_id on public.properties
  for each row execute function public.stars_on_property_change();

create or replace function public.stars_on_comparable_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_listing_stars(coalesce(new.property_id, old.property_id));
  return null;
end;
$$;

create trigger property_comparables_stars
  after insert or update or delete on public.property_comparables
  for each row execute function public.stars_on_comparable_change();

-- the cards: the kept stars (no working out)
create or replace function public.listing_ratings(ids uuid[])
returns table (property_id uuid, stars int)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.market_stars::int
  from public.properties p
  where p.id = any (ids[1:300])
    and public.is_org_member(p.organization_id);
$$;

-- saving the prices in Market: the stars follow
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
  if not public.is_org_leader(target_org) then
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
  -- the agency's listings get their stars against the new prices
  perform public.refresh_org_stars(target_org);
  return saved;
end;
$$;

-- every night after the market's numbers (Sofia 6:45)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-stars', '45 3 * * *', 'select public.refresh_all_stars()');
  end if;
end;
$$;

-- the first time, now
select public.refresh_all_stars();
