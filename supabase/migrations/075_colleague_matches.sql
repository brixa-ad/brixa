-- =====================================================================
-- BRIXA — migration 075: a listing that fits a colleague's buyer
--   • a listing on the market (or cheaper): the broker of every active
--     buyer / tenant it fits is told — a hot one (A) at once with 🔥 as
--     before, the others in one word per broker, with the listing to offer;
--   • the listing's broker is told which colleagues have buyers for it and
--     how many (not who the clients are — brokers see only their own);
--   • a buyer's search saved: the colleagues whose listings it fits too;
--   • on the listing: the colleagues with buyers for it, to write or call.
-- Run once in Supabase → SQL Editor → New query → Run (after 074).
-- Safe to run twice.
-- =====================================================================

-- a buyer's search saved (once a minute, a minute later — the rest of it is saved by then)
create table if not exists public.search_events (
  client_id uuid primary key references public.clients (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists search_events_waiting_idx on public.search_events (created_at);

alter table public.search_events enable row level security;

create or replace function public.note_search_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- not a bulk import, not the samples
  if coalesce(current_setting('brixa.importing', true), '') = 'on' then
    return new;
  end if;
  insert into public.search_events (client_id) values (new.client_id)
  on conflict (client_id) do update set created_at = now();
  return new;
end;
$$;

revoke execute on function public.note_search_event() from public, anon, authenticated;

drop trigger if exists client_searches_search_event on public.client_searches;
create trigger client_searches_search_event
  after insert or update on public.client_searches
  for each row execute function public.note_search_event();

-- Every minute: the listings that came on the market or got cheaper, and the searches saved
-- (a minute ago, so their extras are saved too) → the brokers of the buyers and of the listings.
create or replace function public.speed_to_lead()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
  sev record;
  hit record;
  grp record;
  fresh_ids uuid[];
  told_ids uuid[];
  names text;
  brokers int;
  made int := 0;
begin
  for ev in
    select e.id, e.kind, p.id as property_id, p.organization_id, p.title, p.owner_client_id,
      p.operation_type, p.responsible_broker_id as lister
    from public.listing_events e
    join public.properties p on p.id = e.property_id
    where e.handled_at is null and e.created_at < now() - interval '50 seconds' and p.status = 'active'
    order by e.created_at
    limit 50
  loop
    update public.listing_events set handled_at = now() where id = ev.id;

    -- the active buyers / tenants it fits, each once for this listing (and once more if it gets cheaper)
    with fresh as (
      insert into public.lead_alerts (client_id, property_id, kind)
      select c.id, ev.property_id, ev.kind
      from public.clients c
      join public.client_searches s on s.client_id = c.id and s.operation = ev.operation_type
      where c.organization_id = ev.organization_id
        and c.responsible_broker_id is not null and c.stage not in ('deal', 'lost') and not c.sample
        and c.id is distinct from ev.owner_client_id
        and public.listing_fits(ev.property_id, c.id)
      on conflict do nothing
      returning client_id
    )
    select coalesce(array_agg(client_id), '{}') into fresh_ids from fresh;

    if cardinality(fresh_ids) = 0 then
      continue;
    end if;

    -- a hot one: at once, by name — call within 5 minutes (the push can call them)
    for hit in
      select c.id, c.full_name, c.responsible_broker_id
      from public.clients c
      where c.id = any (fresh_ids) and c.client_class = 'A'
      order by c.updated_at desc
    loop
      perform public.notify(
        ev.organization_id, hit.responsible_broker_id, null, 'speed_to_lead',
        jsonb_build_object('title', hit.full_name, 'property', ev.title, 'kind', ev.kind),
        '/clients/' || hit.id
      );
      made := made + 1;
    end loop;

    -- the others: one word to each broker — the buyer by name, or how many — and the listing to offer
    for grp in
      select c.responsible_broker_id as broker, count(*)::int as n,
        (array_agg(c.full_name order by c.updated_at desc))[1] as name
      from public.clients c
      where c.id = any (fresh_ids) and c.client_class <> 'A'
      group by c.responsible_broker_id
    loop
      perform public.notify(
        ev.organization_id, grp.broker,
        case when ev.lister is distinct from grp.broker then ev.lister end,
        'listing_match',
        jsonb_build_object(
          'title', grp.name, 'count', grp.n, 'property', ev.title, 'kind', ev.kind,
          'actor', case when ev.lister is not null and ev.lister <> grp.broker then public.person_name(ev.lister) end
        ),
        '/properties/' || ev.property_id || '#buyers'
      );
      made := made + 1;
    end loop;

    -- the listing's broker: the colleagues who have buyers for it (each buyer told once)
    if ev.lister is not null then
      with told as (
        insert into public.lead_alerts (client_id, property_id, kind)
        select c.id, ev.property_id, 'lister'
        from public.clients c
        where c.id = any (fresh_ids) and c.responsible_broker_id <> ev.lister
        on conflict do nothing
        returning client_id
      )
      select coalesce(array_agg(client_id), '{}') into told_ids from told;

      if cardinality(told_ids) > 0 then
        select string_agg(public.person_name(b.broker), ', ' order by b.n desc, b.broker), count(*)::int
        into names, brokers
        from (
          select c.responsible_broker_id as broker, count(*) as n
          from public.clients c
          where c.id = any (told_ids)
          group by c.responsible_broker_id
        ) b;
        perform public.notify(
          ev.organization_id, ev.lister, null, 'listing_buyers',
          jsonb_build_object('property', ev.title, 'actor', names, 'count', cardinality(told_ids), 'brokers', brokers),
          '/properties/' || ev.property_id || '#colleague-buyers'
        );
        made := made + 1;
      end if;
    end if;
  end loop;

  -- a buyer's search saved: the colleagues whose listings on the market it fits
  for sev in
    select e.client_id, c.organization_id, c.responsible_broker_id as broker, c.stage, c.sample
    from public.search_events e
    join public.clients c on c.id = e.client_id
    where e.created_at < now() - interval '50 seconds'
    order by e.created_at
    limit 50
  loop
    delete from public.search_events where client_id = sev.client_id;
    if sev.broker is null or sev.stage in ('deal', 'lost') or sev.sample then
      continue;
    end if;

    with told as (
      insert into public.lead_alerts (client_id, property_id, kind)
      select sev.client_id, p.id, 'lister'
      from public.properties p
      join public.client_searches s on s.client_id = sev.client_id and s.operation = p.operation_type
      where p.organization_id = sev.organization_id and p.status = 'active' and not p.sample
        and p.responsible_broker_id is not null and p.responsible_broker_id <> sev.broker
        and p.owner_client_id is distinct from sev.client_id
        and public.listing_fits(p.id, sev.client_id)
      on conflict do nothing
      returning property_id
    )
    select coalesce(array_agg(property_id), '{}') into told_ids from told;

    -- one word to each colleague: the listing, or how many of theirs it fits
    for grp in
      select p.responsible_broker_id as lister, count(*)::int as n,
        (array_agg(p.id order by p.updated_at desc))[1] as first_id,
        (array_agg(p.title order by p.updated_at desc))[1] as first_title
      from public.properties p
      where p.id = any (told_ids)
      group by p.responsible_broker_id
    loop
      perform public.notify(
        sev.organization_id, grp.lister, sev.broker, 'listing_buyers',
        jsonb_build_object(
          'property', grp.first_title, 'actor', public.person_name(sev.broker),
          'count', 1, 'brokers', 1, 'properties', grp.n, 'kind', 'search'
        ),
        '/properties/' || grp.first_id || '#colleague-buyers'
      );
      made := made + 1;
    end loop;
  end loop;

  -- what's done and old
  delete from public.listing_events where handled_at < now() - interval '7 days';
  -- a listing that never became active again: forget it after a day
  update public.listing_events set handled_at = now() where handled_at is null and created_at < now() - interval '1 day';
  return made;
end;
$$;

revoke execute on function public.speed_to_lead() from public, anon, authenticated;

-- On a listing: the colleagues (not this user) who have active buyers it fits — how many, how many hot.
-- Not who the clients are: a broker sees only their own clients.
create or replace function public.colleague_buyers(target_property uuid)
returns table (broker_id uuid, name text, phone text, avatar_path text, buyers int, hot int)
language sql
stable
security definer
set search_path = public
as $$
  select c.responsible_broker_id, coalesce(pr.full_name, pr.email), pr.phone, pr.avatar_path,
    count(*)::int, (count(*) filter (where c.client_class = 'A'))::int
  from public.properties p
  join public.client_searches s on s.operation = p.operation_type
  join public.clients c on c.id = s.client_id and c.organization_id = p.organization_id
  join public.profiles pr on pr.id = c.responsible_broker_id
  where p.id = target_property
    and public.is_org_member(p.organization_id)
    and c.responsible_broker_id <> auth.uid()
    and c.stage not in ('deal', 'lost') and not c.sample
    and c.id is distinct from p.owner_client_id
    and public.listing_fits(p.id, c.id)
  group by c.responsible_broker_id, pr.full_name, pr.email, pr.phone, pr.avatar_path
  order by count(*) desc, 2;
$$;

revoke execute on function public.colleague_buyers(uuid) from public, anon;
grant execute on function public.colleague_buyers(uuid) to authenticated;

-- What came in the last two days goes through once more, so the brokers hear of it now
-- (a buyer already told about a listing is not told again).
insert into public.listing_events (property_id, kind)
select p.id, 'new'
from public.properties p
where p.status = 'active' and not p.sample and p.created_at > now() - interval '2 days'
  and not exists (select 1 from public.listing_events e where e.property_id = p.id and e.handled_at is null);

insert into public.search_events (client_id)
select s.client_id
from public.client_searches s
join public.clients c on c.id = s.client_id
where s.updated_at > now() - interval '2 days' and not c.sample
on conflict do nothing;
