-- =====================================================================
-- BRIXA — migration 035: the class follows the behaviour
--   • 🔥 A hot, ☀️ B warm, ❄️ C cold — the system moves a client by what they do:
--       hot → A;  a C client who shows interest (opens a link, taps "call",
--       a good meeting) → B;  quiet for more than twice the class's rhythm and
--       showing nothing → one class down (A → B → C)
--   • "cooling" stays a warning on top of the class
--   • a class set by hand holds for 14 days, or until the client does something new
-- Run once in Supabase → SQL Editor → New query → Run (after 034).
-- =====================================================================

alter table public.clients add column class_manual_at timestamptz;

alter table public.client_temperatures
  add column auto_class_at timestamptz,
  add column auto_class_from text check (auto_class_from is null or auto_class_from in ('A', 'B', 'C')),
  add column auto_class_reason text check (auto_class_reason is null or auto_class_reason in ('hot', 'engaged', 'quiet'));

-- A class chosen by a person (not by the system) is remembered: it holds for a while.
create or replace function public.mark_manual_class()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('brixa.auto_class', true), '') = 'on' or auth.uid() is null then
    return new;
  end if;
  -- a new client: only A or B is a choice (C is where the form starts)
  if (tg_op = 'INSERT' and new.client_class <> 'C')
     or (tg_op = 'UPDATE' and new.client_class is distinct from old.client_class) then
    new.class_manual_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.mark_manual_class() from public, anon, authenticated;

create trigger clients_manual_class
  before insert or update of client_class on public.clients
  for each row execute function public.mark_manual_class();

-- The temperature (034's), with "hot" measured the same whatever the class, and two more outputs.
drop function public.compute_client_temperature(uuid);

create or replace function public.compute_client_temperature(target_client uuid)
returns table (
  temperature text, score int, reasons jsonb, last_open_at timestamptz, last_contact_at timestamptz,
  -- how quiet against the class's rhythm (2 = twice the rhythm), and a sign of interest in the last 7 days
  quiet_ratio numeric, engaged boolean
)
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
  pos_7d int;
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
  select count(*) filter (where a.outcome = 'positive'),
         count(*) filter (where a.outcome = 'positive' and a.occurred_at > now() - interval '7 days'),
         count(*) filter (where a.outcome = 'negative')
  into pos, pos_7d, neg
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
  -- 🔥 the client is moving now (a deal or a negotiation counts only while the broker keeps in touch —
  -- measured against A's rhythm, whatever the class, so that the class can follow without going round)
  strong := taps_3d > 0 or opens_48h >= 2
    or ((deal_stage in ('offer', 'deposit', 'preliminary', 'notary') or c.stage in ('negotiation', 'deposit'))
        and days_quiet <= 2 * greatest(1, c.follow_up_days_a));
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
  quiet_ratio := ratio;
  engaged := opens_7d > 0 or taps_7d > 0 or pos_7d > 0;
  return next;
end;
$$;

revoke execute on function public.compute_client_temperature(uuid) from public, anon, authenticated;

-- The temperature — and the class follows it.
create or replace function public.refresh_client_temperature(target_client uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  cl record;
  target_class text;
  why text;
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
  select target_client, c.organization_id, t.temperature, t.score, t.reasons, t.last_open_at, t.last_contact_at, now()
  from public.clients c
  where c.id = target_client
  on conflict (client_id) do update
    set temperature = excluded.temperature,
        score = excluded.score,
        reasons = excluded.reasons,
        last_open_at = excluded.last_open_at,
        last_contact_at = excluded.last_contact_at,
        computed_at = excluded.computed_at;

  -- ---- the class follows the behaviour (not while the system is already moving it)
  if coalesce(current_setting('brixa.auto_class', true), '') = 'on' then
    return t.temperature;
  end if;
  select c.client_class, c.class_manual_at into cl from public.clients c where c.id = target_client;
  -- set by hand: holds for 14 days, or until the client does something new
  if cl.class_manual_at is not null
     and cl.class_manual_at > now() - interval '14 days'
     and not exists (select 1 from public.share_events e where e.client_id = target_client and e.occurred_at > cl.class_manual_at) then
    return t.temperature;
  end if;

  if t.temperature = 'hot' and cl.client_class <> 'A' then
    target_class := 'A';
    why := 'hot';
  elsif cl.client_class = 'C' and t.engaged then
    target_class := 'B';
    why := 'engaged';
  elsif t.temperature in ('cooling', 'cold') and t.quiet_ratio > 2 and not t.engaged and cl.client_class <> 'C' then
    target_class := case cl.client_class when 'A' then 'B' else 'C' end;
    why := 'quiet';
  end if;
  if target_class is null then
    return t.temperature;
  end if;

  -- the follow-up rhythm moves with the class (its own trigger); the temperature is worked out again for the new class
  perform set_config('brixa.auto_class', 'on', true);
  update public.clients set client_class = target_class where id = target_client;
  perform set_config('brixa.auto_class', 'off', true);
  update public.client_temperatures
  set auto_class_at = now(), auto_class_from = cl.client_class, auto_class_reason = why
  where client_id = target_client;
  return (select temperature from public.client_temperatures where client_id = target_client);
end;
$$;

revoke execute on function public.refresh_client_temperature(uuid) from public, anon, authenticated;

-- everyone, now
select public.refresh_client_temperatures();
