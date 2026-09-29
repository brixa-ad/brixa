-- =====================================================================
-- BRIXA — migration 030: personal data and yearly greetings
--   • a client's ЕГН and ID card number (for contracts) — only the
--     client's broker and the managers see them
--   • every morning: a task to greet each client on their birthday, and on
--     each anniversary of buying their home through us (with how much the
--     home has grown in value, from the market data)
-- Run once in Supabase → SQL Editor → New query → Run (after 029).
-- =====================================================================

create table public.client_identity (
  client_id uuid primary key references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  egn text check (egn is null or egn ~ '^[0-9]{10}$'),
  id_card text check (id_card is null or id_card ~ '^[A-Za-z0-9]{5,20}$'),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.client_identity enable row level security;

-- the client's broker and the managers — nobody else, ever
create policy "identity: read" on public.client_identity
  for select to authenticated
  using (public.can_view_client(client_id));

create policy "identity: create" on public.client_identity
  for insert to authenticated
  with check (
    public.can_view_client(client_id)
    and exists (select 1 from public.clients c where c.id = client_identity.client_id and c.organization_id = client_identity.organization_id)
  );

create policy "identity: update" on public.client_identity
  for update to authenticated
  using (public.can_view_client(client_id))
  with check (
    public.can_view_client(client_id)
    and exists (select 1 from public.clients c where c.id = client_identity.client_id and c.organization_id = client_identity.organization_id)
  );

create policy "identity: delete" on public.client_identity
  for delete to authenticated
  using (public.can_view_client(client_id));

-- ---------------------------------------------------------------------
-- Greeting tasks: a birthday, or the anniversary of a purchase (the deal)
-- ---------------------------------------------------------------------
alter table public.tasks
  add column occasion text check (occasion is null or occasion in ('birthday', 'anniversary')),
  add column anniversary_of uuid references public.deals (id) on delete cascade;

create unique index tasks_occasion_once on public.tasks (client_id, occasion, due_date) where occasion is not null;

-- How much a home bought through us is worth now, from the market data:
-- the agency's sales in the area (3 or more), else the market reference / listings.
create or replace function public.purchase_growth(target_deal uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d public.deals;
  p public.properties;
  facts jsonb;
  bought numeric;
  now_sqm numeric;
begin
  select * into d from public.deals where id = target_deal;
  if d.id is null or d.property_id is null or d.price is null or d.price <= 0 then return null; end if;
  select * into p from public.properties where id = d.property_id;
  if p.id is null or coalesce(p.area, 0) <= 0 then return null; end if;

  facts := public.market_facts(p.id);
  if facts is null then return null; end if;
  now_sqm := case
    when coalesce((facts -> 'sold' ->> 'count')::int, 0) >= 3 then (facts -> 'sold' ->> 'median_sqm')::numeric
    else (facts -> 'benchmark' ->> 'sqm')::numeric
  end;
  bought := public.to_eur(d.price, d.currency) / p.area;
  if now_sqm is null or bought is null or bought <= 0 then return null; end if;

  return jsonb_build_object(
    'growth', round(now_sqm / bought - 1, 4),
    'value', round(now_sqm * p.area, -2),
    'bought', round(public.to_eur(d.price, d.currency), -2)
  );
end;
$$;

revoke execute on function public.purchase_growth(uuid) from public, anon, authenticated;

-- The anniversary card, for whoever may see the deal.
create or replace function public.anniversary_card(target_deal uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'client', c.full_name,
    'closed_on', d.closed_on,
    'title', p.title,
    'area', p.area,
    'place', concat_ws(', ', n.name, s.settlement_type || ' ' || s.name),
    'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
    'market', public.purchase_growth(d.id),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = d.broker_id
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = d.organization_id
    )
  )
  from public.deals d
  left join public.clients c on c.id = d.client_id
  left join public.properties p on p.id = d.property_id
  left join public.geo_settlements s on s.id = p.settlement_id
  left join public.geo_neighborhoods n on n.id = p.neighborhood_id
  where d.id = target_deal and d.status = 'won' and public.can_view_deal(d.id);
$$;

grant execute on function public.anniversary_card(uuid) to authenticated;
revoke execute on function public.anniversary_card(uuid) from anon;

-- Once a day (from 06:00): today's birthdays and purchase anniversaries become the brokers' tasks,
-- each with a ready greeting.
create table public.greeting_runs (
  day date primary key
);
alter table public.greeting_runs enable row level security;
-- no policies: only the job writes it

create or replace function public.create_greeting_tasks(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  m int := extract(month from today);
  dd int := extract(day from today);
  -- 29 February birthdays and anniversaries are kept on the 28th in other years
  leap_late boolean := m = 2 and dd = 28 and extract(day from (make_date(extract(year from today)::int, 3, 1) - 1)) = 28;
  made integer := 0;
  n integer;
begin
  if local_now::time < time '06:00' then return 0; end if;
  insert into public.greeting_runs (day) values (today) on conflict do nothing;
  if not found then return 0; end if;

  insert into public.tasks (organization_id, assigned_to, created_by, title, type, client_id, due_date, description, occasion)
  select c.organization_id, c.responsible_broker_id, c.responsible_broker_id,
    left('Рожден ден: ' || c.full_name, 200), 'message', c.id, today,
    'Здравейте, ' || split_part(btrim(c.full_name), ' ', 1) || '! Честит рожден ден! Бъдете здрави и нека новата година Ви донесе много щастие! '
      || public.person_name(c.responsible_broker_id),
    'birthday'
  from public.clients c
  join public.organization_members mem on mem.organization_id = c.organization_id and mem.profile_id = c.responsible_broker_id
  where c.birth_month = m and (c.birth_day = dd or (leap_late and c.birth_day = 29))
  on conflict (client_id, occasion, due_date) where occasion is not null do nothing;
  get diagnostics n = row_count;
  made := made + n;

  insert into public.tasks (organization_id, assigned_to, created_by, title, type, client_id, property_id, due_date, description, occasion, anniversary_of)
  select d.organization_id, d.broker_id, d.broker_id,
    left('Годишнина от покупката: ' || c.full_name || ' (' || y.years || ' г.)', 200), 'message', c.id, d.property_id, today,
    'Здравейте, ' || split_part(btrim(c.full_name), ' ', 1) || '! Днес '
      || case when y.years = 1 then 'се навършва една година' else 'се навършват ' || y.years || ' години' end
      || ' от покупката на Вашия имот'
      || coalesce(' в ' || nullif(concat_ws(', ', nb.name, st.settlement_type || ' ' || st.name), ''), '')
      || '. Честита годишнина! '
      || case when (g.info ->> 'growth')::numeric >= 0.01
           then 'По нашите пазарни данни стойността му е нараснала с около ' || round((g.info ->> 'growth')::numeric * 100) || '%. '
           else '' end
      || 'Благодаря Ви за доверието — ако мога да помогна с нещо, аз съм насреща. '
      || public.person_name(d.broker_id),
    'anniversary', d.id
  from public.deals d
  join public.clients c on c.id = d.client_id
  join public.organization_members mem on mem.organization_id = d.organization_id and mem.profile_id = d.broker_id
  left join public.properties pr on pr.id = d.property_id
  left join public.geo_settlements st on st.id = pr.settlement_id
  left join public.geo_neighborhoods nb on nb.id = pr.neighborhood_id
  cross join lateral (select (extract(year from today) - extract(year from d.closed_on))::int as years) y
  cross join lateral (select public.purchase_growth(d.id) as info) g
  where d.status = 'won' and d.kind = 'sale' and d.closed_on < today
    and extract(month from d.closed_on) = m
    and (extract(day from d.closed_on) = dd or (leap_late and extract(day from d.closed_on) = 29))
    and y.years >= 1
  on conflict (client_id, occasion, due_date) where occasion is not null do nothing;
  get diagnostics n = row_count;
  made := made + n;

  return made;
end;
$$;

revoke execute on function public.create_greeting_tasks(timestamptz) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-greetings', '*/15 * * * *', 'select public.create_greeting_tasks()');
  end if;
end;
$$;
