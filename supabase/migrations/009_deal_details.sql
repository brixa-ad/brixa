-- =====================================================================
-- BRIXA — migration 009: deal details (double-sided, other agency,
-- offers, stage dates + reminders, payments), bonuses, own bottom bar
-- Run once in Supabase → SQL Editor → New query → Run (after 008).
-- =====================================================================

-- ---------------------------------------------------------------------
-- The phone's bottom bar, in the order the user picked (null = default)
-- ---------------------------------------------------------------------
alter table public.profiles
  add column bottom_nav text[]
    check (bottom_nav is null or cardinality(bottom_nav) between 1 and 5);

-- ---------------------------------------------------------------------
-- What a broker wins for hitting the month's / the year's target
-- ---------------------------------------------------------------------
alter table public.broker_goals
  add column monthly_bonus text check (monthly_bonus is null or char_length(monthly_bonus) <= 200),
  add column yearly_bonus text check (yearly_bonus is null or char_length(yearly_bonus) <= 200);

-- ---------------------------------------------------------------------
-- Deal details
-- ---------------------------------------------------------------------
alter table public.deals
  -- both sides pay the agency: the seller (property's rate) and the buyer (buyer_rate)
  add column double_sided boolean not null default false,
  add column buyer_rate numeric(6, 2) check (buyer_rate is null or buyer_rate between 0 and 100),
  -- the other side of the deal is another agency
  add column partner_agency text check (partner_agency is null or char_length(partner_agency) <= 120),
  add column partner_broker text check (partner_broker is null or char_length(partner_broker) <= 120),
  add column partner_side text check (partner_side is null or partner_side in ('buyer', 'seller')),
  -- when each step happened, or is planned
  add column viewing_on date,
  add column offer_on date,
  add column deposit_on date,
  add column preliminary_on date,
  add column notary_on date,
  -- money the buyer pays along the way
  add column deposit_amount numeric(14, 2) check (deposit_amount is null or deposit_amount >= 0),
  add column preliminary_bank numeric(14, 2) check (preliminary_bank is null or preliminary_bank >= 0),
  add column preliminary_cash numeric(14, 2) check (preliminary_cash is null or preliminary_cash >= 0),
  add column notary_bank numeric(14, 2) check (notary_bank is null or notary_bank >= 0),
  add column notary_cash numeric(14, 2) check (notary_cash is null or notary_cash >= 0);

-- Offers made on a deal (by the buyer, or through another agency)
create table public.deal_offers (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN', 'USD')),
  offered_by text not null check (char_length(offered_by) between 1 and 120),
  agency text check (agency is null or char_length(agency) <= 120),
  offered_on date not null default public.sofia_today(),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  note text check (note is null or char_length(note) <= 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index deal_offers_deal_idx on public.deal_offers (deal_id, offered_on desc);

-- Every stage / status change, for the statistics
create table public.deal_stage_log (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.deals (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  stage text not null,
  status text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index deal_stage_log_deal_idx on public.deal_stage_log (deal_id, changed_at);

-- Reminders already sent (internal)
create table public.deal_reminders (
  deal_id uuid not null references public.deals (id) on delete cascade,
  stage text not null,
  kind text not null check (kind in ('eve', 'day')),
  due date not null,
  primary key (deal_id, stage, kind, due)
);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.can_view_deal(target_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.deals d
    join public.organization_members m on m.organization_id = d.organization_id
    where d.id = target_deal
      and m.profile_id = auth.uid()
      and (m.role in ('owner', 'manager') or d.broker_id = auth.uid() or d.created_by = auth.uid())
  );
$$;

-- Managers: any deal. Brokers: their own, until a manager has confirmed it.
create or replace function public.can_edit_deal(target_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.deals d
    join public.organization_members m on m.organization_id = d.organization_id
    where d.id = target_deal
      and m.profile_id = auth.uid()
      and (m.role in ('owner', 'manager') or (d.broker_id = auth.uid() and d.confirmed_at is null))
  );
$$;

-- ---------------------------------------------------------------------
-- Deal triggers
-- ---------------------------------------------------------------------

-- As before, plus: reaching a stage stamps its date (a planned date in the future becomes today).
create or replace function public.guard_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  manager boolean;
  today date := public.sofia_today();
begin
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.created_by := old.created_by;
  end if;
  manager := auth.uid() is null or public.is_org_manager(new.organization_id);

  if tg_op = 'UPDATE' then
    if not manager then
      if old.confirmed_at is not null then raise exception 'deal_confirmed'; end if;
      new.broker_id := old.broker_id;
    end if;
  end if;

  if new.status = 'won' then
    new.stage := 'notary';
    new.closed_on := coalesce(new.closed_on, today);
    new.lost_reason := null;
  elsif new.status = 'open' then
    new.closed_on := null;
    new.lost_reason := null;
  end if;

  if tg_op = 'INSERT' or new.stage is distinct from old.stage or new.status is distinct from old.status then
    if new.stage = 'offer' and (new.offer_on is null or new.offer_on > today) then
      new.offer_on := today;
    elsif new.stage = 'deposit' and (new.deposit_on is null or new.deposit_on > today) then
      new.deposit_on := today;
    elsif new.stage = 'preliminary' and (new.preliminary_on is null or new.preliminary_on > today) then
      new.preliminary_on := today;
    elsif new.stage = 'notary' and new.status = 'won' then
      new.notary_on := new.closed_on;
    end if;
  end if;

  if new.status <> 'won' then
    new.confirmed_at := null;
    new.confirmed_by := null;
  elsif not manager then
    new.confirmed_at := null;
    new.confirmed_by := null;
  elsif tg_op = 'INSERT' or old.status <> 'won' then
    new.confirmed_at := now();
    new.confirmed_by := auth.uid();
  elsif new.confirmed_at is not null and old.confirmed_at is null then
    new.confirmed_at := now();
    new.confirmed_by := auth.uid();
  elsif new.confirmed_at is null then
    new.confirmed_by := null;
  else
    new.confirmed_at := old.confirmed_at;
    new.confirmed_by := old.confirmed_by;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.log_deal_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage or new.status is distinct from old.status then
    insert into public.deal_stage_log (deal_id, organization_id, stage, status, changed_by)
    values (new.id, new.organization_id, new.stage, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger deals_log_stage
  after insert or update of stage, status on public.deals
  for each row execute function public.log_deal_stage();

-- ---------------------------------------------------------------------
-- Upcoming steps → reminders (run by a schedule every 15 minutes)
--   • the evening before (from 18:00): the broker
--   • on the day (from 08:00): the broker and the managers
-- Only steps still ahead (the viewing while the deal is at "viewing", the notary while it is at "notary").
-- ---------------------------------------------------------------------
create or replace function public.notify_deal_dates(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  stages text[] := array['viewing', 'offer', 'deposit', 'preliminary', 'notary'];
  item record;
  manager record;
  reminder text;
  sent integer := 0;
begin
  for item in
    select d.id, d.organization_id, d.broker_id, d.kind, s.stage, s.due,
      coalesce(p.title, c.full_name, '') as label
    from public.deals d
    cross join lateral (values
      ('viewing', d.viewing_on), ('offer', d.offer_on), ('deposit', d.deposit_on),
      ('preliminary', d.preliminary_on), ('notary', d.notary_on)
    ) as s (stage, due)
    left join public.properties p on p.id = d.property_id
    left join public.clients c on c.id = d.client_id
    where d.status = 'open'
      and d.broker_id is not null
      and s.due is not null
      and (
        array_position(stages, s.stage) > array_position(stages, d.stage)
        or (s.stage = d.stage and s.stage in ('viewing', 'notary'))
      )
      and (
        (s.due = today + 1 and local_now::time >= time '18:00')
        or (s.due = today and local_now::time >= time '08:00')
      )
  loop
    reminder := case when item.due = today then 'day' else 'eve' end;

    insert into public.deal_reminders (deal_id, stage, kind, due)
    values (item.id, item.stage, reminder, item.due)
    on conflict do nothing;
    if not found then continue; end if;

    perform public.notify(
      item.organization_id, item.broker_id, null,
      case reminder when 'day' then 'deal_date_today' else 'deal_date_tomorrow' end,
      jsonb_build_object('title', item.label, 'stage', item.stage, 'kind', item.kind),
      '/deals/' || item.id
    );

    if reminder = 'day' then
      for manager in
        select profile_id from public.organization_members
        where organization_id = item.organization_id
          and role in ('owner', 'manager')
          and profile_id <> item.broker_id
      loop
        perform public.notify(
          item.organization_id, manager.profile_id, item.broker_id, 'deal_date_team',
          jsonb_build_object(
            'title', item.label, 'stage', item.stage, 'kind', item.kind,
            'actor', public.person_name(item.broker_id)
          ),
          '/deals/' || item.id
        );
      end loop;
    end if;

    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke execute on function public.notify_deal_dates(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- The ranking: a double-sided deal is worth the most
--   double deal 50 · deal 30 · new listing 10 (+10 exclusive) · viewing 5
--   meeting 3 · new client 2 · call 1
-- ---------------------------------------------------------------------
create or replace function public.leaderboard(target_org uuid, period text default 'month', ref_day date default null)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  avatar_path text,
  commission numeric,
  deals integer,
  listings integer,
  exclusives integer,
  viewings integer,
  meetings integer,
  calls integer,
  new_clients integer,
  points integer
)
language sql
stable
security definer
set search_path = public
as $$
  with span as (
    select
      date_trunc(unit, day::timestamp)::date as from_day,
      (date_trunc(unit, day::timestamp) + ('1 ' || unit)::interval)::date as to_day
    from (
      select
        case when period = 'year' then 'year' else 'month' end as unit,
        coalesce(ref_day, public.sofia_today()) as day
    ) p
  ),
  bounds as (
    select from_day, to_day,
      from_day::timestamp at time zone 'Europe/Sofia' as from_ts,
      to_day::timestamp at time zone 'Europe/Sofia' as to_ts
    from span
  ),
  won as (
    select d.broker_id as pid, sum(d.commission) as total, count(*)::int as n,
      sum(case when d.double_sided then 50 else 30 end)::int as dp
    from public.deals d, bounds b
    where d.organization_id = target_org and d.status = 'won' and d.confirmed_at is not null
      and d.closed_on >= b.from_day and d.closed_on < b.to_day
    group by d.broker_id
  ),
  listed as (
    select p.responsible_broker_id as pid, count(*)::int as n,
      (count(*) filter (where p.exclusive_contract))::int as x
    from public.properties p, bounds b
    where p.organization_id = target_org and p.operation_type in ('sale', 'rent')
      and p.created_at >= b.from_ts and p.created_at < b.to_ts
    group by p.responsible_broker_id
  ),
  acts as (
    select a.profile_id as pid,
      (count(*) filter (where a.type = 'viewing'))::int as v,
      (count(*) filter (where a.type = 'meeting'))::int as m,
      (count(*) filter (where a.type = 'call'))::int as c
    from public.activities a, bounds b
    where a.organization_id = target_org and a.occurred_at >= b.from_ts and a.occurred_at < b.to_ts
    group by a.profile_id
  ),
  signed as (
    select c.responsible_broker_id as pid, count(*)::int as n
    from public.clients c, bounds b
    where c.organization_id = target_org and c.created_at >= b.from_ts and c.created_at < b.to_ts
    group by c.responsible_broker_id
  ),
  ranked as (
    select
      m.profile_id, pr.full_name, pr.email, pr.avatar_path,
      coalesce(won.total, 0) as commission,
      coalesce(won.n, 0) as deals,
      coalesce(listed.n, 0) as listings,
      coalesce(listed.x, 0) as exclusives,
      coalesce(acts.v, 0) as viewings,
      coalesce(acts.m, 0) as meetings,
      coalesce(acts.c, 0) as calls,
      coalesce(signed.n, 0) as new_clients,
      coalesce(won.dp, 0) as deal_points
    from public.organization_members m
    join public.profiles pr on pr.id = m.profile_id
    left join won on won.pid = m.profile_id
    left join listed on listed.pid = m.profile_id
    left join acts on acts.pid = m.profile_id
    left join signed on signed.pid = m.profile_id
    where m.organization_id = target_org and public.is_org_member(target_org)
  )
  select r.profile_id, r.full_name, r.email, r.avatar_path, r.commission, r.deals, r.listings,
    r.exclusives, r.viewings, r.meetings, r.calls, r.new_clients,
    (r.deal_points + r.listings * 10 + r.exclusives * 10 + r.viewings * 5
      + r.meetings * 3 + r.new_clients * 2 + r.calls)::int as points
  from ranked r
  order by r.commission desc, points desc, r.full_name;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.deal_offers enable row level security;
alter table public.deal_stage_log enable row level security;
alter table public.deal_reminders enable row level security;

create policy "deal offers: read" on public.deal_offers
  for select to authenticated using (public.can_view_deal(deal_id));
create policy "deal offers: create" on public.deal_offers
  for insert to authenticated
  with check (created_by = auth.uid() and public.can_edit_deal(deal_id));
create policy "deal offers: update" on public.deal_offers
  for update to authenticated
  using (public.can_edit_deal(deal_id)) with check (public.can_edit_deal(deal_id));
create policy "deal offers: delete" on public.deal_offers
  for delete to authenticated using (public.can_edit_deal(deal_id));

create policy "deal stage log: read" on public.deal_stage_log
  for select to authenticated using (public.can_view_deal(deal_id));

-- deal_reminders: no policies — only the reminder job writes it

-- ---------------------------------------------------------------------
-- Schedule the reminders (needs Integrations → Cron, enabled with 007)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-deal-dates', '*/15 * * * *', 'select public.notify_deal_dates()');
  end if;
end;
$$;
