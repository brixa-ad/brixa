-- =====================================================================
-- BRIXA — migration 068: Brix watches the market online
--   Each broker says what to watch (town, neighbourhoods, kinds of
--   property, top price, private sellers only). Every morning Brix
--   searches the portals for new listings of that kind, and checks the
--   listings the brokers follow: the price up or down, or gone from the
--   market. At 08:00 each broker hears what's new.
--   Only the listing is kept (its link, price, area, place, whether a
--   private person sells) — never the seller's phone or name.
-- Run once in Supabase → SQL Editor → New query → Run (after 067).
-- =====================================================================

-- what a broker watches
create table if not exists public.market_watches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  operation text not null default 'sale' check (operation in ('sale', 'rent')),
  settlement_id uuid not null references public.geo_settlements (id) on delete cascade,
  neighborhood_ids uuid[] not null default '{}',
  subtype_ids uuid[] not null default '{}',
  price_max numeric(12, 2) check (price_max is null or price_max > 0),
  private_only boolean not null default false,
  active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists market_watches_profile_idx on public.market_watches (profile_id);

-- the listings Brix found online (one per link in the agency)
create table if not exists public.market_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  url text not null check (url ~ '^https?://' and char_length(url) <= 600),
  portal text,
  title text check (title is null or char_length(title) <= 200),
  operation text check (operation is null or operation in ('sale', 'rent')),
  place text check (place is null or char_length(place) <= 120),
  price_eur numeric(14, 2),
  area numeric(10, 2),
  private boolean,
  status text not null default 'active' check (status in ('active', 'gone')),
  found_by uuid references public.profiles (id) on delete set null,
  watch_id uuid references public.market_watches (id) on delete set null,
  first_seen date not null default public.sofia_today(),
  last_seen date not null default public.sofia_today(),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint market_listings_one unique (organization_id, url)
);
create index if not exists market_listings_org_seen_idx on public.market_listings (organization_id, first_seen desc);

-- what happened to a listing: found, price changed, gone, back
create table if not exists public.market_listing_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.market_listings (id) on delete cascade,
  day date not null default public.sofia_today(),
  kind text not null check (kind in ('new', 'price', 'gone', 'back')),
  price_eur numeric(14, 2),
  old_price_eur numeric(14, 2),
  created_at timestamptz not null default now()
);
create index if not exists market_listing_events_listing_idx on public.market_listing_events (listing_id, created_at desc);

-- who follows which listing
create table if not exists public.market_tracks (
  listing_id uuid not null references public.market_listings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, profile_id)
);
create index if not exists market_tracks_profile_idx on public.market_tracks (profile_id);

-- each morning's work, one job per watch (and per handful of followed listings); its token is the proof
create table if not exists public.scout_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('search', 'track')),
  watch_id uuid references public.market_watches (id) on delete cascade,
  listing_ids uuid[] not null default '{}',
  token uuid not null default gen_random_uuid(),
  day date not null default public.sofia_today(),
  claimed_at timestamptz,
  finished_at timestamptz,
  found int,
  created_at timestamptz not null default now()
);
create index if not exists scout_jobs_day_idx on public.scout_jobs (day);

-- the 08:00 word, once a day
create table if not exists public.scout_digests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (profile_id, day)
);

alter table public.market_watches enable row level security;
alter table public.market_listings enable row level security;
alter table public.market_listing_events enable row level security;
alter table public.market_tracks enable row level security;
alter table public.scout_jobs enable row level security;
alter table public.scout_digests enable row level security;

-- a broker keeps their own watches
drop policy if exists "market watches: own" on public.market_watches;
create policy "market watches: own" on public.market_watches
  for all to authenticated
  using (profile_id = auth.uid() and public.is_org_member(organization_id))
  with check (profile_id = auth.uid() and public.is_org_member(organization_id));

-- what Brix found, the whole agency sees (the market is the same for everyone)
drop policy if exists "market listings: read" on public.market_listings;
create policy "market listings: read" on public.market_listings
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists "market listing events: read" on public.market_listing_events;
create policy "market listing events: read" on public.market_listing_events
  for select to authenticated
  using (exists (select 1 from public.market_listings l where l.id = listing_id and public.is_org_member(l.organization_id)));

-- following: one's own
drop policy if exists "market tracks: own" on public.market_tracks;
create policy "market tracks: own" on public.market_tracks
  for all to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (select 1 from public.market_listings l where l.id = listing_id and public.is_org_member(l.organization_id))
  );

grant select, insert, update, delete on public.market_watches to authenticated;
grant select on public.market_listings, public.market_listing_events to authenticated;
grant select, insert, delete on public.market_tracks to authenticated;
revoke all on public.scout_jobs, public.scout_digests from anon, authenticated;

-- A broker follows a listing by its link (one they found themselves, or one Brix found).
create or replace function public.follow_market_listing(link text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  clean text := left(btrim(coalesce(link, '')), 600);
  found_id uuid;
begin
  select organization_id into org from public.organization_members where profile_id = auth.uid() order by created_at limit 1;
  if org is null or clean !~ '^https?://[^ ]+\.[^ ]+' then return null; end if;
  insert into public.market_listings (organization_id, url, portal, found_by)
  values (org, clean, substring(clean from '^https?://(?:www\.)?([^/]+)'), auth.uid())
  on conflict (organization_id, url) do update set url = excluded.url
  returning id into found_id;
  insert into public.market_tracks (listing_id, profile_id) values (found_id, auth.uid()) on conflict do nothing;
  return found_id;
end;
$$;
revoke execute on function public.follow_market_listing(text) from public, anon;
grant execute on function public.follow_market_listing(text) to authenticated;

-- ---------------------------------------------------------------------
-- The morning's work: the database hands each job to the app
-- (/api/brix/scout) with its token; the app looks online and reports back.
-- ---------------------------------------------------------------------
create or replace function public.start_market_scout(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (at_time at time zone 'Europe/Sofia')::date;
  w record;
  batch record;
  job record;
  started integer := 0;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return 0; end if;

  -- one search per active watch a day
  for w in
    select mw.id, mw.organization_id from public.market_watches mw
    join public.organization_members m on m.organization_id = mw.organization_id and m.profile_id = mw.profile_id
    where mw.active
      and not exists (select 1 from public.scout_jobs j where j.watch_id = mw.id and j.day = today)
  loop
    insert into public.scout_jobs (organization_id, kind, watch_id, day) values (w.organization_id, 'search', w.id, today)
    returning id, token into job;
    perform net.http_post(
      url := 'https://brixa-yavlena.vercel.app/api/brix/scout',
      body := jsonb_build_object('id', job.id, 'token', job.token),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 150000
    );
    started := started + 1;
  end loop;

  -- the followed listings, eight at a time
  for batch in
    select l.organization_id, array_agg(l.id order by l.id) as ids
    from (
      select l.id, l.organization_id, (row_number() over (partition by l.organization_id order by l.id) - 1) / 8 as part
      from public.market_listings l
      where l.status = 'active'
        and exists (select 1 from public.market_tracks t where t.listing_id = l.id)
        and (l.checked_at is null or (l.checked_at at time zone 'Europe/Sofia')::date < today)
    ) l
    group by l.organization_id, l.part
  loop
    continue when exists (select 1 from public.scout_jobs j where j.kind = 'track' and j.day = today and j.listing_ids && batch.ids);
    insert into public.scout_jobs (organization_id, kind, listing_ids, day) values (batch.organization_id, 'track', batch.ids, today)
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
revoke execute on function public.start_market_scout(timestamptz) from public, anon, authenticated;

-- The app takes a job with its token (once) and gets what to look for.
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
      -- what is already known, so it isn't reported again
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

-- The app reports what it found (once per job).
--   search: {"listings": [{url, title, price_eur, area, place, private}]}
--   track:  {"listings": [{id, status: active|gone|unknown, price_eur}]}
create or replace function public.scout_report(target uuid, job_token uuid, payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  job record;
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

  if job.kind = 'search' then
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

-- "Search now" on a watch: today's search at once (still one a day per watch).
create or replace function public.run_market_watch(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  job record;
  today date := public.sofia_today();
begin
  select * into w from public.market_watches where id = target and profile_id = auth.uid() and active;
  if not found or not exists (select 1 from pg_extension where extname = 'pg_net') then return false; end if;
  if exists (select 1 from public.scout_jobs j where j.watch_id = w.id and j.day = today) then return false; end if;
  insert into public.scout_jobs (organization_id, kind, watch_id, day) values (w.organization_id, 'search', w.id, today)
  returning id, token into job;
  perform net.http_post(
    url := 'https://brixa-yavlena.vercel.app/api/brix/scout',
    body := jsonb_build_object('id', job.id, 'token', job.token),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 150000
  );
  return true;
end;
$$;
revoke execute on function public.run_market_watch(uuid) from public, anon;
grant execute on function public.run_market_watch(uuid) to authenticated;

-- at most five watches a broker (each one is a search on the web every morning)
create or replace function public.guard_market_watches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.market_watches where profile_id = new.profile_id) >= 5 then
    raise exception 'too many watches' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists market_watches_limit on public.market_watches;
create trigger market_watches_limit before insert on public.market_watches
  for each row execute function public.guard_market_watches();

-- 08:00: each broker hears what's new — the new listings their watches found since yesterday's
-- word (and how many private sellers among them), and what happened to the listings they follow.
create or replace function public.notify_market_scout(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  person record;
  sent integer := 0;
begin
  if local_now::time < time '08:00' then return 0; end if;

  for person in
    select m.organization_id, m.profile_id,
      (select count(*)::int from public.market_listing_events e join public.market_listings l on l.id = e.listing_id
        join public.market_watches w on w.id = l.watch_id
        where w.profile_id = m.profile_id and e.kind = 'new' and e.day between today - 1 and today) as fresh,
      (select count(*)::int from public.market_listing_events e join public.market_listings l on l.id = e.listing_id
        join public.market_watches w on w.id = l.watch_id
        where w.profile_id = m.profile_id and e.kind = 'new' and e.day between today - 1 and today and l.private) as private,
      (select count(*)::int from public.market_listing_events e join public.market_tracks t on t.listing_id = e.listing_id
        where t.profile_id = m.profile_id and e.kind in ('price', 'gone') and e.day between today - 1 and today) as changed
    from public.organization_members m
    where exists (select 1 from public.market_watches w where w.profile_id = m.profile_id)
       or exists (select 1 from public.market_tracks t where t.profile_id = m.profile_id)
  loop
    continue when person.fresh + person.changed = 0;
    insert into public.scout_digests (profile_id, day) values (person.profile_id, today) on conflict do nothing;
    continue when not found;
    perform public.notify(
      person.organization_id, person.profile_id, null, 'market_scout',
      jsonb_build_object('count', person.fresh, 'properties', person.private, 'deals', person.changed),
      '/market/scout'
    );
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke execute on function public.notify_market_scout(timestamptz) from public, anon, authenticated;

-- old jobs go after a month
create or replace function public.clean_scout_jobs()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.scout_jobs where created_at < now() - interval '30 days';
  delete from public.scout_digests where day < public.sofia_today() - 30;
$$;
revoke execute on function public.clean_scout_jobs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 05:40 Sofia in summer (04:40 in winter): the search is done well before the 08:00 word
    perform cron.schedule('brixa-market-scout', '40 2 * * *', 'select public.start_market_scout()');
    perform cron.schedule('brixa-market-scout-word', '*/15 * * * *', 'select public.notify_market_scout()');
    perform cron.schedule('brixa-market-scout-clean', '20 4 * * *', 'select public.clean_scout_jobs()');
  end if;
end;
$$;
