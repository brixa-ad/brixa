-- =====================================================================
-- BRIXA — migration 008: deals, commission, goals and the ranking
-- Run once in Supabase → SQL Editor → New query → Run (after 006/007).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Commission defaults (agency), per property, and a broker's work week
-- ---------------------------------------------------------------------
alter table public.organizations
  add column commission_sale_percent numeric(5, 2) not null default 3
    check (commission_sale_percent between 0 and 100),
  add column commission_rent_months numeric(4, 2) not null default 1
    check (commission_rent_months between 0 and 24);

-- Sale: % of the price. Rent: months of rent. Empty = the agency default.
alter table public.properties
  add column commission_rate numeric(6, 2)
    check (commission_rate is null or commission_rate between 0 and 100);

-- For "what one hour of your time is worth".
alter table public.profiles
  add column weekly_hours numeric(4, 1) not null default 40
    check (weekly_hours between 1 and 100);

-- ---------------------------------------------------------------------
-- Deals: a property + a buyer / tenant, moving through the stages
-- ---------------------------------------------------------------------
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- the broker the whole commission counts for
  broker_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,

  kind text not null default 'sale' check (kind in ('sale', 'rent')),
  stage text not null default 'viewing'
    check (stage in ('viewing', 'offer', 'deposit', 'preliminary', 'notary')),
  status text not null default 'open' check (status in ('open', 'won', 'lost')),

  price numeric(14, 2) check (price is null or price >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN', 'USD')),
  -- in euro: expected while open, the real amount once won
  commission numeric(12, 2) check (commission is null or commission >= 0),
  closed_on date,

  -- a broker's commission counts in the ranking once a manager confirms it
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,

  lost_reason text check (lost_reason is null or char_length(lost_reason) <= 500),
  notes text check (notes is null or char_length(notes) <= 5000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deals_rent_stages check (kind = 'sale' or stage <> 'preliminary'),
  constraint deals_won_needs_amount check (status <> 'won' or (commission is not null and closed_on is not null)),
  constraint deals_confirm_only_won check (confirmed_at is null or status = 'won')
);

create index deals_org_idx on public.deals (organization_id, status, closed_on);
create index deals_broker_idx on public.deals (broker_id, status);
create index deals_property_idx on public.deals (property_id);
create index deals_client_idx on public.deals (client_id);

-- ---------------------------------------------------------------------
-- Goals the manager sets for each broker
-- ---------------------------------------------------------------------
create table public.broker_goals (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  daily_calls int not null default 0 check (daily_calls between 0 and 500),
  daily_viewings int not null default 0 check (daily_viewings between 0 and 100),
  daily_listings int not null default 0 check (daily_listings between 0 and 100),
  -- commission in euro
  monthly_target numeric(12, 2) not null default 0 check (monthly_target >= 0),
  yearly_target numeric(12, 2) not null default 0 check (yearly_target >= 0),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Confirmed commission of one broker in the month of ref_day.
create or replace function public.month_commission(target_org uuid, target_profile uuid, ref_day date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(commission), 0)
  from public.deals
  where organization_id = target_org
    and broker_id = target_profile
    and status = 'won'
    and confirmed_at is not null
    and closed_on >= date_trunc('month', ref_day::timestamp)::date
    and closed_on < (date_trunc('month', ref_day::timestamp) + interval '1 month')::date;
$$;

revoke execute on function public.month_commission(uuid, uuid, date) from public, anon, authenticated;

-- A deal that went back or away: work out the property's status again from its deals.
create or replace function public.refresh_property_status(target_property uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  won_kind text;
begin
  select kind into won_kind from public.deals
  where property_id = target_property and status = 'won'
  order by closed_on desc limit 1;

  if won_kind is not null then
    update public.properties set status = case won_kind when 'rent' then 'rented' else 'sold' end
    where id = target_property;
  elsif exists (
    select 1 from public.deals
    where property_id = target_property and status = 'open' and stage in ('deposit', 'preliminary', 'notary')
  ) then
    update public.properties set status = 'reserved'
    where id = target_property and status in ('active', 'sold', 'rented');
  else
    update public.properties set status = 'active'
    where id = target_property and status in ('reserved', 'sold', 'rented');
  end if;
end;
$$;

revoke execute on function public.refresh_property_status(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Deal triggers
-- ---------------------------------------------------------------------

-- Brokers run their deals; confirming the commission is the manager's.
create or replace function public.guard_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  manager boolean;
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
    new.closed_on := coalesce(new.closed_on, public.sofia_today());
    new.lost_reason := null;
  elsif new.status = 'open' then
    new.closed_on := null;
    new.lost_reason := null;
  end if;

  if new.status <> 'won' then
    new.confirmed_at := null;
    new.confirmed_by := null;
  elsif not manager then
    -- a broker's own closing waits for a manager
    new.confirmed_at := null;
    new.confirmed_by := null;
  elsif tg_op = 'INSERT' or old.status <> 'won' then
    -- a manager closing a deal confirms it at the same time
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

create trigger deals_guard
  before insert or update on public.deals
  for each row execute function public.guard_deal();

-- The property, the client, the managers and the team follow the deal.
create or replace function public.on_deal_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 2 = sold / rented, 1 = holds a deposit, 0 = neither
  new_level int := 0;
  old_level int := 0;
  actor uuid;
  broker_name text;
  label text;
  after_total numeric;
  before_total numeric;
  member record;
  stage_order text[] := array['new_contact', 'called', 'presentation', 'viewing', 'negotiation', 'deposit', 'deal'];
  client_stage text;
begin
  if tg_op <> 'INSERT' then
    old_level := case
      when old.status = 'won' then 2
      when old.status = 'open' and old.stage in ('deposit', 'preliminary', 'notary') then 1
      else 0 end;
  end if;

  if tg_op = 'DELETE' then
    if old.property_id is not null and old_level > 0 then
      perform public.refresh_property_status(old.property_id);
    end if;
    return old;
  end if;

  actor := coalesce(auth.uid(), new.broker_id);
  new_level := case
    when new.status = 'won' then 2
    when new.status = 'open' and new.stage in ('deposit', 'preliminary', 'notary') then 1
    else 0 end;

  -- property status

  if tg_op = 'UPDATE' and old.property_id is not null and old_level > 0
     and (old.property_id is distinct from new.property_id or new_level < old_level) then
    perform public.refresh_property_status(old.property_id);
  end if;

  if new.property_id is not null and new_level > 0
     and (tg_op = 'INSERT' or old.property_id is distinct from new.property_id or new_level > old_level) then
    if new_level = 2 then
      update public.properties set status = case new.kind when 'rent' then 'rented' else 'sold' end
      where id = new.property_id;
    else
      update public.properties set status = 'reserved'
      where id = new.property_id and status = 'active';
    end if;
  end if;

  -- the client's stage only moves forward
  if new.client_id is not null and new.status <> 'lost' then
    client_stage := case
      when new.status = 'won' then 'deal'
      when new.stage in ('deposit', 'preliminary', 'notary') then 'deposit'
      when new.stage = 'offer' then 'negotiation'
      else 'viewing' end;
    update public.clients set stage = client_stage
    where id = new.client_id
      and coalesce(array_position(stage_order, stage), 0) < array_position(stage_order, client_stage);
  end if;

  broker_name := public.person_name(new.broker_id);
  select coalesce(
    (select title from public.properties where id = new.property_id),
    (select full_name from public.clients where id = new.client_id),
    ''
  ) into label;

  -- a broker closed it → the managers confirm
  if new.status = 'won' and new.confirmed_at is null
     and (tg_op = 'INSERT' or old.status <> 'won') then
    for member in
      select profile_id from public.organization_members
      where organization_id = new.organization_id and role in ('owner', 'manager') and profile_id <> actor
    loop
      perform public.notify(
        new.organization_id, member.profile_id, actor, 'deal_to_confirm',
        jsonb_build_object('actor', broker_name, 'amount', new.commission, 'title', label),
        '/deals/' || new.id
      );
    end loop;
  end if;

  -- a manager sent a closed deal back
  if tg_op = 'UPDATE' and old.status = 'won' and old.confirmed_at is null and new.status <> 'won'
     and new.broker_id is not null and new.broker_id <> actor then
    perform public.notify(
      new.organization_id, new.broker_id, actor, 'deal_returned',
      jsonb_build_object('actor', public.person_name(actor), 'title', label),
      '/deals/' || new.id
    );
  end if;

  -- confirmed → it counts: tell the broker, the team, and whoever was overtaken this month
  if new.confirmed_at is not null and (tg_op = 'INSERT' or old.confirmed_at is null)
     and new.broker_id is not null then
    if new.broker_id <> actor then
      perform public.notify(
        new.organization_id, new.broker_id, actor, 'deal_confirmed',
        jsonb_build_object('actor', public.person_name(actor), 'amount', new.commission, 'title', label),
        '/deals/' || new.id
      );
    end if;

    for member in
      select profile_id from public.organization_members
      where organization_id = new.organization_id and profile_id not in (new.broker_id, actor)
    loop
      perform public.notify(
        new.organization_id, member.profile_id, new.broker_id, 'commission_logged',
        jsonb_build_object('actor', broker_name, 'amount', new.commission),
        '/'
      );
    end loop;

    if date_trunc('month', new.closed_on::timestamp) = date_trunc('month', public.sofia_today()::timestamp) then
      after_total := public.month_commission(new.organization_id, new.broker_id, new.closed_on);
      before_total := after_total - new.commission;
      for member in
        select x.profile_id
        from (
          select m.profile_id, public.month_commission(new.organization_id, m.profile_id, new.closed_on) as total
          from public.organization_members m
          where m.organization_id = new.organization_id and m.profile_id <> new.broker_id
        ) x
        where x.total > 0 and x.total >= before_total and x.total < after_total
      loop
        perform public.notify(
          new.organization_id, member.profile_id, new.broker_id, 'overtaken',
          jsonb_build_object('actor', broker_name, 'amount', after_total),
          '/'
        );
      end loop;
    end if;
  end if;

  return new;
end;
$$;

create trigger deals_on_changed
  after insert or update or delete on public.deals
  for each row execute function public.on_deal_changed();

-- ---------------------------------------------------------------------
-- The ranking: commission (confirmed deals) and activity points
--   deal 50 · new listing 10 (+10 exclusive) · viewing 5 · meeting 3
--   new client 2 · call 1
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
    select d.broker_id as pid, sum(d.commission) as total, count(*)::int as n
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
      coalesce(signed.n, 0) as new_clients
    from public.organization_members m
    join public.profiles pr on pr.id = m.profile_id
    left join won on won.pid = m.profile_id
    left join listed on listed.pid = m.profile_id
    left join acts on acts.pid = m.profile_id
    left join signed on signed.pid = m.profile_id
    where m.organization_id = target_org and public.is_org_member(target_org)
  )
  select r.*,
    (r.deals * 50 + r.listings * 10 + r.exclusives * 10 + r.viewings * 5
      + r.meetings * 3 + r.new_clients * 2 + r.calls)::int as points
  from ranked r
  order by r.commission desc, points desc, r.full_name;
$$;

-- ---------------------------------------------------------------------
-- A leaving colleague's clients, properties, open tasks and open deals
-- move to the colleague who takes over
-- ---------------------------------------------------------------------
create or replace function public.remove_member(target_org uuid, target_profile uuid, reassign_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_role text;
begin
  select role into caller_role from public.organization_members
  where organization_id = target_org and profile_id = auth.uid();

  select role into target_role from public.organization_members
  where organization_id = target_org and profile_id = target_profile;

  if target_role is null then raise exception 'not_a_member'; end if;
  if target_profile = auth.uid() then raise exception 'cannot_remove_self'; end if;
  if target_role = 'owner' then raise exception 'cannot_remove_owner'; end if;
  if not (caller_role = 'owner' or (caller_role = 'manager' and target_role = 'broker')) then
    raise exception 'forbidden';
  end if;
  if reassign_to is null
     or reassign_to = target_profile
     or not exists (
       select 1 from public.organization_members
       where organization_id = target_org and profile_id = reassign_to
     ) then
    raise exception 'invalid_reassign';
  end if;

  update public.properties set responsible_broker_id = reassign_to
  where organization_id = target_org and responsible_broker_id = target_profile;

  update public.clients set responsible_broker_id = reassign_to
  where organization_id = target_org and responsible_broker_id = target_profile;

  update public.tasks set assigned_to = reassign_to
  where organization_id = target_org and assigned_to = target_profile and status = 'open';

  update public.deals set broker_id = reassign_to
  where organization_id = target_org and broker_id = target_profile and status = 'open';

  delete from public.organization_members
  where organization_id = target_org and profile_id = target_profile;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.deals enable row level security;
alter table public.broker_goals enable row level security;

-- deals: the broker's own; managers see the whole agency
create policy "deals: read" on public.deals
  for select to authenticated
  using (
    broker_id = auth.uid()
    or created_by = auth.uid()
    or public.is_org_manager(organization_id)
  );

create policy "deals: create" on public.deals
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and (broker_id = auth.uid() or public.is_org_manager(organization_id))
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = deals.organization_id and m.profile_id = deals.broker_id
    )
    and (property_id is not null or client_id is not null)
    and (property_id is null or exists (
      select 1 from public.properties p
      where p.id = deals.property_id and p.organization_id = deals.organization_id
    ))
    and (client_id is null or exists (
      select 1 from public.clients c
      where c.id = deals.client_id and c.organization_id = deals.organization_id
    ))
  );

create policy "deals: update" on public.deals
  for update to authenticated
  using (broker_id = auth.uid() or public.is_org_manager(organization_id))
  with check (
    (broker_id = auth.uid() or public.is_org_manager(organization_id))
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = deals.organization_id and m.profile_id = deals.broker_id
    )
    and (property_id is null or exists (
      select 1 from public.properties p
      where p.id = deals.property_id and p.organization_id = deals.organization_id
    ))
    and (client_id is null or exists (
      select 1 from public.clients c
      where c.id = deals.client_id and c.organization_id = deals.organization_id
    ))
  );

-- a broker can remove a deal they are still working on; the rest is the manager's
create policy "deals: delete" on public.deals
  for delete to authenticated
  using (
    public.is_org_manager(organization_id)
    or (broker_id = auth.uid() and status = 'open')
  );

-- goals: my own; managers set and see everyone's
create policy "goals: read" on public.broker_goals
  for select to authenticated
  using (profile_id = auth.uid() or public.is_org_manager(organization_id));

create policy "goals: managers create" on public.broker_goals
  for insert to authenticated
  with check (
    public.is_org_manager(organization_id)
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = broker_goals.organization_id and m.profile_id = broker_goals.profile_id
    )
  );

create policy "goals: managers update" on public.broker_goals
  for update to authenticated
  using (public.is_org_manager(organization_id))
  with check (
    public.is_org_manager(organization_id)
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = broker_goals.organization_id and m.profile_id = broker_goals.profile_id
    )
  );

create policy "goals: managers delete" on public.broker_goals
  for delete to authenticated
  using (public.is_org_manager(organization_id));
