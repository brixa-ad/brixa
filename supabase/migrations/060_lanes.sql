-- =====================================================================
-- BRIXA — migration 060: the follow-up lanes (A hot, B warm, C cold)
--   • qualifying a client: when they'll buy or sell (within 30 days / 1–3
--     months / later), who decides, and why — the "when" puts them in a lane
--     (A, B, C) and the behaviour can still raise it
--   • each lane walks its own path, by itself (BRIXA writes, the broker sends
--     in one tap from Follow-up → News):
--       B: day 1 an analysis of their area, day 14 the mortgage rates, day 30
--          a call that sells nothing — and round again every 30 days
--       C: on the 1st a useful tip, from the 15th a note on their area's
--          market; before Баба Марта, Easter and Christmas a task to drop by
--          with a small present
--       anyone silent for six months (after the broker kept in touch): the
--          "break-up" message; once sent, the lanes leave them alone until
--          they answer
--   • speed to lead: a listing that comes on the market or gets cheaper and
--     fits a hot (A) client → the broker hears at once (the push can call)
-- Run once in Supabase → SQL Editor → New query → Run (after 059).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Qualifying a client
-- ---------------------------------------------------------------------
alter table public.clients
  -- when they'll buy or sell: within 30 days, in 1–3 months, later (or not in a hurry)
  add column timeline text check (timeline in ('now', 'soon', 'later')),
  -- who decides: they alone, with a partner, others too (parents, a company…)
  add column decider text check (decider in ('alone', 'partner', 'others')),
  -- why: what moves them
  add column motive text check (motive is null or char_length(motive) <= 300),
  -- since when in this lane (the lane's path counts its days from here)
  add column class_since timestamptz;

create or replace function public.mark_class_since()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.class_since := coalesce(new.class_since, now());
  elsif new.client_class is distinct from old.client_class then
    new.class_since := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.mark_class_since() from public, anon, authenticated;

create trigger clients_class_since
  before insert or update of client_class on public.clients
  for each row execute function public.mark_class_since();

-- ---------------------------------------------------------------------
-- The lanes' messages, in the same list as the market news
-- ---------------------------------------------------------------------
alter table public.client_news drop constraint client_news_kind_check;
alter table public.client_news add constraint client_news_kind_check
  check (kind in ('rates', 'prices', 'monthly', 'warm_analysis', 'warm_rates', 'warm_call', 'tips', 'breakup'));

-- When the client last answered: a meeting or viewing, a call that got through, a link opened, a survey.
create or replace function public.client_last_reply(target uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    (select max(a.occurred_at) from public.activities a
     where a.client_id = target and (a.type in ('meeting', 'viewing') or (a.type = 'call' and a.outcome is not null))),
    (select max(e.occurred_at) from public.share_events e where e.client_id = target),
    (select max(r.received_at) from public.lead_form_responses r where r.client_id = target)
  );
$$;

-- The break-up message went out and they haven't answered since: the lanes leave them alone.
create or replace function public.client_closed(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_news n
    where n.client_id = target and n.kind = 'breakup' and n.sent_at is not null
      and coalesce(public.client_last_reply(target), '-infinity'::timestamptz) < n.sent_at
  );
$$;

-- The market where a client owns or searches: the area, € per m², the listings, the change (%).
create or replace function public.client_market(target_client uuid, today date)
returns table (area text, sqm numeric, listings int, change numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org uuid;
  place record;
  trend record;
  v_sqm numeric;
  v_listings int;
  v_change numeric;
begin
  select c.organization_id into org from public.clients c where c.id = target_client;
  -- a home they own (a listing, an offer, one bought through us), else where they search
  select x.settlement_id, x.neighborhood_id into place
  from (
    select p.settlement_id, p.neighborhood_id, 1 as rank
    from public.properties p
    where p.owner_client_id = target_client and p.settlement_id is not null and p.status in ('active', 'reserved', 'withdrawn')
    union all
    select o.settlement_id, o.neighborhood_id, 2 from public.client_offers o where o.client_id = target_client and o.settlement_id is not null
    union all
    select p.settlement_id, p.neighborhood_id, 3
    from public.deals d join public.properties p on p.id = d.property_id
    where d.client_id = target_client and d.status = 'won' and d.kind = 'sale' and p.settlement_id is not null
    union all
    select nb.settlement_id, nb.id, 4
    from public.client_searches s join public.geo_neighborhoods nb on nb.id = s.neighborhood_ids[1]
    where s.client_id = target_client
    union all
    select s.settlement_ids[1], null, 5
    from public.client_searches s
    where s.client_id = target_client and coalesce(array_length(s.settlement_ids, 1), 0) > 0
  ) x
  order by x.rank, x.neighborhood_id nulls last
  limit 1;
  if place.settlement_id is null then
    return;
  end if;

  select d.listing_median, d.listings into v_sqm, v_listings
  from public.market_daily d
  where d.organization_id = org and d.operation = 'sale'
    and d.settlement_id = place.settlement_id and d.neighborhood_id is not distinct from place.neighborhood_id
    and d.subtype_id is null and d.listings >= 3 and d.listing_median is not null
    and d.day >= today - 7
  order by d.day desc
  limit 1;
  if v_sqm is null then
    select m.price_per_sqm into v_sqm
    from public.market_prices m
    where m.organization_id = org and m.operation = 'sale'
      and m.settlement_id = place.settlement_id and m.neighborhood_id is not distinct from place.neighborhood_id;
  end if;
  if v_sqm is null then
    return;
  end if;
  select * into trend from public.neighborhood_trend(org, place.settlement_id, place.neighborhood_id);
  if found and trend.then_sqm > 0 then
    v_change := round((trend.now_sqm / trend.then_sqm - 1) * 100, 1);
  end if;
  return query select
    coalesce((select nb.name from public.geo_neighborhoods nb where nb.id = place.neighborhood_id),
             (select st.name from public.geo_settlements st where st.id = place.settlement_id)),
    round(v_sqm), v_listings, v_change;
end;
$$;

-- One notification per broker for the day's news of a kind ('lanes': all the lanes' messages).
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
    where (n.kind = news_kind
           or (news_kind = 'lanes' and n.kind in ('warm_analysis', 'warm_rates', 'warm_call', 'tips', 'breakup')))
      and n.created_on = today and n.sent_at is null and n.skipped_at is null
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

-- The monthly note: the clients the broker chose, and lane C's from the 15th (every four weeks).
create or replace function public.make_monthly_news(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  client record;
  market record;
  rate_now record;
  rate_before numeric;
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
    where (c.monthly_news or (c.client_class = 'C' and extract(day from today) >= 15))
      and c.responsible_broker_id is not null and c.stage <> 'lost'
      and (c.phone is not null or c.email is not null)
      and not public.client_closed(c.id)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.kind = 'monthly' and x.created_on > today - 28)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 7)
  loop
    select * into market from public.client_market(client.id, today);
    if market.area is null and rate_now.rate is null then
      continue;
    end if;
    insert into public.client_news (organization_id, client_id, kind, data)
    values (
      client.organization_id, client.id, 'monthly',
      jsonb_strip_nulls(jsonb_build_object(
        'area', market.area, 'sqm', market.sqm, 'listings', market.listings, 'change', market.change,
        'rate', rate_now.rate, 'rateMonth', to_char(rate_now.month, 'YYYY-MM'), 'rateBefore', rate_before
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

-- The lanes' paths: B's 30 days (analysis, rates, a call), C's tip on the 1st, and the break-up after six quiet months.
create or replace function public.make_lane_news(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  client record;
  market record;
  rate_now record;
  rate_before numeric;
  start date;
  buyer boolean;
  made int := 0;
  done_today boolean;
begin
  select m.month, m.rate into rate_now from public.mortgage_rates m order by m.month desc limit 1;
  if found then
    select m.rate into rate_before from public.mortgage_rates m
    where m.month = (rate_now.month - interval '3 months')::date;
  end if;

  -- ---- B: every 30 days in the lane — day 1 an analysis, day 14 the rates, day 30 a call
  for client in
    select c.id, c.organization_id, c.types, c.class_since
    from public.clients c
    where c.client_class = 'B' and c.responsible_broker_id is not null and c.stage not in ('deal', 'lost')
      and (c.phone is not null or c.email is not null)
      and not public.client_closed(c.id)
      -- a few days between two messages
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 3)
  loop
    -- the clients there before the lanes: their paths start spread over a month, not all on one day
    start := coalesce(client.class_since, now() - make_interval(days => ((hashtext(client.id::text)::bigint % 30 + 30) % 30)::int))::date;
    start := start + 30 * ((today - start) / 30);
    buyer := client.types && array['buyer', 'investor', 'tenant'];
    done_today := false;
    if not exists (select 1 from public.client_news x where x.client_id = client.id and x.kind = 'warm_analysis' and x.created_on >= start) then
      select * into market from public.client_market(client.id, today);
      if market.area is not null then
        insert into public.client_news (organization_id, client_id, kind, data)
        values (client.organization_id, client.id, 'warm_analysis',
          jsonb_strip_nulls(jsonb_build_object('area', market.area, 'sqm', market.sqm, 'listings', market.listings, 'change', market.change)))
        on conflict do nothing;
        done_today := found;
      end if;
    end if;
    if not done_today and today >= start + 13 and rate_now.rate is not null
       and not exists (select 1 from public.client_news x where x.client_id = client.id and x.kind = 'warm_rates' and x.created_on >= start) then
      insert into public.client_news (organization_id, client_id, kind, data)
      values (client.organization_id, client.id, 'warm_rates',
        jsonb_strip_nulls(jsonb_build_object('role', case when buyer then 'buyer' else 'owner' end,
          'rate', rate_now.rate, 'rateMonth', to_char(rate_now.month, 'YYYY-MM'), 'rateBefore', rate_before)))
      on conflict do nothing;
      done_today := found;
    end if;
    if not done_today and today >= start + 29
       and not exists (select 1 from public.client_news x where x.client_id = client.id and x.kind = 'warm_call' and x.created_on >= start) then
      insert into public.client_news (organization_id, client_id, kind, data)
      values (client.organization_id, client.id, 'warm_call',
        jsonb_strip_nulls(jsonb_build_object('rate', rate_now.rate)))
      on conflict do nothing;
      done_today := found;
    end if;
    if done_today then
      made := made + 1;
    end if;
  end loop;

  -- ---- C (the sphere and past clients too): a useful tip once a month
  insert into public.client_news (organization_id, client_id, kind, data)
  select c.organization_id, c.id, 'tips', jsonb_build_object('month', to_char(today, 'YYYY-MM'))
  from public.clients c
  where c.client_class = 'C' and c.responsible_broker_id is not null and c.stage <> 'lost'
    and (c.phone is not null or c.email is not null)
    and not public.client_closed(c.id)
    and not exists (select 1 from public.client_news x where x.client_id = c.id and x.kind = 'tips' and x.created_on >= date_trunc('month', today)::date)
    and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 3)
  on conflict do nothing;

  -- ---- six months without an answer, though the broker kept in touch: the break-up
  insert into public.client_news (organization_id, client_id, kind, data)
  select c.organization_id, c.id, 'breakup', '{}'::jsonb
  from public.clients c
  where c.responsible_broker_id is not null and c.stage not in ('deal', 'lost')
    and (c.phone is not null or c.email is not null)
    and c.created_at < now() - interval '180 days'
    and coalesce(public.client_last_reply(c.id), c.created_at) < now() - interval '180 days'
    and exists (
      select 1 from public.activities a
      where a.client_id = c.id and a.type in ('call', 'message', 'email') and a.occurred_at > now() - interval '180 days'
    )
    and not exists (select 1 from public.client_news x where x.client_id = c.id and x.kind = 'breakup' and x.created_on > today - 180)
    and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on = today)
  on conflict do nothing;

  -- all of today's lane messages, one notification each broker
  if exists (
    select 1 from public.client_news n
    where n.created_on = today and n.kind in ('warm_analysis', 'warm_rates', 'warm_call', 'tips', 'breakup')
  ) then
    perform public.tell_market_news(today, 'lanes');
  end if;
  return (select count(*)::int from public.client_news n
          where n.created_on = today and n.kind in ('warm_analysis', 'warm_rates', 'warm_call', 'tips', 'breakup'));
end;
$$;

-- ---------------------------------------------------------------------
-- Holidays: drop by with a small present (lane C, the sphere, past clients)
-- ---------------------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_occasion_check;
alter table public.tasks add constraint tasks_occasion_check
  check (occasion is null or occasion in ('birthday', 'anniversary', 'marketing', 'holiday'));

-- Orthodox Easter (the Julian date, moved to the Gregorian calendar: 1900–2099).
create or replace function public.orthodox_easter(year int)
returns date
language sql
immutable
as $$
  with v as (
    select (19 * (year % 19) + 15) % 30 as d, year % 4 as a, year % 7 as b
  ), w as (
    select d, (2 * a + 4 * b - d + 34) % 7 as e from v
  )
  select make_date(year, ((d + e + 114) / 31)::int, (((d + e + 114) % 31) + 1)::int) + 13
  from w;
$$;

create or replace function public.make_holiday_tasks(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from today);
  holiday record;
  person record;
  made int := 0;
begin
  for holiday in
    select * from (values
      ('Баба Марта', make_date(y, 3, 1), 'мартеничка'),
      ('Великден', public.orthodox_easter(y), 'шоколадово яйце или козунак'),
      ('Коледа', make_date(y, 12, 25), 'малък коледен подарък')
    ) as h(name, day, present)
  loop
    -- three days before, once
    if today <> holiday.day - 3 then
      continue;
    end if;
    for person in
      select c.organization_id, c.responsible_broker_id as broker, count(*)::int as n,
        string_agg(c.full_name || coalesce(' (' || c.phone || ')', ''), ', ' order by c.full_name) as names
      from public.clients c
      where c.responsible_broker_id is not null and c.stage <> 'lost'
        and (c.client_class = 'C'
             or exists (select 1 from public.contact_programs p where p.client_id = c.id and p.status = 'active' and p.program in ('sphere', 'after_deal')))
        and not public.client_closed(c.id)
      group by c.organization_id, c.responsible_broker_id
    loop
      if exists (select 1 from public.tasks t where t.assigned_to = person.broker and t.occasion = 'holiday' and t.due_date = holiday.day - 1) then
        continue;
      end if;
      insert into public.tasks (organization_id, assigned_to, created_by, title, type, due_date, description, occasion)
      values (
        person.organization_id, person.broker, null,
        left(holiday.name || ': малък подарък за ' || person.n || ' клиенти', 200),
        'meeting', holiday.day - 1,
        left('Кратко посещение или ' || holiday.present || ' — за да ви помнят, когато потрябва брокер. '
          || 'Клиенти: ' || person.names, 2000),
        'holiday'
      );
      made := made + 1;
    end loop;
  end loop;
  return made;
end;
$$;

-- Every morning: the market's news, the lanes' paths, the holidays.
create or replace function public.make_market_news()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.sofia_today();
begin
  return public.make_rate_news(today) + public.make_price_news(today) + public.make_monthly_news(today)
    + public.make_lane_news(today) + public.make_holiday_tasks(today);
end;
$$;

-- ---------------------------------------------------------------------
-- Speed to lead: a listing on the market (or cheaper) that fits a hot client
-- ---------------------------------------------------------------------
create table public.listing_events (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties (id) on delete cascade,
  kind text not null check (kind in ('new', 'cheaper')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create index listing_events_waiting_idx on public.listing_events (created_at) where handled_at is null;

alter table public.listing_events enable row level security;

-- who was told about which listing (once)
create table public.lead_alerts (
  client_id uuid not null references public.clients (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (client_id, property_id, kind)
);

alter table public.lead_alerts enable row level security;

create or replace function public.note_listing_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- not the samples, not a bulk import
  if new.sample or coalesce(current_setting('brixa.importing', true), '') = 'on' then
    return new;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    insert into public.listing_events (property_id, kind) values (new.id, 'new');
  elsif tg_op = 'UPDATE' and new.status = 'active' and new.currency = old.currency
        and new.current_price < old.current_price then
    insert into public.listing_events (property_id, kind) values (new.id, 'cheaper');
  end if;
  return new;
end;
$$;

revoke execute on function public.note_listing_event() from public, anon, authenticated;

create trigger properties_listing_event
  after insert or update of status, current_price on public.properties
  for each row execute function public.note_listing_event();

-- Does a listing fit a client's search? (as the app's matching: the budget may be 10% over)
create or replace function public.listing_fits(target_property uuid, target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties p
    join public.client_searches s on s.client_id = target_client
    where p.id = target_property
      and p.operation_type = s.operation
      and (cardinality(s.subtype_ids) = 0 or p.subtype_id = any (s.subtype_ids))
      and (cardinality(s.settlement_ids) = 0 or p.settlement_id = any (s.settlement_ids))
      -- neighbourhoods picked in the listing's town: it must be in one of them
      and (not exists (select 1 from public.geo_neighborhoods nb where nb.id = any (s.neighborhood_ids) and nb.settlement_id = p.settlement_id)
           or p.neighborhood_id = any (s.neighborhood_ids))
      and (cardinality(s.feature_ids) = 0 or not exists (
            select 1 from unnest(s.feature_ids) f(id)
            where not exists (select 1 from public.property_feature_values v where v.property_id = p.id and v.feature_id = f.id)))
      and (s.budget_max is null or p.current_price is null
           or (p.currency = s.currency and p.current_price <= s.budget_max * 1.1)
           or (p.currency in ('EUR', 'BGN') and s.currency in ('EUR', 'BGN')
               and public.to_eur(p.current_price, p.currency) <= public.to_eur(s.budget_max, s.currency) * 1.1)
           or (p.currency <> s.currency and not (p.currency in ('EUR', 'BGN') and s.currency in ('EUR', 'BGN'))))
      and (p.area is null or ((s.area_min is null or p.area >= s.area_min) and (s.area_max is null or p.area <= s.area_max)))
      and (p.rooms is null or ((s.rooms_min is null or p.rooms >= s.rooms_min) and (s.rooms_max is null or p.rooms <= s.rooms_max)))
  );
$$;

-- Every minute: the listings that came on the market or got cheaper (a minute ago, so their
-- extras are saved too) → the hot clients they fit → their brokers, at once.
create or replace function public.speed_to_lead()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
  hit record;
  made int := 0;
begin
  for ev in
    select e.id, e.kind, p.id as property_id, p.organization_id, p.title, p.owner_client_id
    from public.listing_events e
    join public.properties p on p.id = e.property_id
    where e.handled_at is null and e.created_at < now() - interval '50 seconds' and p.status = 'active'
    order by e.created_at
    limit 50
  loop
    update public.listing_events set handled_at = now() where id = ev.id;
    for hit in
      select c.id, c.full_name, c.responsible_broker_id
      from public.clients c
      where c.organization_id = ev.organization_id and c.client_class = 'A'
        and c.responsible_broker_id is not null and c.stage not in ('deal', 'lost')
        and c.id is distinct from ev.owner_client_id
        and public.listing_fits(ev.property_id, c.id)
      order by c.updated_at desc
      limit 20
    loop
      insert into public.lead_alerts (client_id, property_id, kind) values (hit.id, ev.property_id, ev.kind)
      on conflict do nothing;
      if found then
        perform public.notify(
          ev.organization_id, hit.responsible_broker_id, null, 'speed_to_lead',
          jsonb_build_object('title', hit.full_name, 'property', ev.title, 'kind', ev.kind),
          '/clients/' || hit.id
        );
        made := made + 1;
      end if;
    end loop;
  end loop;
  -- what's done and old
  delete from public.listing_events where handled_at < now() - interval '7 days';
  -- a listing that never became active again: forget it after a day
  update public.listing_events set handled_at = now() where handled_at is null and created_at < now() - interval '1 day';
  return made;
end;
$$;

-- A push about a client (not only a task's) can call or Viber them straight from the phone.
create or replace function public.claim_push(target uuid, token uuid)
returns table (
  type text, data jsonb, link text, endpoint text, p256dh text, auth_key text, lang text,
  phone text, email text, waiting int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed record;
  contact_phone text;
  contact_email text;
begin
  update public.notifications n
  set pushed_at = now()
  where n.id = target and n.push_token = token and n.pushed_at is null
  returning n.recipient_id, n.type, n.data, n.link into claimed;

  if not found then return; end if;

  if claimed.link ~ '^/tasks/[0-9a-f-]{36}$' then
    select c.phone, c.email into contact_phone, contact_email
    from public.tasks t
    join public.clients c on c.id = t.client_id
    where t.id = substr(claimed.link, 8)::uuid
      and (
        c.responsible_broker_id = claimed.recipient_id
        or public.oversees_as(claimed.recipient_id, c.responsible_broker_id)
      );
  elsif claimed.link ~ '^/clients/[0-9a-f-]{36}$' then
    select c.phone, c.email into contact_phone, contact_email
    from public.clients c
    where c.id = substr(claimed.link, 10)::uuid
      and (
        c.responsible_broker_id = claimed.recipient_id
        or public.oversees_as(claimed.recipient_id, c.responsible_broker_id)
      );
  end if;

  return query
  select claimed.type, claimed.data, claimed.link, s.endpoint, s.p256dh, s.auth_key, s.lang,
    contact_phone, contact_email, public.waiting_for(claimed.recipient_id)
  from public.push_subscriptions s
  where s.profile_id = claimed.recipient_id;
end;
$$;

grant execute on function public.claim_push(uuid, uuid) to anon, authenticated;

revoke execute on function public.client_last_reply(uuid) from public, anon, authenticated;
revoke execute on function public.client_closed(uuid) from public, anon, authenticated;
revoke execute on function public.client_market(uuid, date) from public, anon, authenticated;
revoke execute on function public.tell_market_news(date, text) from public, anon, authenticated;
revoke execute on function public.make_monthly_news(date) from public, anon, authenticated;
revoke execute on function public.make_lane_news(date) from public, anon, authenticated;
revoke execute on function public.make_holiday_tasks(date) from public, anon, authenticated;
revoke execute on function public.make_market_news() from public, anon, authenticated;
revoke execute on function public.listing_fits(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.speed_to_lead() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-speed-to-lead', '* * * * *', 'select public.speed_to_lead()');
  end if;
end;
$$;
