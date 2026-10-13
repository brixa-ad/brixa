-- =====================================================================
-- BRIXA — migration 063: follow-up messages for the chosen clients, and a property's documents
--   • the messages BRIXA writes (the rates, the area's prices, the monthly note,
--     the lanes' steps, the tip, the break-up) are made only for the clients whose
--     follow-up the broker switched on — and they wait on the client's own page
--     (no longer in a list in Follow-up); the broker hears about each one
--   • the monthly note: for a seller or landlord every four weeks, and for a cold
--     client from the 15th
--   • a property's documents: its history in words, the cases (an inheritance, a
--     mortgage…), and a checklist of the documents a sale needs — which ones we
--     have, which must be obtained or are ordered; a file uploaded can be one of them
-- Run once in Supabase → SQL Editor → New query → Run (after 062).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Follow-up messages: only for the clients the broker chose
-- ---------------------------------------------------------------------
alter table public.clients add column auto_follow_up boolean not null default false;

-- the ones chosen for the monthly note already
update public.clients set auto_follow_up = true where monthly_news;

-- the messages waiting for clients nobody chose: gone (there's no list for them any more)
delete from public.client_news n
using public.clients c
where c.id = n.client_id and not c.auto_follow_up and n.sent_at is null and n.skipped_at is null;

-- every maker (the rates, the prices, the lanes…) writes only for the chosen clients
create or replace function public.client_news_only_followed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select c.auto_follow_up from public.clients c where c.id = new.client_id), false) then
    return null;
  end if;
  return new;
end;
$$;

create trigger client_news_only_followed
  before insert on public.client_news
  for each row execute function public.client_news_only_followed();

-- …and the client's broker hears about each message (not about the samples)
create or replace function public.tell_client_news()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  select cl.organization_id, cl.responsible_broker_id, cl.full_name, cl.sample into c
  from public.clients cl where cl.id = new.client_id;
  if c.responsible_broker_id is null or c.sample then
    return new;
  end if;
  perform public.notify(
    c.organization_id, c.responsible_broker_id, null, 'client_message',
    jsonb_build_object('title', c.full_name, 'kind', new.kind),
    '/clients/' || new.client_id
  );
  return new;
end;
$$;

create trigger client_news_tell
  after insert on public.client_news
  for each row execute function public.tell_client_news();

-- no more daily summaries pointing to the old list
create or replace function public.tell_market_news(today date, news_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- each message is told on its own now (tell_client_news)
  return;
end;
$$;

-- The monthly note: a seller or landlord every four weeks, a cold client from the 15th.
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
    where c.auto_follow_up
      and ((c.client_class = 'C' and extract(day from today) >= 15) or c.types && array['seller', 'landlord'])
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
  return made;
end;
$$;

create or replace function public.enrich_sample_data()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  done int := 0;
  rate_now record;
  rate_peak record;
  analysis record;
begin
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at limit 1;
  if org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- when, who decides, why — the lane follows the "when"
  update public.clients c
  set timeline = v.timeline, decider = v.decider, motive = v.motive, client_class = v.lane
  from (values
    ('Мария Иванова (пример)', 'now', 'partner', 'Иска да се нанесе до лятото', 'A'),
    ('Георги Петров (пример)', 'soon', 'partner', 'Второ дете — тясно им е', 'B'),
    ('Елена Димитрова (пример)', 'now', 'alone', 'Започва нова работа наблизо', 'A'),
    ('Николай Стоянов (пример)', 'later', 'alone', 'Инвестиция за отдаване под наем', 'C'),
    ('Иван Колев (пример)', 'now', 'partner', 'Купили са къща и трябва да продадат', 'A'),
    ('Десислава Тодорова (пример)', 'soon', 'alone', 'Сменя наемателите', 'B'),
    ('Петър Василев (пример)', 'soon', 'others', 'Наследство — решават заедно с братята', 'B'),
    ('Анна Георгиева (пример)', 'later', 'alone', 'Още разглежда', 'C')
  ) as v(name, timeline, decider, motive, lane)
  where c.organization_id = org and c.sample and c.full_name = v.name;
  get diagnostics done = row_count;

  -- how the buyers pay
  insert into public.client_financing (client_id, loan, own_funds, bank_amount, bank_referred, bank_name)
  select c.id, v.loan, v.own, v.bank, v.referred, v.bank_name
  from public.clients c
  join (values
    ('Мария Иванова (пример)', 'approved', 40000::numeric, 110000::numeric, true, 'Банка ДСК'),
    ('Георги Петров (пример)', 'applying', 30000::numeric, 150000::numeric, false, null),
    ('Николай Стоянов (пример)', 'none', 90000::numeric, null::numeric, false, null)
  ) as v(name, loan, own, bank, referred, bank_name) on v.name = c.full_name
  where c.organization_id = org and c.sample
  on conflict (client_id) do nothing;

  -- the clients whose follow-up is on, and a few ready messages on their pages
  update public.clients c
  set auto_follow_up = true
  where c.organization_id = org and c.sample
    and c.full_name in ('Мария Иванова (пример)', 'Георги Петров (пример)', 'Анна Георгиева (пример)');
  select m.month, m.rate into rate_now from public.mortgage_rates m order by m.month desc limit 1;
  if found then
    select m.month, m.rate into rate_peak from public.mortgage_rates m
    where m.month < rate_now.month and m.month >= (rate_now.month - interval '12 months')::date
    order by m.rate desc, m.month desc limit 1;
    if found and rate_peak.rate > rate_now.rate then
      insert into public.client_news (organization_id, client_id, kind, data)
      select org, c.id, 'rates',
        jsonb_build_object('from', rate_peak.rate, 'fromMonth', to_char(rate_peak.month, 'YYYY-MM'),
                           'to', rate_now.rate, 'toMonth', to_char(rate_now.month, 'YYYY-MM'))
      from public.clients c
      where c.organization_id = org and c.sample and c.full_name = 'Мария Иванова (пример)'
      on conflict do nothing;
    end if;
  end if;

  -- the warm buyer's area: the samples' own listings there
  select nb.name as area, round(avg(p.current_price / nullif(p.area, 0))) as sqm, count(*)::int as listings
  into analysis
  from public.properties p
  join public.geo_neighborhoods nb on nb.id = p.neighborhood_id
  where p.organization_id = org and p.sample and p.operation_type = 'sale' and p.area > 0
  group by nb.name
  order by count(*) desc, nb.name
  limit 1;
  if analysis.area is not null then
    insert into public.client_news (organization_id, client_id, kind, data)
    select org, c.id, 'warm_analysis', jsonb_build_object('area', analysis.area, 'sqm', analysis.sqm)
    from public.clients c
    where c.organization_id = org and c.sample and c.full_name = 'Георги Петров (пример)'
    on conflict do nothing;
  end if;

  insert into public.client_news (organization_id, client_id, kind, data)
  select org, c.id, 'tips', jsonb_build_object('month', to_char(public.sofia_today(), 'YYYY-MM'))
  from public.clients c
  where c.organization_id = org and c.sample and c.full_name = 'Анна Георгиева (пример)'
  on conflict do nothing;

  return done;
end;
$$;

revoke execute on function public.client_news_only_followed() from public, anon, authenticated;
revoke execute on function public.tell_client_news() from public, anon, authenticated;
revoke execute on function public.tell_market_news(date, text) from public, anon, authenticated;
revoke execute on function public.make_monthly_news(date) from public, anon, authenticated;
revoke execute on function public.enrich_sample_data() from public, anon;
grant execute on function public.enrich_sample_data() to authenticated;

-- ---------------------------------------------------------------------
-- A property's documents: its history, the cases, the checklist
-- ---------------------------------------------------------------------
create table public.property_dossiers (
  property_id uuid primary key references public.properties (id) on delete cascade,
  -- inheritance, new_build, house_land, mortgage, buyer_loan, spouse, proxy
  cases text[] not null default '{}',
  -- the property's history in words: how the owners got it, inheritances, mortgages, works…
  history text check (history is null or char_length(history) <= 10000),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

create trigger property_dossiers_touch_updated_at before update on public.property_dossiers
  for each row execute function public.touch_updated_at();

alter table public.property_dossiers enable row level security;
create policy "property dossiers: read" on public.property_dossiers
  for select to authenticated using (public.can_edit_property(property_id));
create policy "property dossiers: add" on public.property_dossiers
  for insert to authenticated with check (public.can_edit_property(property_id));
create policy "property dossiers: change" on public.property_dossiers
  for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));

-- each document of the checklist: we have it, it must be obtained, it's ordered, or it doesn't apply
create table public.property_doc_status (
  property_id uuid not null references public.properties (id) on delete cascade,
  doc_code text not null references public.sale_docs (code) on delete cascade,
  status text not null check (status in ('have', 'need', 'ordered', 'na')),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (property_id, doc_code)
);

create trigger property_doc_status_touch_updated_at before update on public.property_doc_status
  for each row execute function public.touch_updated_at();

alter table public.property_doc_status enable row level security;
create policy "property doc status: read" on public.property_doc_status
  for select to authenticated using (public.can_edit_property(property_id));
create policy "property doc status: add" on public.property_doc_status
  for insert to authenticated with check (public.can_edit_property(property_id));
create policy "property doc status: change" on public.property_doc_status
  for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
create policy "property doc status: remove" on public.property_doc_status
  for delete to authenticated using (public.can_edit_property(property_id));

-- a file uploaded can be one of the checklist's documents
alter table public.property_documents
  add column doc_code text references public.sale_docs (code) on delete set null;

create policy "property documents: change" on public.property_documents
  for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
