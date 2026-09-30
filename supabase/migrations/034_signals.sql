-- =====================================================================
-- BRIXA — migration 034: how the clients behave
--   • every opening of a shared listing is logged (when, for how long, how many
--     photos were seen), and the taps on "call / Viber / WhatsApp / e-mail" on its page
--   • each client's temperature — hot / warm / cooling / cold — with the reasons,
--     kept up to date on every signal and every hour
--   • 🔥 the broker is told at once when a client heats up (the listing opened again
--     within two days, or a tap on "call")
-- Run once in Supabase → SQL Editor → New query → Run (after 033).
-- =====================================================================

-- ---------------------------------------------------------------------
-- What the client did with a shared listing
-- ---------------------------------------------------------------------
create table public.share_events (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.property_shares (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  kind text not null check (kind in ('open', 'call', 'viber', 'whatsapp', 'email')),
  -- an opening: how long the page was looked at, how many photos were seen
  seconds int not null default 0 check (seconds between 0 and 3600),
  photos int not null default 0 check (photos between 0 and 200),
  occurred_at timestamptz not null default now()
);

create index share_events_client_idx on public.share_events (client_id, occurred_at desc);
create index share_events_share_idx on public.share_events (share_id, occurred_at desc);
create index share_events_org_idx on public.share_events (organization_id, occurred_at desc);

alter table public.share_events enable row level security;

-- the client's broker, whoever sent the link, and the managers; written only by the page's functions below
create policy "share events: read" on public.share_events
  for select to authenticated
  using (
    public.is_org_manager(organization_id)
    or (client_id is not null and public.can_view_client(client_id))
    or exists (select 1 from public.property_shares s where s.id = share_id and s.created_by = auth.uid())
  );

-- the openings counted before this log existed: one each, at the last time
insert into public.share_events (share_id, organization_id, client_id, property_id, kind, occurred_at)
select id, organization_id, client_id, property_id, 'open', last_viewed_at
from public.property_shares
where views > 0 and last_viewed_at is not null;

-- ---------------------------------------------------------------------
-- Each client's temperature (none for free contacts and closed / lost clients)
-- ---------------------------------------------------------------------
create table public.client_temperatures (
  client_id uuid primary key references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  temperature text not null check (temperature in ('hot', 'warm', 'cooling', 'cold')),
  -- for sorting: hot 4, warm 3, cooling 2, cold 1
  rank smallint generated always as (case temperature when 'hot' then 4 when 'warm' then 3 when 'cooling' then 2 else 1 end) stored,
  -- 0–100: the order inside a temperature
  score int not null default 0,
  -- why: [{ "code": "opens", "n": 3, "days": 2 }, …], the strongest first
  reasons jsonb not null default '[]',
  last_open_at timestamptz,
  last_contact_at timestamptz,
  computed_at timestamptz not null default now()
);

create index client_temperatures_org_idx on public.client_temperatures (organization_id, rank desc, score desc);

alter table public.client_temperatures enable row level security;

create policy "client temperatures: read" on public.client_temperatures
  for select to authenticated
  using (public.can_view_client(client_id));

-- The temperature, worked out from what the client did and what the broker did.
create or replace function public.compute_client_temperature(target_client uuid)
returns table (temperature text, score int, reasons jsonb, last_open_at timestamptz, last_contact_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  cadence int;
  last_contact timestamptz;
  days_quiet int;
  ratio numeric;
  opens_48h int;
  opens_7d int;
  opens_14d int;
  opens_ever int;
  last_open timestamptz;
  taps_3d int;
  taps_7d int;
  last_tap text;
  seconds_7d int;
  photos_7d int;
  pos int;
  neg int;
  unopened int;
  deal_stage text;
  s int := 50;
  strong boolean;
  r jsonb := '[]';
  temp text;
begin
  select cl.id, cl.stage, cl.client_class, cl.responsible_broker_id, cl.assigned_at, cl.created_at,
         o.follow_up_days_a, o.follow_up_days_b, o.follow_up_days_c
  into c
  from public.clients cl
  join public.organizations o on o.id = cl.organization_id
  where cl.id = target_client;
  if c.id is null or c.stage in ('deal', 'lost') or c.responsible_broker_id is null then
    return;
  end if;

  -- how long since the broker was last in touch, against the class's rhythm (A 2 / B 7 / C 30 days)
  cadence := greatest(1, case c.client_class when 'A' then c.follow_up_days_a when 'B' then c.follow_up_days_b else c.follow_up_days_c end);
  select max(a.occurred_at) into last_contact
  from public.activities a
  where a.client_id = target_client and a.type <> 'note';
  days_quiet := floor(extract(epoch from now() - coalesce(last_contact, c.assigned_at, c.created_at)) / 86400);
  ratio := days_quiet::numeric / cadence;

  -- the shared links
  select
    count(*) filter (where e.kind = 'open' and e.occurred_at > now() - interval '48 hours'),
    count(*) filter (where e.kind = 'open' and e.occurred_at > now() - interval '7 days'),
    count(*) filter (where e.kind = 'open' and e.occurred_at > now() - interval '14 days'),
    count(*) filter (where e.kind = 'open'),
    max(e.occurred_at) filter (where e.kind = 'open'),
    count(*) filter (where e.kind <> 'open' and e.occurred_at > now() - interval '3 days'),
    count(*) filter (where e.kind <> 'open' and e.occurred_at > now() - interval '7 days'),
    coalesce(sum(e.seconds) filter (where e.kind = 'open' and e.occurred_at > now() - interval '7 days'), 0),
    coalesce(max(e.photos) filter (where e.kind = 'open' and e.occurred_at > now() - interval '7 days'), 0)
  into opens_48h, opens_7d, opens_14d, opens_ever, last_open, taps_3d, taps_7d, seconds_7d, photos_7d
  from public.share_events e
  where e.client_id = target_client;
  select e.kind into last_tap
  from public.share_events e
  where e.client_id = target_client and e.kind <> 'open' and e.occurred_at > now() - interval '7 days'
  order by e.occurred_at desc
  limit 1;
  -- sent at least three days ago and never opened
  select count(*) into unopened
  from public.property_shares ps
  where ps.client_id = target_client and ps.revoked_at is null and ps.views = 0
    and ps.created_at < now() - interval '3 days' and ps.created_at > now() - interval '30 days';

  -- how the meetings went (the last 30 days)
  select count(*) filter (where a.outcome = 'positive'), count(*) filter (where a.outcome = 'negative')
  into pos, neg
  from public.activities a
  where a.client_id = target_client and a.occurred_at > now() - interval '30 days';

  -- the furthest open deal
  select d.stage into deal_stage
  from public.deals d
  where d.client_id = target_client and d.status = 'open'
  order by array_position(array['viewing', 'offer', 'deposit', 'preliminary', 'notary'], d.stage) desc
  limit 1;

  -- ---- the score, and the reasons (the strongest first)
  if taps_7d > 0 then
    s := s + 30;
    r := r || jsonb_build_object('code', 'tapped', 'kind', last_tap);
  end if;
  if opens_48h >= 2 then
    s := s + 25;
    r := r || jsonb_build_object('code', 'opens', 'n', opens_48h, 'days', 2);
  elsif opens_7d >= 3 then
    s := s + 20;
    r := r || jsonb_build_object('code', 'opens', 'n', opens_7d, 'days', 7);
  elsif opens_7d >= 1 then
    s := s + 10;
    r := r || jsonb_build_object('code', 'opened', 'at', last_open);
  end if;
  if deal_stage in ('offer', 'deposit', 'preliminary', 'notary') then
    s := s + 25;
    r := r || jsonb_build_object('code', 'deal', 'stage', deal_stage);
  end if;
  if c.stage in ('negotiation', 'deposit') then
    s := s + 20;
    r := r || jsonb_build_object('code', 'stage', 'stage', c.stage);
  elsif c.stage = 'viewing' then
    s := s + 10;
  elsif c.stage = 'presentation' then
    s := s + 5;
  end if;
  if pos > 0 then
    s := s + 10 * least(pos, 2);
    r := r || jsonb_build_object('code', 'positive', 'n', pos);
  end if;
  if seconds_7d >= 120 or photos_7d >= 8 then
    s := s + 5;
    r := r || jsonb_build_object('code', 'long_look', 'minutes', round(seconds_7d / 60.0), 'photos', photos_7d);
  end if;
  if c.client_class = 'A' then
    s := s + 5;
  elsif c.client_class = 'C' then
    s := s - 5;
  end if;
  if ratio > 1 then
    s := s - case when ratio > 4 then 40 when ratio > 2 then 25 else 10 end;
    r := r || jsonb_build_object('code', 'quiet', 'days', days_quiet, 'cadence', cadence);
  end if;
  if neg > 0 then
    s := s - 10 * least(neg, 2);
    r := r || jsonb_build_object('code', 'negative', 'n', neg);
  end if;
  if unopened > 0 then
    s := s - 5 * least(unopened, 3);
    r := r || jsonb_build_object('code', 'unopened', 'n', unopened);
  end if;
  if opens_ever > 0 and opens_14d = 0 then
    s := s - 10;
    r := r || jsonb_build_object('code', 'stopped', 'at', last_open);
  end if;
  s := greatest(0, least(100, s));

  -- ---- the temperature
  -- 🔥 the client is moving now (a deal or a negotiation counts only while the broker keeps in touch)
  strong := taps_3d > 0 or opens_48h >= 2
    or ((deal_stage in ('offer', 'deposit', 'preliminary', 'notary') or c.stage in ('negotiation', 'deposit')) and ratio <= 2);
  temp := case
    when strong or s >= 80 then 'hot'
    when ratio >= 3 and opens_14d = 0 and taps_7d = 0 then 'cold'
    when ratio > 1 or s < 40 then 'cooling'
    else 'warm'
  end;

  temperature := temp;
  score := s;
  reasons := r;
  last_open_at := greatest(last_open, (select max(ps.last_viewed_at) from public.property_shares ps where ps.client_id = target_client));
  last_contact_at := last_contact;
  return next;
end;
$$;

create or replace function public.refresh_client_temperature(target_client uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if target_client is null then
    return null;
  end if;
  select * into t from public.compute_client_temperature(target_client);
  if t.temperature is null then
    delete from public.client_temperatures where client_id = target_client;
    return null;
  end if;
  insert into public.client_temperatures as ct
    (client_id, organization_id, temperature, score, reasons, last_open_at, last_contact_at, computed_at)
  select target_client, cl.organization_id, t.temperature, t.score, t.reasons, t.last_open_at, t.last_contact_at, now()
  from public.clients cl
  where cl.id = target_client
  on conflict (client_id) do update
    set temperature = excluded.temperature,
        score = excluded.score,
        reasons = excluded.reasons,
        last_open_at = excluded.last_open_at,
        last_contact_at = excluded.last_contact_at,
        computed_at = excluded.computed_at;
  return t.temperature;
end;
$$;

-- every client (the scheduled job: time alone cools a client down)
create or replace function public.refresh_client_temperatures()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  n int := 0;
begin
  delete from public.client_temperatures ct
  using public.clients cl
  where cl.id = ct.client_id and (cl.stage in ('deal', 'lost') or cl.responsible_broker_id is null);
  for c in
    select id from public.clients where stage not in ('deal', 'lost') and responsible_broker_id is not null
  loop
    perform public.refresh_client_temperature(c.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.compute_client_temperature(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_client_temperature(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_client_temperatures() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Kept up to date: what the broker logs, the client's stage and class, the deals
-- ---------------------------------------------------------------------
create or replace function public.temperature_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'clients' then
    perform public.refresh_client_temperature(new.id);
    return null;
  end if;
  -- an activity or a deal: its client, and the one it was moved away from
  if tg_op = 'DELETE' then
    perform public.refresh_client_temperature(old.client_id);
    return null;
  end if;
  perform public.refresh_client_temperature(new.client_id);
  if tg_op = 'UPDATE' and old.client_id is distinct from new.client_id then
    perform public.refresh_client_temperature(old.client_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.temperature_on_change() from public, anon, authenticated;

create trigger activities_temperature
  after insert or update of client_id, type, outcome, occurred_at or delete on public.activities
  for each row execute function public.temperature_on_change();

create trigger clients_temperature
  after insert or update of stage, client_class, responsible_broker_id on public.clients
  for each row execute function public.temperature_on_change();

create trigger deals_temperature
  after insert or update of client_id, stage, status or delete on public.deals
  for each row execute function public.temperature_on_change();

-- ---------------------------------------------------------------------
-- The listing's page reports what the client does
-- ---------------------------------------------------------------------

-- An opening, or a tap on call / Viber / WhatsApp / e-mail. Returns the opening's id (its time is added later).
create or replace function public.record_share_event(share_token uuid, event text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sh record;
  recent int;
  ev uuid;
  opens int;
  recipient uuid;
  client_name text;
begin
  if event not in ('open', 'call', 'viber', 'whatsapp', 'email') then
    return null;
  end if;
  select s.id, s.organization_id, s.property_id, s.client_id, s.created_by into sh
  from public.property_shares s
  where s.token = share_token and s.revoked_at is null;
  if sh.id is null then
    return null;
  end if;
  -- a flood from one link is ignored
  select count(*) into recent from public.share_events where share_id = sh.id and occurred_at > now() - interval '1 hour';
  if recent >= 30 then
    return null;
  end if;

  if event = 'open' then
    -- the count on the link, and "… opened the listing" the first time
    perform public.mark_share_viewed(share_token);
  end if;
  insert into public.share_events (share_id, organization_id, client_id, property_id, kind)
  values (sh.id, sh.organization_id, sh.client_id, sh.property_id, event)
  returning id into ev;

  if sh.client_id is not null then
    perform public.refresh_client_temperature(sh.client_id);

    -- 🔥 at once: a tap, or the listing opened again within two days (once in 12 hours per client)
    select count(*) into opens
    from public.share_events
    where client_id = sh.client_id and kind = 'open' and occurred_at > now() - interval '48 hours';
    if event <> 'open' or opens >= 2 then
      select coalesce(c.responsible_broker_id, sh.created_by), c.full_name into recipient, client_name
      from public.clients c where c.id = sh.client_id;
      if recipient is not null and not exists (
        select 1 from public.notifications n
        where n.recipient_id = recipient and n.type = 'client_hot'
          and n.link = '/clients/' || sh.client_id and n.created_at > now() - interval '12 hours'
      ) then
        perform public.notify(
          sh.organization_id, recipient, null, 'client_hot',
          jsonb_build_object(
            'actor', client_name,
            'title', (select title from public.properties where id = sh.property_id),
            'kind', event,
            'count', opens
          ),
          '/clients/' || sh.client_id
        );
      end if;
    end if;
  end if;
  return ev;
end;
$$;

-- How long the page was looked at and how many photos were seen (sent when the page is left).
create or replace function public.share_event_time(share_token uuid, event_id uuid, seen_seconds int, seen_photos int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  update public.share_events e
  set seconds = greatest(e.seconds, least(greatest(coalesce(seen_seconds, 0), 0), 3600)),
      photos = greatest(e.photos, least(greatest(coalesce(seen_photos, 0), 0), 200))
  from public.property_shares s
  where e.id = event_id and e.kind = 'open' and s.id = e.share_id and s.token = share_token
    and e.occurred_at > now() - interval '6 hours'
  returning e.client_id into target;
  if target is not null then
    perform public.refresh_client_temperature(target);
  end if;
end;
$$;

grant execute on function public.record_share_event(uuid, text) to anon, authenticated;
grant execute on function public.share_event_time(uuid, uuid, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Every hour: the temperatures (quiet clients cool down with time alone)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-temperatures', '7 * * * *', 'select public.refresh_client_temperatures()');
  end if;
end;
$$;

-- the first reading for everyone
select public.refresh_client_temperatures();
