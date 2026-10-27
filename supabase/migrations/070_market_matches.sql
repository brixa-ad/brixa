-- =====================================================================
-- BRIXA — migration 070: a listing Brix finds goes to the buyers it fits
--   When Brix's morning search finds a new listing, it is checked against
--   every buyer's (or tenant's) search in the agency: the deal, the town,
--   the neighbourhoods, the kind of property, the budget and the size.
--   The client's broker hears of it ("A listing in Levski for 118 000 €
--   fits Maria Petrova") and sends it to the client in a tap.
-- Run once in Supabase → SQL Editor → New query → Run (after 069).
-- =====================================================================

create table if not exists public.market_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  listing_id uuid not null references public.market_listings (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  broker_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  dismissed_at timestamptz,
  constraint market_matches_one unique (listing_id, client_id)
);
create index if not exists market_matches_broker_idx on public.market_matches (broker_id, created_at desc);

alter table public.market_matches enable row level security;
drop policy if exists "market matches: read" on public.market_matches;
create policy "market matches: read" on public.market_matches
  for select to authenticated
  using (broker_id = auth.uid() or public.is_org_manager(organization_id));
drop policy if exists "market matches: mark" on public.market_matches;
create policy "market matches: mark" on public.market_matches
  for update to authenticated
  using (broker_id = auth.uid())
  with check (broker_id = auth.uid());
grant select, update (sent_at, dismissed_at) on public.market_matches to authenticated;

-- One listing against every buyer's search; the matches kept, the brokers told (in the day).
create or replace function public.match_market_listing(target uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.market_listings;
  w public.market_watches;
  local_now timestamp := now() at time zone 'Europe/Sofia';
  added integer := 0;
  broker record;
begin
  select * into l from public.market_listings where id = target;
  if not found or l.status <> 'active' or l.price_eur is null or l.watch_id is null then return 0; end if;
  select * into w from public.market_watches where id = l.watch_id;
  if not found then return 0; end if;

  with fits as (
    select c.id as client_id, c.responsible_broker_id as broker_id
    from public.clients c
    join public.client_searches s on s.client_id = c.id
    where c.organization_id = l.organization_id
      and c.responsible_broker_id is not null
      and c.stage not in ('deal', 'lost')
      and c.types && array['buyer', 'tenant', 'investor']
      and s.operation = coalesce(l.operation, w.operation)
      -- the town
      and (cardinality(s.settlement_ids) = 0 or w.settlement_id = any (s.settlement_ids))
      -- the neighbourhoods: the listing's place has to name one of them
      and (
        cardinality(s.neighborhood_ids) = 0
        or exists (
          select 1 from public.geo_neighborhoods n
          where n.id = any (s.neighborhood_ids)
            and (coalesce(l.place, '') || ' ' || coalesce(l.title, '')) ilike '%' || n.name || '%'
        )
      )
      -- the kind: the same one searched, or named in the listing's title
      and (
        cardinality(s.subtype_ids) = 0
        or s.subtype_ids && w.subtype_ids
        or exists (
          select 1 from public.property_subtypes st
          where st.id = any (s.subtype_ids) and coalesce(l.title, '') ilike '%' || st.name || '%'
        )
      )
      -- the budget (a little room above it: prices are haggled)
      and (s.budget_max is null or l.price_eur <= coalesce(public.to_eur(s.budget_max, s.currency), s.budget_max) * 1.05)
      and (s.budget_min is null or l.price_eur >= coalesce(public.to_eur(s.budget_min, s.currency), s.budget_min) * 0.9)
      -- the size, when the listing says it
      and (l.area is null or s.area_min is null or l.area >= s.area_min * 0.95)
      and (l.area is null or s.area_max is null or l.area <= s.area_max * 1.05)
      -- someone's actual budget or place, not just "anything anywhere"
      and (s.budget_max is not null or cardinality(s.neighborhood_ids) > 0)
    order by c.updated_at desc
    limit 10
  ),
  saved as (
    insert into public.market_matches (organization_id, listing_id, client_id, broker_id)
    select l.organization_id, l.id, f.client_id, f.broker_id from fits f
    on conflict do nothing
    returning client_id, broker_id
  )
  select count(*) into added from saved;

  -- in the day each broker hears at once (the night's finds come with the 08:00 word)
  if added > 0 and local_now::time between time '08:00' and time '21:00' then
    for broker in
      select m.broker_id, count(*)::int as clients,
        (array_agg(c.full_name order by c.full_name))[1] as first_name
      from public.market_matches m
      join public.clients c on c.id = m.client_id
      where m.listing_id = l.id and m.created_at > now() - interval '1 minute' and m.broker_id is not null
      group by m.broker_id
    loop
      perform public.notify(
        l.organization_id, broker.broker_id, null, 'market_match',
        jsonb_build_object('title', coalesce(l.place, l.title, ''), 'amount', l.price_eur, 'client', broker.first_name, 'count', broker.clients),
        '/market/scout?view=matches'
      );
    end loop;
  end if;
  return added;
end;
$$;
revoke execute on function public.match_market_listing(uuid) from public, anon, authenticated;

create or replace function public.match_new_market_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.match_market_listing(new.listing_id);
  return new;
end;
$$;
revoke execute on function public.match_new_market_listing() from public, anon, authenticated;

drop trigger if exists market_listing_events_match on public.market_listing_events;
create trigger market_listing_events_match
  after insert on public.market_listing_events
  for each row when (new.kind = 'new')
  execute function public.match_new_market_listing();

-- The 08:00 word also says how many new listings fit the broker's buyers.
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
        where t.profile_id = m.profile_id and e.kind in ('price', 'gone') and e.day between today - 1 and today) as changed,
      (select count(distinct mm.listing_id)::int from public.market_matches mm
        where mm.broker_id = m.profile_id and mm.created_at >= (today - 1)::timestamp at time zone 'Europe/Sofia') as matched
    from public.organization_members m
    where exists (select 1 from public.market_watches w where w.profile_id = m.profile_id)
       or exists (select 1 from public.market_tracks t where t.profile_id = m.profile_id)
       or exists (select 1 from public.market_matches mm where mm.broker_id = m.profile_id and mm.created_at > now() - interval '2 days')
  loop
    continue when person.fresh + person.changed + person.matched = 0;
    insert into public.scout_digests (profile_id, day) values (person.profile_id, today) on conflict do nothing;
    continue when not found;
    perform public.notify(
      person.organization_id, person.profile_id, null, 'market_scout',
      jsonb_build_object('count', person.fresh, 'properties', person.private, 'deals', person.changed, 'clients', person.matched),
      case when person.matched > 0 then '/market/scout?view=matches' else '/market/scout' end
    );
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke execute on function public.notify_market_scout(timestamptz) from public, anon, authenticated;
