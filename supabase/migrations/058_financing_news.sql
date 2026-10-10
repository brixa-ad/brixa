-- =====================================================================
-- BRIXA — migration 058: a buyer's financing, and market news for clients
--   • a buyer's dossier: the loan (approved / applying / none), own funds, the amount from
--     the bank, "we took them to the bank" and which bank, and what the bank pays us for
--     them (it counts as income the month it comes)
--   • the average interest rate on new mortgages in Bulgaria, every month by itself: the
--     BNB's statistics, as the ECB's data service publishes them
--   • news for clients, written by BRIXA and sent by the broker in one tap from the
--     follow-up (BRIXA never sends anything itself): the mortgage rates fell; their
--     neighbourhood got pricier; and a short monthly note for the clients the broker chose
-- Run once in Supabase → SQL Editor → New query → Run (after 057).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A buyer's financing
-- ---------------------------------------------------------------------
create table public.client_financing (
  client_id uuid primary key references public.clients (id) on delete cascade,
  -- null: not known yet
  loan text check (loan in ('approved', 'applying', 'none')),
  own_funds numeric(14, 2) check (own_funds is null or own_funds >= 0),
  bank_amount numeric(14, 2) check (bank_amount is null or bank_amount >= 0),
  -- we took them to the bank
  bank_referred boolean not null default false,
  bank_name text check (bank_name is null or char_length(bank_name) <= 80),
  -- what the bank pays us for them, and the day it came
  bank_fee numeric(14, 2) check (bank_fee is null or bank_fee >= 0),
  bank_fee_received_on date,
  updated_at timestamptz not null default now()
);

create trigger client_financing_touch_updated_at
  before update on public.client_financing
  for each row execute function public.touch_updated_at();

alter table public.client_financing enable row level security;

create policy "client financing: read" on public.client_financing
  for select to authenticated using (public.can_view_client(client_id));
create policy "client financing: insert" on public.client_financing
  for insert to authenticated with check (public.can_view_client(client_id));
create policy "client financing: update" on public.client_financing
  for update to authenticated
  using (public.can_view_client(client_id))
  with check (public.can_view_client(client_id));
create policy "client financing: delete" on public.client_financing
  for delete to authenticated using (public.can_view_client(client_id));

-- the clients who get a short market note every month (the broker chooses them)
alter table public.clients add column monthly_news boolean not null default false;

-- ---------------------------------------------------------------------
-- The average interest rate on new mortgages (BNB, through the ECB's data service)
-- ---------------------------------------------------------------------
create table public.mortgage_rates (
  -- the first day of the month
  month date primary key check (extract(day from month) = 1),
  -- % a year: new loans to households for house purchase, in euro
  rate numeric(5, 2) not null check (rate > 0 and rate < 30),
  fetched_at timestamptz not null default now()
);

alter table public.mortgage_rates enable row level security;

-- public statistics
create policy "mortgage rates: read" on public.mortgage_rates
  for select to anon, authenticated using (true);

-- the questions asked to the data service (pg_net brings the answer a moment later)
create table public.mortgage_rate_fetches (
  request_id bigint primary key,
  asked_at timestamptz not null default now(),
  status int,
  saved_at timestamptz
);

alter table public.mortgage_rate_fetches enable row level security;

-- The data service's answer (CSV: a header line, then one line a month) into the table.
create or replace function public.read_mortgage_rates(content text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  lines text[] := string_to_array(replace(coalesce(content, ''), E'\r', ''), E'\n');
  head text[] := string_to_array(lines[1], ',');
  at_month int := array_position(head, 'TIME_PERIOD');
  at_value int := array_position(head, 'OBS_VALUE');
  cells text[];
  i int;
  saved int := 0;
begin
  if at_month is null or at_value is null then
    return 0;
  end if;
  for i in 2 .. coalesce(array_length(lines, 1), 1) loop
    cells := string_to_array(lines[i], ',');
    if cells[at_month] ~ '^\d{4}-\d{2}$' and cells[at_value] ~ '^\d+(\.\d+)?$'
       and cells[at_value]::numeric > 0 and cells[at_value]::numeric < 30 then
      insert into public.mortgage_rates (month, rate)
      values ((cells[at_month] || '-01')::date, round(cells[at_value]::numeric, 2))
      on conflict (month) do update
        set rate = excluded.rate, fetched_at = now()
        where public.mortgage_rates.rate is distinct from excluded.rate;
      saved := saved + 1;
    end if;
  end loop;
  return saved;
end;
$$;

-- The answers that came back.
create or replace function public.save_mortgage_rates()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  answer record;
  saved int := 0;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return 0;
  end if;
  for answer in
    select f.request_id, r.status_code, r.content
    from public.mortgage_rate_fetches f
    join net._http_response r on r.id = f.request_id
    where f.saved_at is null
  loop
    if answer.status_code = 200 then
      saved := saved + public.read_mortgage_rates(answer.content);
    end if;
    update public.mortgage_rate_fetches
    set saved_at = now(), status = answer.status_code
    where request_id = answer.request_id;
  end loop;
  -- pg_net keeps its answers for six hours: older questions never get one
  delete from public.mortgage_rate_fetches
  where (saved_at is null and asked_at < now() - interval '1 day') or saved_at < now() - interval '60 days';
  return saved;
end;
$$;

-- Ask the data service for the last two years (the answer is read by save_mortgage_rates).
create or replace function public.fetch_mortgage_rates()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  request bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return null;
  end if;
  request := net.http_get(
    url := 'https://data-api.ecb.europa.eu/service/data/MIR/M.BG.B.A2C.A.R.A.2250.EUR.N?lastNObservations=24&format=csvdata&detail=dataonly',
    timeout_milliseconds := 30000
  );
  insert into public.mortgage_rate_fetches (request_id) values (request);
  return request;
end;
$$;

-- ---------------------------------------------------------------------
-- The market's history: the reference prices the agency keeps, every earlier value
-- ---------------------------------------------------------------------
create table public.market_price_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  operation text not null check (operation in ('sale', 'rent')),
  settlement_id uuid not null references public.geo_settlements (id) on delete cascade,
  neighborhood_id uuid references public.geo_neighborhoods (id) on delete cascade,
  price_per_sqm numeric(10, 2) not null,
  as_of date not null,
  replaced_at timestamptz not null default now()
);

create index market_price_history_place_idx
  on public.market_price_history (organization_id, settlement_id, neighborhood_id, as_of desc);

alter table public.market_price_history enable row level security;

create policy "market price history: read" on public.market_price_history
  for select to authenticated using (public.is_org_member(organization_id));

create or replace function public.keep_market_price_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_per_sqm is distinct from old.price_per_sqm then
    insert into public.market_price_history (organization_id, operation, settlement_id, neighborhood_id, price_per_sqm, as_of)
    values (old.organization_id, old.operation, old.settlement_id, old.neighborhood_id, old.price_per_sqm, old.as_of);
  end if;
  return new;
end;
$$;

create trigger market_prices_keep_history
  after update on public.market_prices
  for each row execute function public.keep_market_price_history();

-- How a neighbourhood's price per m² moved (sales): the reference price the agency keeps
-- against its value a month or more ago; else BRIXA's own daily numbers (the median of the
-- listings, at least six of them, a month to four months apart).
create or replace function public.neighborhood_trend(target_org uuid, target_settlement uuid, target_neighborhood uuid)
returns table (now_sqm numeric, then_sqm numeric, since date, listings int, source text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cur record;
  old record;
begin
  select m.price_per_sqm, m.as_of into cur
  from public.market_prices m
  where m.organization_id = target_org and m.operation = 'sale'
    and m.settlement_id = target_settlement and m.neighborhood_id is not distinct from target_neighborhood;
  if found then
    select h.price_per_sqm, h.as_of into old
    from public.market_price_history h
    where h.organization_id = target_org and h.operation = 'sale'
      and h.settlement_id = target_settlement and h.neighborhood_id is not distinct from target_neighborhood
      and h.as_of <= cur.as_of - 25 and h.as_of >= cur.as_of - 200
    order by h.as_of desc
    limit 1;
    if found then
      return query select cur.price_per_sqm, old.price_per_sqm, old.as_of, null::int, 'reference'::text;
      return;
    end if;
  end if;

  select d.day, d.listing_median, d.listings into cur
  from public.market_daily d
  where d.organization_id = target_org and d.operation = 'sale' and d.settlement_id = target_settlement
    and d.neighborhood_id is not distinct from target_neighborhood and d.subtype_id is null
    and d.listings >= 6 and d.listing_median is not null
  order by d.day desc
  limit 1;
  if not found or cur.day < public.sofia_today() - 7 then
    return;
  end if;
  select d.day, d.listing_median into old
  from public.market_daily d
  where d.organization_id = target_org and d.operation = 'sale' and d.settlement_id = target_settlement
    and d.neighborhood_id is not distinct from target_neighborhood and d.subtype_id is null
    and d.listings >= 6 and d.listing_median is not null
    and d.day <= cur.day - 28 and d.day >= cur.day - 120
  order by d.day
  limit 1;
  if found then
    return query select cur.listing_median, old.listing_median, old.day, cur.listings, 'listings'::text;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- News for clients: what BRIXA wrote, waiting in the broker's follow-up
-- ---------------------------------------------------------------------
create table public.client_news (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null check (kind in ('rates', 'prices', 'monthly')),
  -- the numbers it tells (the app writes the text, in the broker's language)
  data jsonb not null default '{}',
  created_on date not null default public.sofia_today(),
  sent_at timestamptz,
  skipped_at timestamptz,
  constraint client_news_once unique (client_id, kind, created_on)
);

create index client_news_org_idx on public.client_news (organization_id, created_on desc);
create index client_news_client_idx on public.client_news (client_id, created_on desc);

alter table public.client_news enable row level security;

create policy "client news: read" on public.client_news
  for select to authenticated using (public.can_view_client(client_id));

-- what started them, once each
create table public.market_news_events (
  key text primary key,
  created_at timestamptz not null default now()
);

alter table public.market_news_events enable row level security;

-- Sent (in one tap) or left out.
create or replace function public.settle_client_news(target uuid, sent boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_news n
  set sent_at = case when sent then now() end,
      skipped_at = case when sent then null else now() end
  where n.id = target and n.sent_at is null and n.skipped_at is null
    and public.can_view_client(n.client_id);
  return found;
end;
$$;

-- One notification per broker for the day's news of a kind.
create or replace function public.tell_market_news(today date, news_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  person record;
begin
  for person in
    select c.organization_id, c.responsible_broker_id as broker, count(*)::int as n,
      case when count(distinct n.data ->> 'area') = 1 then min(n.data ->> 'area') end as area
    from public.client_news n
    join public.clients c on c.id = n.client_id
    where n.kind = news_kind and n.created_on = today and n.sent_at is null and n.skipped_at is null
      and c.responsible_broker_id is not null
    group by c.organization_id, c.responsible_broker_id
  loop
    if not exists (
      select 1 from public.notifications x
      where x.recipient_id = person.broker and x.type = 'market_news' and x.data ->> 'kind' = news_kind
        and x.created_at > now() - interval '20 hours'
    ) then
      perform public.notify(
        person.organization_id, person.broker, null, 'market_news',
        jsonb_build_object('kind', news_kind, 'count', person.n, 'title', person.area),
        '/follow-up?view=news'
      );
    end if;
  end loop;
end;
$$;

-- The mortgage rates fell (by 0.10 points or more from the highest since the last such news,
-- or in the year before): the buyers who search for a home and don't pay in cash.
create or replace function public.make_rate_news(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  latest record;
  peak record;
  last_news date;
  made int := 0;
begin
  select m.month, m.rate into latest from public.mortgage_rates m order by m.month desc limit 1;
  -- nothing new from the BNB for months: no news
  if not found or latest.month < (date_trunc('month', today) - interval '4 months')::date then
    return 0;
  end if;
  if exists (select 1 from public.market_news_events where key = 'rates:' || to_char(latest.month, 'YYYY-MM')) then
    return 0;
  end if;
  select max(to_date(substr(e.key, 7), 'YYYY-MM')) into last_news
  from public.market_news_events e where e.key like 'rates:%';
  select m.month, m.rate into peak
  from public.mortgage_rates m
  where m.month < latest.month
    and m.month >= coalesce(last_news, (latest.month - interval '12 months')::date)
  order by m.rate desc, m.month desc
  limit 1;
  if not found or latest.rate > peak.rate - 0.10 then
    return 0;
  end if;

  insert into public.market_news_events (key) values ('rates:' || to_char(latest.month, 'YYYY-MM'));
  insert into public.client_news (organization_id, client_id, kind, data)
  select c.organization_id, c.id, 'rates',
    jsonb_build_object('from', peak.rate, 'fromMonth', to_char(peak.month, 'YYYY-MM'),
                       'to', latest.rate, 'toMonth', to_char(latest.month, 'YYYY-MM'))
  from public.clients c
  join public.client_searches s on s.client_id = c.id and s.operation = 'sale'
  left join public.client_financing f on f.client_id = c.id
  where c.responsible_broker_id is not null
    and c.stage not in ('deal', 'lost')
    and (c.phone is not null or c.email is not null)
    and c.types && array['buyer', 'investor']
    and f.loan is distinct from 'none'
    -- one piece of news at a time
    and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 14)
  on conflict do nothing;
  get diagnostics made = row_count;
  if made > 0 then
    perform public.tell_market_news(today, 'rates');
  end if;
  return made;
end;
$$;

-- A neighbourhood got pricier (3% or more): the clients who own a home there (with a listing,
-- an offer, or bought through us) and the buyers who search there. Once in two months a place.
create or replace function public.make_price_news(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  place record;
  trend record;
  change numeric;
  n int;
  made int := 0;
begin
  for place in
    with spots as (
      select c.organization_id, o.settlement_id, o.neighborhood_id
      from public.client_offers o join public.clients c on c.id = o.client_id
      where o.operation = 'sale' and o.neighborhood_id is not null
      union
      select p.organization_id, p.settlement_id, p.neighborhood_id
      from public.properties p
      where p.owner_client_id is not null and p.neighborhood_id is not null and p.status in ('active', 'reserved', 'withdrawn')
      union
      select d.organization_id, p.settlement_id, p.neighborhood_id
      from public.deals d join public.properties p on p.id = d.property_id
      where d.status = 'won' and d.kind = 'sale' and d.client_id is not null and p.neighborhood_id is not null
      union
      select c.organization_id, nb.settlement_id, nb.id
      from public.client_searches s
      join public.clients c on c.id = s.client_id
      join public.geo_neighborhoods nb on nb.id = any (s.neighborhood_ids)
      where s.operation = 'sale'
    )
    select distinct s.organization_id, s.settlement_id, s.neighborhood_id, nb.name as hood, st.name as town
    from spots s
    join public.geo_neighborhoods nb on nb.id = s.neighborhood_id
    join public.geo_settlements st on st.id = s.settlement_id
  loop
    if exists (
      select 1 from public.market_news_events e
      where e.key like 'prices:' || place.organization_id || ':' || place.neighborhood_id || ':%'
        and e.created_at > now() - interval '60 days'
    ) then
      continue;
    end if;
    select * into trend from public.neighborhood_trend(place.organization_id, place.settlement_id, place.neighborhood_id);
    if not found or trend.then_sqm is null or trend.then_sqm <= 0 then
      continue;
    end if;
    change := round((trend.now_sqm / trend.then_sqm - 1) * 100, 1);
    if change < 3 then
      continue;
    end if;

    insert into public.market_news_events (key)
    values ('prices:' || place.organization_id || ':' || place.neighborhood_id || ':' || today);
    insert into public.client_news (organization_id, client_id, kind, data)
    select distinct on (who.client_id) place.organization_id, who.client_id, 'prices',
      jsonb_build_object('role', who.role, 'area', place.hood, 'town', place.town, 'change', change,
                         'sqm', round(trend.now_sqm), 'since', trend.since, 'source', trend.source)
    from (
      select o.client_id, 'owner' as role, 1 as rank
      from public.client_offers o
      where o.neighborhood_id = place.neighborhood_id and o.operation = 'sale'
      union all
      select p.owner_client_id, 'owner', 1
      from public.properties p
      where p.organization_id = place.organization_id and p.neighborhood_id = place.neighborhood_id
        and p.owner_client_id is not null and p.status in ('active', 'reserved', 'withdrawn')
      union all
      select d.client_id, 'owner', 1
      from public.deals d join public.properties p on p.id = d.property_id
      where d.organization_id = place.organization_id and d.status = 'won' and d.kind = 'sale'
        and d.client_id is not null and p.neighborhood_id = place.neighborhood_id
      union all
      select s.client_id, 'buyer', 2
      from public.client_searches s
      where s.operation = 'sale' and place.neighborhood_id = any (s.neighborhood_ids)
    ) who
    join public.clients c on c.id = who.client_id
    where c.organization_id = place.organization_id
      and c.responsible_broker_id is not null
      and c.stage <> 'lost'
      and (who.role = 'owner' or c.stage <> 'deal')
      and (c.phone is not null or c.email is not null)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 14)
    order by who.client_id, who.rank
    on conflict do nothing;
    get diagnostics n = row_count;
    made := made + n;
  end loop;
  if made > 0 then
    perform public.tell_market_news(today, 'prices');
  end if;
  return made;
end;
$$;

-- The monthly note, for the clients the broker chose: every four weeks, the market where the
-- client owns or searches (BRIXA's numbers, or the agency's reference price) and the rates.
create or replace function public.make_monthly_news(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  client record;
  place record;
  listings_n int;
  trend record;
  rate_now record;
  rate_before numeric;
  sqm numeric;
  change numeric;
  made int := 0;
begin
  select m.month, m.rate into rate_now from public.mortgage_rates m order by m.month desc limit 1;
  if found then
    select m.rate into rate_before from public.mortgage_rates m
    where m.month = (rate_now.month - interval '3 months')::date;
  end if;

  for client in
    select c.id, c.organization_id
    from public.clients c
    where c.monthly_news and c.responsible_broker_id is not null and c.stage <> 'lost'
      and (c.phone is not null or c.email is not null)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.kind = 'monthly' and x.created_on > today - 28)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 7)
  loop
    -- where: a home they own (a listing, an offer, one bought through us), else where they search
    select x.settlement_id, x.neighborhood_id into place
    from (
      select p.settlement_id, p.neighborhood_id, 1 as rank
      from public.properties p
      where p.owner_client_id = client.id and p.settlement_id is not null and p.status in ('active', 'reserved', 'withdrawn')
      union all
      select o.settlement_id, o.neighborhood_id, 2 from public.client_offers o where o.client_id = client.id and o.settlement_id is not null
      union all
      select p.settlement_id, p.neighborhood_id, 3
      from public.deals d join public.properties p on p.id = d.property_id
      where d.client_id = client.id and d.status = 'won' and d.kind = 'sale' and p.settlement_id is not null
      union all
      select nb.settlement_id, nb.id, 4
      from public.client_searches s join public.geo_neighborhoods nb on nb.id = s.neighborhood_ids[1]
      where s.client_id = client.id
      union all
      select s.settlement_ids[1], null, 5
      from public.client_searches s
      where s.client_id = client.id and coalesce(array_length(s.settlement_ids, 1), 0) > 0
    ) x
    order by x.rank, x.neighborhood_id nulls last
    limit 1;

    sqm := null;
    change := null;
    listings_n := null;
    if place.settlement_id is not null then
      select d.listing_median, d.listings into sqm, listings_n
      from public.market_daily d
      where d.organization_id = client.organization_id and d.operation = 'sale'
        and d.settlement_id = place.settlement_id and d.neighborhood_id is not distinct from place.neighborhood_id
        and d.subtype_id is null and d.listings >= 3 and d.listing_median is not null
        and d.day >= today - 7
      order by d.day desc
      limit 1;
      if sqm is null then
        select m.price_per_sqm into sqm
        from public.market_prices m
        where m.organization_id = client.organization_id and m.operation = 'sale'
          and m.settlement_id = place.settlement_id and m.neighborhood_id is not distinct from place.neighborhood_id;
      end if;
      select * into trend from public.neighborhood_trend(client.organization_id, place.settlement_id, place.neighborhood_id);
      if found and trend.then_sqm > 0 then
        change := round((trend.now_sqm / trend.then_sqm - 1) * 100, 1);
      end if;
    end if;

    -- nothing to tell
    if sqm is null and rate_now.rate is null then
      continue;
    end if;

    insert into public.client_news (organization_id, client_id, kind, data)
    values (
      client.organization_id, client.id, 'monthly',
      jsonb_strip_nulls(jsonb_build_object(
        'area', case when sqm is not null then coalesce(
          (select nb.name from public.geo_neighborhoods nb where nb.id = place.neighborhood_id),
          (select st.name from public.geo_settlements st where st.id = place.settlement_id)) end,
        'sqm', round(sqm),
        'listings', listings_n,
        'change', change,
        'rate', rate_now.rate,
        'rateMonth', to_char(rate_now.month, 'YYYY-MM'),
        'rateBefore', rate_before
      ))
    )
    on conflict do nothing;
    if found then
      made := made + 1;
    end if;
  end loop;
  if made > 0 then
    perform public.tell_market_news(today, 'monthly');
  end if;
  return made;
end;
$$;

-- Every morning: the day's news.
create or replace function public.make_market_news()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.sofia_today();
begin
  return public.make_rate_news(today) + public.make_price_news(today) + public.make_monthly_news(today);
end;
$$;

revoke execute on function public.read_mortgage_rates(text) from public, anon, authenticated;
revoke execute on function public.save_mortgage_rates() from public, anon, authenticated;
revoke execute on function public.fetch_mortgage_rates() from public, anon, authenticated;
revoke execute on function public.keep_market_price_history() from public, anon, authenticated;
revoke execute on function public.neighborhood_trend(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.tell_market_news(date, text) from public, anon, authenticated;
revoke execute on function public.make_rate_news(date) from public, anon, authenticated;
revoke execute on function public.make_price_news(date) from public, anon, authenticated;
revoke execute on function public.make_monthly_news(date) from public, anon, authenticated;
revoke execute on function public.make_market_news() from public, anon, authenticated;
revoke execute on function public.settle_client_news(uuid, boolean) from public, anon;
grant execute on function public.settle_client_news(uuid, boolean) to authenticated;

-- ask every morning at 7:00 (Sofia), read the answers every hour, and the news at 8:30
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-rates-ask', '0 4 * * *', 'select public.fetch_mortgage_rates()');
    perform cron.schedule('brixa-rates-read', '5 * * * *', 'select public.save_mortgage_rates()');
    perform cron.schedule('brixa-market-news', '30 5 * * *', 'select public.make_market_news()');
  end if;
end;
$$;

-- the rates now (their answer is read within the hour)
select public.fetch_mortgage_rates();
