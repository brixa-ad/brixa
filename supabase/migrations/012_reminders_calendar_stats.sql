-- =====================================================================
-- BRIXA — migration 012: task reminders before the time, a calendar feed
-- for Google Calendar, broker statistics, "sold by another agency",
-- and a detailed property address
-- Run once in Supabase → SQL Editor → New query → Run (after 011).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Task reminders: ~15 minutes before a task's time (push to the phone)
-- ---------------------------------------------------------------------
alter table public.tasks add column reminded_on date;

-- As before; moving a task also re-arms its reminder.
create or replace function public.guard_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.organization_id := old.organization_id;
  new.created_by := old.created_by;

  if auth.uid() is not null
     and not public.is_org_manager(old.organization_id)
     and old.created_by is distinct from auth.uid() then
    new.title := old.title;
    new.description := old.description;
    new.type := old.type;
    new.client_id := old.client_id;
    new.property_id := old.property_id;
    new.due_date := old.due_date;
    new.due_time := old.due_time;
    new.assigned_to := old.assigned_to;
  end if;

  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := now();
    new.completed_by := coalesce(auth.uid(), new.assigned_to);
  elsif new.status = 'open' and old.status = 'done' then
    new.completed_at := null;
    new.completed_by := null;
    new.completion_note := null;
  end if;

  if new.due_date is distinct from old.due_date or new.due_time is distinct from old.due_time then
    new.overdue_notified_on := null;
    new.reminded_on := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.notify_task_reminders(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  now_time time := local_now::time;
  today date := local_now::date;
  task record;
  sent integer := 0;
begin
  for task in
    select t.id, t.organization_id, t.assigned_to, t.title, t.due_time
    from public.tasks t
    where t.status = 'open'
      and t.due_date = today
      and t.due_time is not null
      and (t.reminded_on is null or t.reminded_on < today)
      and t.due_time > now_time
      and t.due_time - interval '15 minutes' <= now_time
  loop
    perform public.notify(
      task.organization_id, task.assigned_to, null, 'task_reminder',
      jsonb_build_object('title', task.title, 'time', to_char(task.due_time, 'HH24:MI')),
      '/tasks/' || task.id
    );
    update public.tasks set reminded_on = today where id = task.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.notify_task_reminders(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Calendar feed: a private address per person that Google Calendar reads
-- ---------------------------------------------------------------------
create table public.calendar_feeds (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;
create policy "calendar feeds: read own" on public.calendar_feeds
  for select to authenticated using (profile_id = auth.uid());

-- My feed's token (made on first use).
create or replace function public.my_calendar_token()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result uuid;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  insert into public.calendar_feeds (profile_id) values (auth.uid()) on conflict (profile_id) do nothing;
  select token into result from public.calendar_feeds where profile_id = auth.uid();
  return result;
end;
$$;

-- A new address; the old one stops working.
create or replace function public.reset_calendar_token()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result uuid;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  insert into public.calendar_feeds (profile_id) values (auth.uid())
  on conflict (profile_id) do update set token = gen_random_uuid(), created_at = now()
  returning token into result;
  return result;
end;
$$;

-- What the feed shows: my tasks and my deals' steps, a month back to half a year ahead.
create or replace function public.calendar_feed(feed_token uuid)
returns table (uid text, kind text, title text, day date, at time, detail text, link text, done boolean)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select profile_id from public.calendar_feeds where token = feed_token
  ),
  window_days as (
    select public.sofia_today() - 31 as from_day, public.sofia_today() + 186 as to_day
  )
  select 'task-' || t.id, 'task', t.title, t.due_date, t.due_time,
    coalesce((select full_name from public.clients c where c.id = t.client_id), ''),
    '/tasks/' || t.id, t.status = 'done'
  from public.tasks t, me, window_days w
  where t.assigned_to = me.profile_id and t.due_date between w.from_day and w.to_day
  union all
  select 'deal-' || d.id || '-' || s.stage, s.stage || ':' || d.kind,
    coalesce((select title from public.properties p where p.id = d.property_id),
             (select full_name from public.clients c where c.id = d.client_id), ''),
    s.day, s.at, '', '/deals/' || d.id, d.status <> 'open'
  from public.deals d
  cross join me
  cross join window_days w
  cross join lateral (values
    ('viewing', d.viewing_on, d.viewing_time), ('offer', d.offer_on, d.offer_time),
    ('deposit', d.deposit_on, d.deposit_time), ('preliminary', d.preliminary_on, d.preliminary_time),
    ('notary', d.notary_on, d.notary_time)
  ) as s (stage, day, at)
  where d.broker_id = me.profile_id and d.status <> 'lost'
    and s.day between w.from_day and w.to_day;
$$;

revoke execute on function public.calendar_feed(uuid) from public;
-- Google's servers fetch the feed without signing in; the token is the key.
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
revoke execute on function public.my_calendar_token() from public, anon;
revoke execute on function public.reset_calendar_token() from public, anon;
grant execute on function public.my_calendar_token() to authenticated;
grant execute on function public.reset_calendar_token() to authenticated;

-- ---------------------------------------------------------------------
-- A broker's results (colleagues' profiles) — totals only, no clients
-- ---------------------------------------------------------------------
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
    (select coalesce(sum(d.commission), 0) from public.deals d, bounds b, org
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

-- ---------------------------------------------------------------------
-- Properties: "sold by another agency", and the address in parts
-- ---------------------------------------------------------------------
alter table public.properties drop constraint properties_status_check;
alter table public.properties add constraint properties_status_check
  check (status in ('active', 'reserved', 'sold', 'rented', 'withdrawn', 'sold_elsewhere'));

alter table public.properties
  add column street text check (street is null or char_length(street) <= 120),
  add column street_no text check (street_no is null or char_length(street_no) <= 20),
  add column block text check (block is null or char_length(block) <= 20),
  add column entrance text check (entrance is null or char_length(entrance) <= 10),
  add column apartment text check (apartment is null or char_length(apartment) <= 20),
  add column cadastral_id text check (cadastral_id is null or char_length(cadastral_id) <= 60);

-- ---------------------------------------------------------------------
-- Schedule the task reminders every 5 minutes (needs Cron, on since 007)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-task-reminders', '*/5 * * * *', 'select public.notify_task_reminders()');
  end if;
end;
$$;
