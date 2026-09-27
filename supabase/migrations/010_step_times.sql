-- =====================================================================
-- BRIXA — migration 010: a time for each scheduled deal step, and a
-- reminder an hour before it
-- Run once in Supabase → SQL Editor → New query → Run (after 009).
-- =====================================================================

alter table public.deals
  add column viewing_time time,
  add column offer_time time,
  add column deposit_time time,
  add column preliminary_time time,
  add column notary_time time;

-- 'soon' = about an hour before the scheduled time
alter table public.deal_reminders drop constraint deal_reminders_kind_check;
alter table public.deal_reminders add constraint deal_reminders_kind_check check (kind in ('eve', 'day', 'soon'));

-- As before; a step reached on another day than planned loses its planned time.
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
      new.offer_time := null;
    elsif new.stage = 'deposit' and (new.deposit_on is null or new.deposit_on > today) then
      new.deposit_on := today;
      new.deposit_time := null;
    elsif new.stage = 'preliminary' and (new.preliminary_on is null or new.preliminary_on > today) then
      new.preliminary_on := today;
      new.preliminary_time := null;
    elsif new.stage = 'notary' and new.status = 'won' then
      if new.notary_on is distinct from new.closed_on then new.notary_time := null; end if;
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

-- ---------------------------------------------------------------------
-- Upcoming steps → reminders (run by a schedule every 15 minutes)
--   • the evening before (from 18:00): the broker
--   • on the day (from 08:00): the broker and the managers
--   • about an hour before the time, when one is set: the broker
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
  now_time time := local_now::time;
  today date := local_now::date;
  stages text[] := array['viewing', 'offer', 'deposit', 'preliminary', 'notary'];
  item record;
  manager record;
  payload jsonb;
  sent integer := 0;
begin
  for item in
    select d.id, d.organization_id, d.broker_id, d.kind, s.stage, s.due, s.at, k.reminder,
      coalesce(p.title, c.full_name, '') as label
    from public.deals d
    cross join lateral (values
      ('viewing', d.viewing_on, d.viewing_time), ('offer', d.offer_on, d.offer_time),
      ('deposit', d.deposit_on, d.deposit_time), ('preliminary', d.preliminary_on, d.preliminary_time),
      ('notary', d.notary_on, d.notary_time)
    ) as s (stage, due, at)
    cross join lateral (values ('eve'), ('day'), ('soon')) as k (reminder)
    left join public.properties p on p.id = d.property_id
    left join public.clients c on c.id = d.client_id
    where d.status = 'open'
      and d.broker_id is not null
      and s.due is not null
      and (
        array_position(stages, s.stage) > array_position(stages, d.stage)
        or (s.stage = d.stage and s.stage in ('viewing', 'notary'))
      )
      and case k.reminder
        when 'eve' then s.due = today + 1 and now_time >= time '18:00'
        when 'day' then s.due = today and now_time >= time '08:00'
        else s.due = today and s.at is not null and now_time >= s.at - interval '1 hour' and now_time < s.at
      end
  loop
    insert into public.deal_reminders (deal_id, stage, kind, due)
    values (item.id, item.stage, item.reminder, item.due)
    on conflict do nothing;
    if not found then continue; end if;

    payload := jsonb_build_object(
      'title', item.label, 'stage', item.stage, 'kind', item.kind,
      'time', to_char(item.at, 'HH24:MI')
    );

    perform public.notify(
      item.organization_id, item.broker_id, null,
      case item.reminder when 'eve' then 'deal_date_tomorrow' when 'day' then 'deal_date_today' else 'deal_date_soon' end,
      payload,
      '/deals/' || item.id
    );

    if item.reminder = 'day' then
      for manager in
        select profile_id from public.organization_members
        where organization_id = item.organization_id
          and role in ('owner', 'manager')
          and profile_id <> item.broker_id
      loop
        perform public.notify(
          item.organization_id, manager.profile_id, item.broker_id, 'deal_date_team',
          payload || jsonb_build_object('actor', public.person_name(item.broker_id)),
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
