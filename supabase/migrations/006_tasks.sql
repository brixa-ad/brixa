-- =====================================================================
-- BRIXA — migration 006: tasks, activity log, in-app notifications
-- Run once after 005_clients.sql.
--
--   tasks          — assigned by a manager or created by the broker; linked to a
--                    client and/or property; unfinished ones roll to the next day
--   activities     — every call / email / meeting / viewing / note; completing a
--                    task logs one automatically (feeds daily goals & rankings)
--   notifications  — the bell: new task, task done, task not done in time
-- =====================================================================

-- "Today" for the agency (Bulgaria).
create or replace function public.sofia_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Sofia')::date;
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  assigned_to uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,

  title text not null check (char_length(title) between 2 and 200),
  description text check (description is null or char_length(description) <= 2000),
  type text not null default 'call'
    check (type in ('call', 'email', 'message', 'meeting', 'viewing', 'other')),
  client_id uuid references public.clients (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,

  due_date date not null default public.sofia_today(),
  due_time time,

  status text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  completion_note text check (completion_note is null or char_length(completion_note) <= 2000),
  overdue_notified_on date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_assignee_idx on public.tasks (assigned_to, status, due_date);
create index tasks_org_idx on public.tasks (organization_id, status, due_date);
create index tasks_client_idx on public.tasks (client_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null
    check (type in ('call', 'email', 'message', 'meeting', 'viewing', 'note', 'task')),
  client_id uuid references public.clients (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  note text check (note is null or char_length(note) <= 2000),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index activities_org_idx on public.activities (organization_id, occurred_at desc);
create index activities_client_idx on public.activities (client_id, occurred_at desc);
create index activities_profile_idx on public.activities (profile_id, occurred_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  -- the app renders the text from type + data, in the reader's language
  type text not null,
  data jsonb not null default '{}',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- ---------------------------------------------------------------------
-- Notification helper (internal: only triggers / scheduled jobs call it)
-- ---------------------------------------------------------------------
create or replace function public.notify(
  target_org uuid, recipient uuid, actor uuid, kind text, payload jsonb, target_link text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (organization_id, recipient_id, actor_id, type, data, link)
  values (target_org, recipient, actor, kind, coalesce(payload, '{}'), target_link);
$$;

revoke execute on function public.notify(uuid, uuid, uuid, text, jsonb, text) from public, anon, authenticated;

create or replace function public.person_name(target_profile uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(full_name, email) from public.profiles where id = target_profile;
$$;

-- ---------------------------------------------------------------------
-- Task triggers
-- ---------------------------------------------------------------------

-- A broker can only tick off (or re-open) a task someone else gave them;
-- the task itself is the manager's to change.
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
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_guard_update
  before update on public.tasks
  for each row execute function public.guard_task_update();

-- New task from someone else → tell the assignee.
create or replace function public.on_task_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null and new.created_by <> new.assigned_to then
    perform public.notify(
      new.organization_id, new.assigned_to, new.created_by, 'task_assigned',
      jsonb_build_object('title', new.title, 'actor', public.person_name(new.created_by), 'due', new.due_date),
      '/tasks/' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger tasks_on_created
  after insert on public.tasks
  for each row execute function public.on_task_created();

-- Done → log the activity (counts toward goals) and tell whoever gave the task.
-- Re-opened → remove that activity again.
create or replace function public.on_task_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  doer uuid := coalesce(new.completed_by, new.assigned_to);
begin
  if new.status = 'done' and old.status <> 'done' then
    insert into public.activities (organization_id, profile_id, type, client_id, property_id, task_id, note)
    values (
      new.organization_id, doer,
      case new.type when 'other' then 'task' else new.type end,
      new.client_id, new.property_id, new.id, new.completion_note
    );

    if new.created_by is not null and new.created_by <> doer then
      perform public.notify(
        new.organization_id, new.created_by, doer, 'task_done',
        jsonb_build_object('title', new.title, 'actor', public.person_name(doer)),
        '/tasks/' || new.id
      );
    end if;
  elsif new.status = 'open' and old.status = 'done' then
    delete from public.activities where task_id = new.id;
  end if;
  return new;
end;
$$;

create trigger tasks_on_status_changed
  after update of status on public.tasks
  for each row execute function public.on_task_status_changed();

-- ---------------------------------------------------------------------
-- Not done in time → tell the broker and the managers (run by a schedule)
--   • tasks with a time: 15 minutes after that time on the day
--   • everything else still open (incl. carried over): at 18:00 each day
-- ---------------------------------------------------------------------
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
        and role in ('owner', 'manager')
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

revoke execute on function public.notify_overdue_tasks(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- A leaving colleague's open tasks move with their clients and properties
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

  delete from public.organization_members
  where organization_id = target_org and profile_id = target_profile;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.activities enable row level security;
alter table public.notifications enable row level security;

-- tasks: mine (given to me or by me); managers see the whole agency
create policy "tasks: read" on public.tasks
  for select to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or public.is_org_manager(organization_id)
  );

create policy "tasks: create" on public.tasks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and (assigned_to = auth.uid() or public.is_org_manager(organization_id))
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = tasks.organization_id and m.profile_id = tasks.assigned_to
    )
  );

create policy "tasks: update" on public.tasks
  for update to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or public.is_org_manager(organization_id)
  )
  with check (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = tasks.organization_id and m.profile_id = tasks.assigned_to
    )
  );

create policy "tasks: delete" on public.tasks
  for delete to authenticated
  using (created_by = auth.uid() or public.is_org_manager(organization_id));

-- activities: my own log; managers see everyone's
create policy "activities: read" on public.activities
  for select to authenticated
  using (profile_id = auth.uid() or public.is_org_manager(organization_id));

create policy "activities: create" on public.activities
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.is_org_member(organization_id)
    and (client_id is null or public.can_view_client(client_id))
    and (property_id is null or public.can_view_property(property_id))
  );

create policy "activities: delete" on public.activities
  for delete to authenticated
  using (profile_id = auth.uid() or public.is_org_manager(organization_id));

-- notifications: only the recipient; created only by the functions above
create policy "notifications: read" on public.notifications
  for select to authenticated using (recipient_id = auth.uid());
create policy "notifications: mark read" on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy "notifications: delete" on public.notifications
  for delete to authenticated using (recipient_id = auth.uid());
