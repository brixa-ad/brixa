-- =====================================================================
-- BRIXA — migration 019: external brokers
--   A client can come from an external broker (source "Външен брокер" +
--   who referred them). The agency pays that broker a share of the
--   commission (10% by default, set per agency and per deal).
--   What counts everywhere — ranking, goals, statistics, notifications —
--   is what stays with the agency: deals.net_commission.
-- Run once in Supabase → SQL Editor → New query → Run (after 018).
-- =====================================================================

-- ---- the client: the new source and who referred them
alter table public.clients drop constraint if exists clients_source_check;
alter table public.clients add constraint clients_source_check check (source in (
  'personal', 'referral', 'email', 'google', 'facebook', 'instagram',
  'realistimo', 'yavlena', 'billboard', 'signs', 'external_broker'
));
alter table public.clients
  add column referrer text check (referrer is null or char_length(referrer) <= 120);

-- ---- the agency's usual share for an external broker, in % of the commission
alter table public.organizations
  add column referral_percent numeric(5, 2) not null default 10 check (referral_percent between 0 and 100);

-- ---- the deal: who gets a share, how much, when it was paid; what stays with the agency
alter table public.deals
  add column referral_name text check (referral_name is null or char_length(referral_name) <= 120),
  add column referral_percent numeric(5, 2) check (referral_percent is null or referral_percent between 0 and 100),
  add column referral_paid_on date,
  add column net_commission numeric(12, 2) generated always as (
    case when commission is null then null
    else round(commission * (100 - coalesce(referral_percent, 0)) / 100, 2) end
  ) stored;

-- Confirmed commission of one broker in the month of ref_day — what stays with the agency.
create or replace function public.month_commission(target_org uuid, target_profile uuid, ref_day date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(net_commission), 0)
  from public.deals
  where organization_id = target_org
    and broker_id = target_profile
    and status = 'won'
    and confirmed_at is not null
    and closed_on >= date_trunc('month', ref_day::timestamp)::date
    and closed_on < (date_trunc('month', ref_day::timestamp) + interval '1 month')::date;
$$;

-- Notifications carry what stays with the agency.
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
        jsonb_build_object('actor', broker_name, 'amount', new.net_commission, 'title', label),
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
        jsonb_build_object('actor', public.person_name(actor), 'amount', new.net_commission, 'title', label),
        '/deals/' || new.id
      );
    end if;

    for member in
      select profile_id from public.organization_members
      where organization_id = new.organization_id and profile_id not in (new.broker_id, actor)
    loop
      perform public.notify(
        new.organization_id, member.profile_id, new.broker_id, 'commission_logged',
        jsonb_build_object('actor', broker_name, 'amount', new.net_commission),
        '/'
      );
    end loop;

    if date_trunc('month', new.closed_on::timestamp) = date_trunc('month', public.sofia_today()::timestamp) then
      after_total := public.month_commission(new.organization_id, new.broker_id, new.closed_on);
      before_total := after_total - new.net_commission;
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

-- The ranking counts what stays with the agency.
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
    select d.broker_id as pid, sum(d.net_commission) as total, count(*)::int as n,
      sum(case when d.double_sided then o.points_deal_double else o.points_deal end)::int as dp
    from public.deals d, bounds b, public.organizations o
    where d.organization_id = target_org and o.id = target_org and d.status = 'won' and d.confirmed_at is not null
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
    (r.deal_points + r.listings * o.points_listing + r.exclusives * o.points_exclusive + r.viewings * o.points_viewing
      + r.meetings * o.points_meeting + r.new_clients * o.points_client + r.calls * o.points_call)::int as points
  from ranked r
  join public.organizations o on o.id = target_org
  order by r.commission desc, points desc, r.full_name;
$$;

-- A broker's results: what stays with the agency.
create or replace function public.member_stats(target_profile uuid, period text default 'year')
returns table (
  deals_won integer,
  turnover numeric,
  commission numeric,
  viewings integer,
  calls integer,
  meetings integer,
  new_clients integer,
  new_listings integer,
  active_listings integer,
  reserved_listings integer,
  open_deals integer
)
language sql
stable
security definer
set search_path = public
as $$
  with org as (
    select m.organization_id as id
    from public.organization_members m
    join public.organization_members mine
      on mine.organization_id = m.organization_id and mine.profile_id = auth.uid()
    where m.profile_id = target_profile
    limit 1
  ),
  span as (
    select case period
      when 'month' then date_trunc('month', public.sofia_today()::timestamp)::date
      when 'all' then date '1900-01-01'
      else date_trunc('year', public.sofia_today()::timestamp)::date
    end as from_day
  ),
  bounds as (
    select from_day, from_day::timestamp at time zone 'Europe/Sofia' as from_ts from span
  )
  select
    (select count(*)::int from public.deals d, bounds b, org
      where d.organization_id = org.id and d.broker_id = target_profile and d.status = 'won'
        and d.confirmed_at is not null and d.closed_on >= b.from_day),
    (select coalesce(sum(case d.currency when 'EUR' then d.price when 'BGN' then d.price / 1.95583 else 0 end), 0)
      from public.deals d, bounds b, org
      where d.organization_id = org.id and d.broker_id = target_profile and d.status = 'won'
        and d.confirmed_at is not null and d.closed_on >= b.from_day),
    (select coalesce(sum(d.net_commission), 0) from public.deals d, bounds b, org
      where d.organization_id = org.id and d.broker_id = target_profile and d.status = 'won'
        and d.confirmed_at is not null and d.closed_on >= b.from_day),
    (select count(*)::int from public.activities a, bounds b, org
      where a.organization_id = org.id and a.profile_id = target_profile and a.type = 'viewing' and a.occurred_at >= b.from_ts),
    (select count(*)::int from public.activities a, bounds b, org
      where a.organization_id = org.id and a.profile_id = target_profile and a.type = 'call' and a.occurred_at >= b.from_ts),
    (select count(*)::int from public.activities a, bounds b, org
      where a.organization_id = org.id and a.profile_id = target_profile and a.type = 'meeting' and a.occurred_at >= b.from_ts),
    (select count(*)::int from public.clients c, bounds b, org
      where c.organization_id = org.id and c.responsible_broker_id = target_profile and c.created_at >= b.from_ts),
    (select count(*)::int from public.properties p, bounds b, org
      where p.organization_id = org.id and p.responsible_broker_id = target_profile and p.created_at >= b.from_ts),
    (select count(*)::int from public.properties p, org
      where p.organization_id = org.id and p.responsible_broker_id = target_profile and p.status = 'active'),
    (select count(*)::int from public.properties p, org
      where p.organization_id = org.id and p.responsible_broker_id = target_profile and p.status = 'reserved'),
    (select count(*)::int from public.deals d, org
      where d.organization_id = org.id and d.broker_id = target_profile and d.status = 'open')
  from org;
$$;
