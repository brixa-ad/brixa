-- =====================================================================
-- BRIXA — migration 040: offices, teams and who leads whom
--   • the agency: offices → teams → brokers; roles: owner (управител),
--     office manager, team manager, broker
--   • what a leader sees follows the tree: the owner everything, an office
--     manager their office, a team manager their team (a manager with no team
--     yet: their office — so nobody loses sight before the teams are set)
--   • listings and the ranking stay the whole agency's
--   • signing up: an agency (with its details and its first office) or a solo broker
--   • the reminders "your team's…" go to the broker's own leaders
-- Run once in Supabase → SQL Editor → New query → Run (after 039).
-- =====================================================================

-- ---------------------------------------------------------------------
-- The roles, the agency's details
-- ---------------------------------------------------------------------
alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members add constraint organization_members_role_check
  check (role in ('owner', 'office_manager', 'manager', 'broker'));
alter table public.organization_invitations drop constraint if exists organization_invitations_role_check;
alter table public.organization_invitations add constraint organization_invitations_role_check
  check (role in ('office_manager', 'manager', 'broker'));

alter table public.organizations
  add column kind text not null default 'agency' check (kind in ('agency', 'solo')),
  add column eik text check (eik is null or eik ~ '^[0-9]{9}([0-9]{4})?$'),
  add column legal_name text check (legal_name is null or char_length(legal_name) <= 200),
  add column city text check (city is null or char_length(city) <= 80);

-- ---------------------------------------------------------------------
-- Offices and teams
-- ---------------------------------------------------------------------
create table public.offices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  city text check (city is null or char_length(city) <= 80),
  address text check (address is null or char_length(address) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  created_at timestamptz not null default now()
);
create index offices_org_idx on public.offices (organization_id, name);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  office_id uuid references public.offices (id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  manager_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index teams_org_idx on public.teams (organization_id, office_id);
create unique index teams_one_per_manager on public.teams (manager_id) where manager_id is not null;

alter table public.organization_members
  add column office_id uuid references public.offices (id) on delete set null,
  add column team_id uuid references public.teams (id) on delete set null;
alter table public.organization_invitations
  add column office_id uuid references public.offices (id) on delete set null,
  add column team_id uuid references public.teams (id) on delete set null,
  add column full_name text check (full_name is null or char_length(full_name) <= 120);

alter table public.offices enable row level security;
alter table public.teams enable row level security;

-- the ones working alone so far stay on their own; the agencies start with one office, everyone in it
update public.organizations o set kind = 'solo'
where (select count(*) from public.organization_members m where m.organization_id = o.id) <= 1;
insert into public.offices (organization_id, name, address, phone)
select o.id, 'Централен офис', left(o.address, 200), left(o.phone, 40)
from public.organizations o
where o.kind = 'agency' and not exists (select 1 from public.offices f where f.organization_id = o.id);
update public.organization_members m
set office_id = (select f.id from public.offices f where f.organization_id = m.organization_id order by f.created_at limit 1)
where m.office_id is null;

-- ---------------------------------------------------------------------
-- Who leads whom
-- ---------------------------------------------------------------------

-- Does the viewer lead the target: the owner everyone in the agency (and what is no one's);
-- an office manager the people of their office; a team manager the people of their team
-- (no team yet: their office; no office either: the whole agency). Not oneself — except the owner.
create or replace function public.oversees_as(viewer uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members me
    where me.profile_id = viewer
      and (
        (me.role = 'owner' and (target is null or exists (
          select 1 from public.organization_members t where t.organization_id = me.organization_id and t.profile_id = target
        )))
        or (target is not null and target <> viewer and exists (
          select 1 from public.organization_members t
          where t.organization_id = me.organization_id and t.profile_id = target
            and (
              (me.role = 'office_manager' and (me.office_id is null or t.office_id = me.office_id))
              or (me.role = 'manager' and (
                exists (select 1 from public.teams tm where tm.manager_id = viewer and tm.id = t.team_id)
                or (not exists (select 1 from public.teams tm where tm.manager_id = viewer)
                    and (me.office_id is null or t.office_id = me.office_id))
              ))
            )
        ))
      )
  );
$$;

-- a leader of any kind (gives tasks, confirms deals… for the people they lead)
create or replace function public.is_org_manager(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org and profile_id = auth.uid() and role in ('owner', 'office_manager', 'manager')
  );
$$;

-- the agency's own settings and data: the owner and the office managers
create or replace function public.is_org_leader(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org and profile_id = auth.uid() and role in ('owner', 'office_manager')
  );
$$;

-- the office of a member (their team's office when set)
create or replace function public.my_office(target_org uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select office_id from public.organization_members where organization_id = target_org and profile_id = auth.uid();
$$;

revoke execute on function public.oversees_as(uuid, uuid) from public, anon;
grant execute on function public.oversees_as(uuid, uuid) to authenticated;

-- offices: the agency reads; the owner keeps them
create policy "offices: read" on public.offices for select to authenticated using (public.is_org_member(organization_id));
create policy "offices: owner create" on public.offices for insert to authenticated with check (public.is_org_owner(organization_id));
create policy "offices: owner update" on public.offices for update to authenticated
  using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create policy "offices: owner delete" on public.offices for delete to authenticated using (public.is_org_owner(organization_id));

-- teams: the agency reads; the owner, or the office manager in their office, keeps them
create policy "teams: read" on public.teams for select to authenticated using (public.is_org_member(organization_id));
create policy "teams: create" on public.teams for insert to authenticated with check (
  public.is_org_owner(organization_id)
  or (public.is_org_leader(organization_id) and office_id is not null and office_id = public.my_office(organization_id))
);
create policy "teams: update" on public.teams for update to authenticated
  using (
    public.is_org_owner(organization_id)
    or (public.is_org_leader(organization_id) and office_id = public.my_office(organization_id))
    or manager_id = auth.uid()
  )
  with check (
    public.is_org_owner(organization_id)
    or (public.is_org_leader(organization_id) and office_id = public.my_office(organization_id))
    or manager_id = auth.uid()
  );
create policy "teams: delete" on public.teams for delete to authenticated using (
  public.is_org_owner(organization_id)
  or (public.is_org_leader(organization_id) and office_id = public.my_office(organization_id))
);


-- ---------------------------------------------------------------------
-- What one may see and change: by the tree
-- ---------------------------------------------------------------------


create or replace function public.can_view_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    join public.organization_members m on m.organization_id = c.organization_id
    where c.id = target_client
      and m.profile_id = auth.uid()
      and ((public.oversees_as(auth.uid(), c.responsible_broker_id)
           or (c.responsible_broker_id is null and m.role <> 'broker')) or c.responsible_broker_id = auth.uid())
  );
$$;

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
      and (public.oversees_as(auth.uid(), d.broker_id) or d.broker_id = auth.uid() or d.created_by = auth.uid())
  );
$$;

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
      and (public.oversees_as(auth.uid(), d.broker_id) or (d.broker_id = auth.uid() and d.confirmed_at is null))
  );
$$;

create or replace function public.can_edit_property(target_property uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties p
    join public.organization_members m on m.organization_id = p.organization_id
    where p.id = target_property
      and m.profile_id = auth.uid()
      and (public.oversees_as(auth.uid(), p.responsible_broker_id) or p.responsible_broker_id = auth.uid())
  );
$$;

create or replace function public.can_edit_photo_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties p
    join public.organization_members m on m.organization_id = p.organization_id
    where array_length(string_to_array(object_name, '/'), 1) = 3
      and p.organization_id::text = split_part(object_name, '/', 1)
      and p.id::text = split_part(object_name, '/', 2)
      and m.profile_id = auth.uid()
      and (public.oversees_as(auth.uid(), p.responsible_broker_id) or p.responsible_broker_id = auth.uid())
  );
$$;

create or replace function public.can_manage_property_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties p
    join public.organization_members m on m.organization_id = p.organization_id
    where array_length(string_to_array(object_name, '/'), 1) >= 3
      and p.organization_id::text = split_part(object_name, '/', 1)
      and p.id::text = split_part(object_name, '/', 2)
      and m.profile_id = auth.uid()
      and (public.oversees_as(auth.uid(), p.responsible_broker_id) or p.responsible_broker_id = auth.uid())
  );
$$;

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
     and not public.oversees_as(auth.uid(), old.assigned_to)
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
  manager := auth.uid() is null or public.oversees_as(auth.uid(), new.broker_id);

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
-- "Your team's…" reminders: to the broker's own leaders
-- ---------------------------------------------------------------------


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
      where organization_id = new.organization_id and public.oversees_as(profile_id, new.broker_id) and profile_id <> actor
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

create or replace function public.notify_overdue_tasks(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  task record;
  manager record;
  sent integer := 0;
begin
  for task in
    select t.*
    from public.tasks t
    where t.status = 'open'
      and t.due_date <= today
      and (t.overdue_notified_on is null or t.overdue_notified_on < today)
      and (
        (t.due_date = today and t.due_time is not null and t.due_time <= (local_now - interval '15 minutes')::time)
        or ((t.due_date < today or t.due_time is null) and local_now::time >= time '18:00')
      )
  loop
    perform public.notify(
      task.organization_id, task.assigned_to, null, 'task_overdue',
      jsonb_build_object('title', task.title, 'due', task.due_date, 'days', today - task.due_date),
      '/tasks/' || task.id
    );

    for manager in
      select profile_id from public.organization_members
      where organization_id = task.organization_id
        and public.oversees_as(profile_id, task.assigned_to)
        and profile_id <> task.assigned_to
    loop
      perform public.notify(
        task.organization_id, manager.profile_id, task.assigned_to, 'task_overdue_team',
        jsonb_build_object(
          'title', task.title, 'actor', public.person_name(task.assigned_to),
          'due', task.due_date, 'days', today - task.due_date
        ),
        '/tasks/' || task.id
      );
    end loop;

    update public.tasks set overdue_notified_on = today where id = task.id;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

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
          and public.oversees_as(profile_id, item.broker_id)
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

create or replace function public.notify_missed_tasks(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  person record;
  manager record;
  sent integer := 0;
begin
  if local_now::time < time '08:30' then return 0; end if;

  for person in
    select t.organization_id, t.assigned_to, count(*)::int as n,
      array_to_string((array_agg(t.title order by t.due_date, t.title))[1:3], ', ') as titles
    from public.tasks t
    where t.status = 'open' and t.due_date < today
    group by t.organization_id, t.assigned_to
  loop
    insert into public.task_digests (profile_id, day) values (person.assigned_to, today)
    on conflict do nothing;
    if not found then continue; end if;

    perform public.notify(
      person.organization_id, person.assigned_to, null, 'tasks_missed',
      jsonb_build_object('count', person.n, 'title', person.titles),
      '/tasks'
    );
    for manager in
      select profile_id from public.organization_members
      where organization_id = person.organization_id
        and public.oversees_as(profile_id, person.assigned_to)
        and profile_id <> person.assigned_to
    loop
      perform public.notify(
        person.organization_id, manager.profile_id, person.assigned_to, 'tasks_missed_team',
        jsonb_build_object('count', person.n, 'title', person.titles, 'actor', public.person_name(person.assigned_to)),
        '/tasks?broker=' || person.assigned_to
      );
    end loop;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

create or replace function public.notify_follow_ups(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  client record;
  person record;
  manager record;
  sent integer := 0;
begin
  -- 1) deadline passed → the broker and the managers, once per deadline
  for client in
    select c.id, c.organization_id, c.full_name, c.responsible_broker_id
    from public.clients c
    where c.follow_up_at <= at_time and c.follow_up_notified_at is null and c.responsible_broker_id is not null
  loop
    perform public.notify(
      client.organization_id, client.responsible_broker_id, null, 'follow_up_missed',
      jsonb_build_object('title', client.full_name), '/clients/' || client.id
    );
    for manager in
      select profile_id from public.organization_members
      where organization_id = client.organization_id and public.oversees_as(profile_id, client.responsible_broker_id)
        and profile_id <> client.responsible_broker_id
    loop
      perform public.notify(
        client.organization_id, manager.profile_id, client.responsible_broker_id, 'follow_up_missed_team',
        jsonb_build_object('title', client.full_name, 'actor', public.person_name(client.responsible_broker_id)),
        '/clients/' || client.id
      );
    end loop;
    update public.clients set follow_up_notified_at = at_time where id = client.id;
    sent := sent + 1;
  end loop;

  -- 2) still nothing N days after the deadline → back to the free contacts
  for client in
    select c.id, c.organization_id, c.full_name, c.responsible_broker_id
    from public.clients c
    join public.organizations o on o.id = c.organization_id
    where o.release_after_days > 0
      and c.responsible_broker_id is not null
      and c.follow_up_at <= at_time - make_interval(days => o.release_after_days)
  loop
    update public.clients set responsible_broker_id = null where id = client.id;
    perform public.notify(
      client.organization_id, client.responsible_broker_id, null, 'client_released',
      jsonb_build_object('title', client.full_name), '/contacts'
    );
    for manager in
      select profile_id from public.organization_members
      where organization_id = client.organization_id and public.oversees_as(profile_id, client.responsible_broker_id)
        and profile_id <> client.responsible_broker_id
    loop
      perform public.notify(
        client.organization_id, manager.profile_id, client.responsible_broker_id, 'client_released_team',
        jsonb_build_object('title', client.full_name, 'actor', public.person_name(client.responsible_broker_id)),
        '/contacts'
      );
    end loop;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

create or replace function public.on_client_owner_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member record;
  previous uuid := case when tg_op = 'UPDATE' then old.responsible_broker_id end;
begin
  if tg_op = 'UPDATE' and new.responsible_broker_id is not distinct from old.responsible_broker_id then
    return new;
  end if;
  if tg_op = 'INSERT' and new.lead_form_id is not null and new.responsible_broker_id is not null then
    return new;
  end if;

  if new.responsible_broker_id is null then
    for member in
      select profile_id from public.organization_members
      where organization_id = new.organization_id
        and profile_id is distinct from auth.uid()
        and profile_id is distinct from previous
    loop
      perform public.notify(
        new.organization_id, member.profile_id, auth.uid(), 'free_contact',
        jsonb_build_object('title', new.full_name), '/contacts'
      );
    end loop;
  elsif new.responsible_broker_id is distinct from auth.uid() then
    perform public.notify(
      new.organization_id, new.responsible_broker_id, auth.uid(), 'client_assigned',
      jsonb_build_object(
        'title', new.full_name,
        'hours', (select follow_up_first_hours from public.organizations where id = new.organization_id)
      ),
      '/clients/' || new.id
    );
  elsif tg_op = 'UPDATE' and previous is null then
    for member in
      select profile_id from public.organization_members
      where organization_id = new.organization_id and public.oversees_as(profile_id, new.responsible_broker_id) and profile_id <> auth.uid()
    loop
      perform public.notify(
        new.organization_id, member.profile_id, auth.uid(), 'contact_claimed',
        jsonb_build_object('title', new.full_name, 'actor', public.person_name(auth.uid())),
        '/clients/' || new.id
      );
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.claim_push(target uuid, token uuid)
returns table (
  type text, data jsonb, link text, endpoint text, p256dh text, auth_key text, lang text,
  phone text, email text
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
  end if;

  return query
  select claimed.type, claimed.data, claimed.link, s.endpoint, s.p256dh, s.auth_key, s.lang,
    contact_phone, contact_email
  from public.push_subscriptions s
  where s.profile_id = claimed.recipient_id;
end;
$$;

-- ---------------------------------------------------------------------
-- The agency's settings: follow-up rules (the owner); market prices and the marketing plan
-- (the owner and the office managers)
-- ---------------------------------------------------------------------


create or replace function public.set_follow_up_rules(
  first_hours int, days_a int, days_b int, days_c int, release_days int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  select organization_id into org from public.organization_members
  where profile_id = auth.uid() and role = 'owner'
  limit 1;
  if org is null then raise exception 'forbidden'; end if;

  update public.organizations
  set follow_up_first_hours = first_hours,
      follow_up_days_a = days_a,
      follow_up_days_b = days_b,
      follow_up_days_c = days_c,
      release_after_days = release_days
  where id = org;

  update public.clients
  set follow_up_at = public.follow_up_due(id), follow_up_notified_at = null
  where organization_id = org and responsible_broker_id is not null;
end;
$$;

create or replace function public.set_market_prices(
  target_org uuid, target_operation text, target_settlement uuid, prices jsonb, price_source text, price_date date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  hood uuid;
  amount numeric;
  saved integer := 0;
begin
  if not public.is_org_leader(target_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if target_operation not in ('sale', 'rent') then
    raise exception 'bad operation';
  end if;
  if price_source is not null and char_length(price_source) > 120 then
    raise exception 'source too long';
  end if;

  for item in select * from jsonb_array_elements(coalesce(prices, '[]'::jsonb)) loop
    hood := nullif(item ->> 'neighborhood_id', '')::uuid;
    amount := nullif(item ->> 'price', '')::numeric;
    -- the neighborhood has to be in this town
    if hood is not null and not exists (
      select 1 from public.geo_neighborhoods n where n.id = hood and n.settlement_id = target_settlement
    ) then
      continue;
    end if;

    if amount is null or amount <= 0 then
      delete from public.market_prices
      where organization_id = target_org and operation = target_operation
        and settlement_id = target_settlement and neighborhood_id is not distinct from hood;
    else
      insert into public.market_prices
        (organization_id, operation, settlement_id, neighborhood_id, price_per_sqm, source, as_of, updated_by, updated_at)
      values
        (target_org, target_operation, target_settlement, hood, round(amount, 2),
         nullif(trim(price_source), ''), coalesce(price_date, public.sofia_today()), auth.uid(), now())
      on conflict on constraint market_prices_one do update
        set price_per_sqm = excluded.price_per_sqm,
            source = excluded.source,
            as_of = excluded.as_of,
            updated_by = excluded.updated_by,
            updated_at = now();
      saved := saved + 1;
    end if;
  end loop;
  return saved;
end;
$$;

create or replace function public.refresh_market_today(target_org uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_leader(target_org) then
    raise exception 'not allowed';
  end if;
  return public.snapshot_market(target_org);
end;
$$;

create or replace function public.set_marketing_template(target_org uuid, items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_leader(target_org) then
    raise exception 'not allowed';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 40 or exists (
    select 1 from jsonb_array_elements(items) x
    where jsonb_typeof(x) <> 'object'
       or char_length(coalesce(x->>'key', '')) not between 1 and 60
       or char_length(coalesce(x->>'label', '')) > 80
  ) then
    raise exception 'bad template';
  end if;
  update public.organizations set marketing_template = items where id = target_org;
end;
$$;

-- ---------------------------------------------------------------------
-- The policies, by the tree
-- ---------------------------------------------------------------------

-- the agency's details: the owner only
drop policy if exists "organizations: managers update" on public.organizations;

-- invitations: the owner anyone; an office manager managers and brokers into their office;
-- a team manager brokers into their team
drop policy if exists "invitations: managers read" on public.organization_invitations;
drop policy if exists "invitations: managers create" on public.organization_invitations;
drop policy if exists "invitations: managers delete" on public.organization_invitations;
create policy "invitations: read" on public.organization_invitations
  for select to authenticated
  using (
    invited_by = auth.uid()
    or public.is_org_owner(organization_id)
    or (public.is_org_leader(organization_id) and office_id = public.my_office(organization_id))
  );
create policy "invitations: create" on public.organization_invitations
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and (team_id is null or exists (
      select 1 from public.teams tm
      where tm.id = organization_invitations.team_id and tm.organization_id = organization_invitations.organization_id
        and (organization_invitations.office_id is null or tm.office_id = organization_invitations.office_id)
    ))
    and (office_id is null or exists (
      select 1 from public.offices o where o.id = organization_invitations.office_id and o.organization_id = organization_invitations.organization_id
    ))
    and (
      public.is_org_owner(organization_id)
      or (public.is_org_leader(organization_id) and role in ('manager', 'broker')
          and office_id is not null and office_id = public.my_office(organization_id))
      -- a manager: brokers into their own team (or, with no teams yet, without a team)
      or (role = 'broker' and public.is_org_manager(organization_id)
          and (office_id is null or office_id = public.my_office(organization_id))
          and (team_id is null or exists (
        select 1 from public.teams tm where tm.id = organization_invitations.team_id and tm.manager_id = auth.uid()
      )))
    )
  );
create policy "invitations: delete" on public.organization_invitations
  for delete to authenticated
  using (
    invited_by = auth.uid()
    or public.is_org_owner(organization_id)
    or (public.is_org_leader(organization_id) and office_id = public.my_office(organization_id))
  );

-- listings: everyone in the agency sees them; one's own, or the people one leads, are changed
drop policy if exists "properties: create own or as manager" on public.properties;
drop policy if exists "properties: update own or as manager" on public.properties;
drop policy if exists "properties: managers delete" on public.properties;
create policy "properties: create own or of one's people" on public.properties
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and (responsible_broker_id = auth.uid() or public.oversees_as(auth.uid(), responsible_broker_id))
  );
create policy "properties: update own or of one's people" on public.properties
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and (responsible_broker_id = auth.uid() or public.oversees_as(auth.uid(), responsible_broker_id))
  )
  with check (
    public.is_org_member(organization_id)
    and (responsible_broker_id = auth.uid() or public.oversees_as(auth.uid(), responsible_broker_id))
  );
create policy "properties: leaders delete" on public.properties
  for delete to authenticated
  using (
    public.oversees_as(auth.uid(), responsible_broker_id)
    or (public.is_org_manager(organization_id) and responsible_broker_id = auth.uid())
  );

-- clients: one's own and the people one leads (free contacts: their own policy)
drop policy if exists "clients: read own or as manager" on public.clients;
drop policy if exists "clients: create own or as manager" on public.clients;
drop policy if exists "clients: update own or as manager" on public.clients;
drop policy if exists "clients: managers delete" on public.clients;
create policy "clients: read own or of one's people" on public.clients
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    and (responsible_broker_id = auth.uid() or public.oversees_as(auth.uid(), responsible_broker_id))
  );
create policy "clients: create own or of one's people" on public.clients
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and (
      responsible_broker_id = auth.uid()
      or public.oversees_as(auth.uid(), responsible_broker_id)
      or (responsible_broker_id is null and public.is_org_manager(organization_id))
    )
  );
create policy "clients: update own or of one's people" on public.clients
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      responsible_broker_id = auth.uid()
      or public.oversees_as(auth.uid(), responsible_broker_id)
      or (responsible_broker_id is null and public.is_org_manager(organization_id))
    )
  )
  with check (
    public.is_org_member(organization_id)
    and (
      responsible_broker_id = auth.uid()
      or public.oversees_as(auth.uid(), responsible_broker_id)
      or (responsible_broker_id is null and public.is_org_manager(organization_id))
    )
  );
create policy "clients: leaders delete" on public.clients
  for delete to authenticated
  using (public.oversees_as(auth.uid(), responsible_broker_id));

-- tasks
drop policy if exists "tasks: read" on public.tasks;
drop policy if exists "tasks: create" on public.tasks;
drop policy if exists "tasks: update" on public.tasks;
drop policy if exists "tasks: delete" on public.tasks;
create policy "tasks: read" on public.tasks
  for select to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or public.oversees_as(auth.uid(), assigned_to));
create policy "tasks: create" on public.tasks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and (assigned_to = auth.uid() or public.oversees_as(auth.uid(), assigned_to))
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = tasks.organization_id and m.profile_id = tasks.assigned_to
    )
  );
create policy "tasks: update" on public.tasks
  for update to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or public.oversees_as(auth.uid(), assigned_to))
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = tasks.organization_id and m.profile_id = tasks.assigned_to
    )
  );
create policy "tasks: delete" on public.tasks
  for delete to authenticated
  using (created_by = auth.uid() or public.oversees_as(auth.uid(), assigned_to));

-- what was done
drop policy if exists "activities: read" on public.activities;
drop policy if exists "activities: update" on public.activities;
drop policy if exists "activities: delete" on public.activities;
create policy "activities: read" on public.activities
  for select to authenticated using (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));
create policy "activities: update" on public.activities
  for update to authenticated
  using (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id))
  with check (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));
create policy "activities: delete" on public.activities
  for delete to authenticated using (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));

-- deals
drop policy if exists "deals: read" on public.deals;
drop policy if exists "deals: create" on public.deals;
drop policy if exists "deals: update" on public.deals;
drop policy if exists "deals: delete" on public.deals;
create policy "deals: read" on public.deals
  for select to authenticated
  using (broker_id = auth.uid() or created_by = auth.uid() or public.oversees_as(auth.uid(), broker_id));
create policy "deals: create" on public.deals
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and (broker_id = auth.uid() or public.oversees_as(auth.uid(), broker_id))
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
  using (broker_id = auth.uid() or public.oversees_as(auth.uid(), broker_id))
  with check (
    (broker_id = auth.uid() or public.oversees_as(auth.uid(), broker_id))
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
create policy "deals: delete" on public.deals
  for delete to authenticated
  using (public.oversees_as(auth.uid(), broker_id) or (broker_id = auth.uid() and status = 'open'));

-- goals: set by one's leaders
drop policy if exists "goals: read" on public.broker_goals;
drop policy if exists "goals: managers create" on public.broker_goals;
drop policy if exists "goals: managers update" on public.broker_goals;
drop policy if exists "goals: managers delete" on public.broker_goals;
create policy "goals: read" on public.broker_goals
  for select to authenticated using (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));
create policy "goals: leaders create" on public.broker_goals
  for insert to authenticated with check (public.oversees_as(auth.uid(), profile_id));
create policy "goals: leaders update" on public.broker_goals
  for update to authenticated
  using (public.oversees_as(auth.uid(), profile_id)) with check (public.oversees_as(auth.uid(), profile_id));
create policy "goals: leaders delete" on public.broker_goals
  for delete to authenticated using (public.oversees_as(auth.uid(), profile_id));

-- links sent, searches shared
drop policy if exists "property shares: read" on public.property_shares;
drop policy if exists "property shares: stop" on public.property_shares;
drop policy if exists "property shares: delete" on public.property_shares;
create policy "property shares: read" on public.property_shares
  for select to authenticated using (created_by = auth.uid() or public.oversees_as(auth.uid(), created_by));
create policy "property shares: stop" on public.property_shares
  for update to authenticated
  using (created_by = auth.uid() or public.oversees_as(auth.uid(), created_by))
  with check (created_by = auth.uid() or public.oversees_as(auth.uid(), created_by));
create policy "property shares: delete" on public.property_shares
  for delete to authenticated using (created_by = auth.uid() or public.oversees_as(auth.uid(), created_by));
drop policy if exists "search shares: read" on public.search_shares;
drop policy if exists "search shares: stop" on public.search_shares;
create policy "search shares: read" on public.search_shares
  for select to authenticated using (created_by = auth.uid() or public.oversees_as(auth.uid(), created_by));
create policy "search shares: stop" on public.search_shares
  for update to authenticated
  using (created_by = auth.uid() or public.oversees_as(auth.uid(), created_by))
  with check (created_by = auth.uid() or public.oversees_as(auth.uid(), created_by));

-- open houses and their visitors
drop policy if exists "open houses: delete" on public.open_houses;
create policy "open houses: delete" on public.open_houses
  for delete to authenticated using (created_by = auth.uid() or public.oversees_as(auth.uid(), host_id));
drop policy if exists "open house visitors: read" on public.open_house_visitors;
drop policy if exists "open house visitors: delete" on public.open_house_visitors;
create policy "open house visitors: read" on public.open_house_visitors
  for select to authenticated
  using (exists (
    select 1 from public.open_houses h
    where h.id = open_house_visitors.open_house_id and (h.host_id = auth.uid() or public.oversees_as(auth.uid(), h.host_id))
  ));
create policy "open house visitors: delete" on public.open_house_visitors
  for delete to authenticated
  using (exists (
    select 1 from public.open_houses h
    where h.id = open_house_visitors.open_house_id and (h.host_id = auth.uid() or public.oversees_as(auth.uid(), h.host_id))
  ));

-- the plan, contact programs, link events, forms, colleagues, the logo
drop policy if exists "plans: read" on public.broker_plans;
create policy "plans: read" on public.broker_plans
  for select to authenticated using (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));
drop policy if exists "programs: managers delete" on public.contact_programs;
create policy "programs: leaders delete" on public.contact_programs
  for delete to authenticated using (public.is_org_manager(organization_id) and public.can_view_client(client_id));
drop policy if exists "share events: read" on public.share_events;
create policy "share events: read" on public.share_events
  for select to authenticated
  using (
    public.is_org_owner(organization_id)
    or (client_id is not null and public.can_view_client(client_id))
    or exists (
      select 1 from public.property_shares s
      where s.id = share_id and (s.created_by = auth.uid() or public.oversees_as(auth.uid(), s.created_by))
    )
  );
drop policy if exists "lead forms: create" on public.lead_forms;
drop policy if exists "lead forms: update" on public.lead_forms;
drop policy if exists "lead forms: delete" on public.lead_forms;
create policy "lead forms: create" on public.lead_forms
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and (broker_id = auth.uid() or public.oversees_as(auth.uid(), broker_id))
    and (broker_id is null or exists (
      select 1 from public.organization_members m where m.organization_id = lead_forms.organization_id and m.profile_id = lead_forms.broker_id
    ))
  );
create policy "lead forms: update" on public.lead_forms
  for update to authenticated
  using (broker_id = auth.uid() or public.oversees_as(auth.uid(), broker_id))
  with check (broker_id = auth.uid() or public.oversees_as(auth.uid(), broker_id));
create policy "lead forms: delete" on public.lead_forms
  for delete to authenticated using (broker_id = auth.uid() or public.oversees_as(auth.uid(), broker_id));
drop policy if exists "lead form responses: read" on public.lead_form_responses;
create policy "lead form responses: read" on public.lead_form_responses
  for select to authenticated
  using (public.is_org_owner(organization_id) or (client_id is not null and public.can_view_client(client_id)));
drop policy if exists "partners: delete" on public.partners;
create policy "partners: delete" on public.partners
  for delete to authenticated using (created_by = auth.uid() or public.is_org_leader(organization_id));
drop policy if exists "agency logos: upload" on storage.objects;
drop policy if exists "agency logos: delete" on storage.objects;
create policy "agency logos: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'agency-logos' and public.is_org_owner(public.org_from_path(name)));
create policy "agency logos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'agency-logos' and public.is_org_owner(public.org_from_path(name)));

-- ---------------------------------------------------------------------
-- People: roles, where they sit, removing
-- ---------------------------------------------------------------------

-- A role: the owner gives any (never the owner's); an office manager makes managers and brokers in their office.
create or replace function public.set_member_role(target_org uuid, target_profile uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  select role into caller_role from public.organization_members where organization_id = target_org and profile_id = auth.uid();
  if new_role not in ('office_manager', 'manager', 'broker') then raise exception 'invalid_role'; end if;
  if not (
    caller_role = 'owner'
    or (caller_role = 'office_manager' and new_role in ('manager', 'broker') and public.oversees_as(auth.uid(), target_profile)
        and (select role from public.organization_members where organization_id = target_org and profile_id = target_profile) in ('manager', 'broker'))
  ) then
    raise exception 'forbidden';
  end if;

  update public.organization_members
  set role = new_role
  where organization_id = target_org and profile_id = target_profile and role <> 'owner';
  if not found then raise exception 'not_found'; end if;

  -- no longer a team manager: the team has none
  if new_role <> 'manager' then
    update public.teams set manager_id = null where manager_id = target_profile;
  end if;
end;
$$;

-- Where someone sits: an office, a team (a team's office goes with it). The owner anyone;
-- an office manager the people of their office, within it.
create or replace function public.assign_member(target_org uuid, target_profile uuid, new_office uuid, new_team uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  team_office uuid;
begin
  select role into caller_role from public.organization_members where organization_id = target_org and profile_id = auth.uid();
  if new_team is not null then
    select office_id into team_office from public.teams where id = new_team and organization_id = target_org;
    if not found then raise exception 'invalid_team'; end if;
    new_office := coalesce(team_office, new_office);
  end if;
  if new_office is not null and not exists (select 1 from public.offices where id = new_office and organization_id = target_org) then
    raise exception 'invalid_office';
  end if;
  if not (
    caller_role = 'owner'
    or (caller_role = 'office_manager'
        and (public.oversees_as(auth.uid(), target_profile)
             or (select office_id from public.organization_members where organization_id = target_org and profile_id = target_profile) is null)
        and new_office is not distinct from public.my_office(target_org))
  ) then
    raise exception 'forbidden';
  end if;

  update public.organization_members
  set office_id = new_office, team_id = new_team
  where organization_id = target_org and profile_id = target_profile;
  if not found then raise exception 'not_found'; end if;

  -- a manager moved off their team leaves it without a manager
  update public.teams set manager_id = null
  where manager_id = target_profile and id is distinct from new_team;
end;
$$;

revoke execute on function public.assign_member(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_member(uuid, uuid, uuid, uuid) to authenticated;

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
  -- the owner anyone; an office manager the managers and brokers of their office; a team manager their brokers
  if not (
    caller_role = 'owner'
    or (caller_role in ('office_manager', 'manager') and target_role in ('manager', 'broker')
        and (caller_role = 'office_manager' or target_role = 'broker')
        and public.oversees_as(auth.uid(), target_profile))
  ) then
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
-- Signing up: an agency (its details, its first office) or a solo broker;
-- or accepting an invitation (with its office and team)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite record;
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  new_org_id uuid;
  first_office uuid;
  account text := case when meta ->> 'account_type' = 'solo' then 'solo' else 'agency' end;
  agency_name text;
  clean_eik text := nullif(regexp_replace(coalesce(meta ->> 'eik', ''), '\D', '', 'g'), '');
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id, new.email, nullif(meta ->> 'full_name', ''),
    left(nullif(btrim(coalesce(meta ->> 'phone', '')), ''), 40)
  );

  select * into invite
  from public.organization_invitations
  where lower(email) = lower(new.email) and accepted_at is null
  order by created_at
  limit 1;

  if found then
    -- the team's office goes with the team
    insert into public.organization_members (organization_id, profile_id, role, office_id, team_id)
    values (
      invite.organization_id, new.id, invite.role,
      coalesce((select office_id from public.teams where id = invite.team_id), invite.office_id),
      invite.team_id
    );
    -- invited to lead a team: the team is theirs (if it has no manager yet)
    if invite.role = 'manager' and invite.team_id is not null then
      update public.teams set manager_id = new.id where id = invite.team_id and manager_id is null;
    end if;
    update public.organization_invitations set accepted_at = now() where id = invite.id;
    return new;
  end if;

  agency_name := left(coalesce(
    nullif(btrim(meta ->> 'agency_name'), ''),
    nullif(btrim(meta ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  ), 120);

  insert into public.organizations (name, kind, eik, legal_name, city, address, phone, email, website)
  values (
    agency_name, account,
    case when clean_eik ~ '^[0-9]{9}([0-9]{4})?$' then clean_eik end,
    left(nullif(btrim(coalesce(meta ->> 'legal_name', '')), ''), 200),
    left(nullif(btrim(coalesce(meta ->> 'city', '')), ''), 80),
    left(nullif(btrim(coalesce(meta ->> 'address', '')), ''), 300),
    left(nullif(btrim(coalesce(meta ->> 'agency_phone', '')), ''), 40),
    left(new.email, 200),
    left(nullif(btrim(coalesce(meta ->> 'website', '')), ''), 200)
  )
  returning id into new_org_id;

  -- an agency starts with its first office (where it is)
  if account = 'agency' then
    insert into public.offices (organization_id, name, city, address, phone)
    values (
      new_org_id,
      case when char_length(btrim(coalesce(meta ->> 'city', ''))) >= 2 then left(btrim(meta ->> 'city'), 80) else 'Централен офис' end,
      left(nullif(btrim(coalesce(meta ->> 'city', '')), ''), 80),
      left(nullif(btrim(coalesce(meta ->> 'address', '')), ''), 200),
      left(nullif(btrim(coalesce(meta ->> 'agency_phone', '')), ''), 40)
    )
    returning id into first_office;
  end if;

  insert into public.organization_members (organization_id, profile_id, role, office_id)
  values (new_org_id, new.id, 'owner', first_office);
  return new;
end;
$$;
