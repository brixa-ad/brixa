-- =====================================================================
-- BRIXA — migration 028: contact programs and greetings
--   • a client can follow a contact program (new contact — 8 weeks,
--     a client for life after the deal, a year of care, weekly owner
--     reports): BRIXA opens the next step's task when one is done
--   • a client's birthday (day and month) for greetings
-- Run once in Supabase → SQL Editor → New query → Run (after 027).
-- =====================================================================

alter table public.clients
  add column birth_day smallint check (birth_day between 1 and 31),
  add column birth_month smallint check (birth_month between 1 and 12),
  add constraint clients_birthday_whole check ((birth_day is null) = (birth_month is null));

-- ---------------------------------------------------------------------
-- A client in a program (one active at a time)
-- ---------------------------------------------------------------------
create table public.contact_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  program text not null check (program in ('new_contact', 'after_deal', 'sphere', 'owner_updates')),
  -- the step whose task is open now (0-based), and how many times a repeating program went round
  step int not null default 0 check (step between 0 and 100),
  round int not null default 1 check (round >= 1),
  status text not null default 'active' check (status in ('active', 'stopped', 'finished')),
  started_on date not null default public.sofia_today(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index contact_programs_one_active on public.contact_programs (client_id) where status = 'active';
create index contact_programs_client_idx on public.contact_programs (client_id, created_at desc);

create trigger contact_programs_touch_updated_at
  before update on public.contact_programs
  for each row execute function public.touch_updated_at();

alter table public.contact_programs enable row level security;

-- whoever sees the client (their broker, the managers)
create policy "programs: read" on public.contact_programs
  for select to authenticated
  using (public.can_view_client(client_id));

-- only for a client with a broker, in the same agency
create policy "programs: create" on public.contact_programs
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_view_client(client_id)
    and exists (
      select 1 from public.clients c
      where c.id = contact_programs.client_id
        and c.organization_id = contact_programs.organization_id
        and c.responsible_broker_id is not null
    )
  );

create policy "programs: update" on public.contact_programs
  for update to authenticated
  using (public.can_view_client(client_id))
  with check (
    public.can_view_client(client_id)
    and exists (
      select 1 from public.clients c
      where c.id = contact_programs.client_id and c.organization_id = contact_programs.organization_id
    )
  );

create policy "programs: managers delete" on public.contact_programs
  for delete to authenticated
  using (public.is_org_manager(organization_id));

-- ---------------------------------------------------------------------
-- A task can be a step of a program
-- ---------------------------------------------------------------------
alter table public.tasks
  add column program_id uuid references public.contact_programs (id) on delete set null,
  add column program_step int check (program_step is null or program_step between 0 and 100);

create index tasks_program_idx on public.tasks (program_id) where program_id is not null;

-- a step belongs to the same agency and client as its program
create or replace function public.check_task_program()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.program_id is null then
    return new;
  end if;
  -- the task moved to another client (or the client was deleted): it leaves the program
  if tg_op = 'UPDATE' and new.client_id is distinct from old.client_id then
    new.program_id := null;
    new.program_step := null;
    return new;
  end if;
  if not exists (
    select 1 from public.contact_programs p
    where p.id = new.program_id and p.organization_id = new.organization_id and p.client_id = new.client_id
  ) then
    raise exception 'task_program_mismatch';
  end if;
  return new;
end;
$$;

create trigger tasks_check_program
  before insert or update of program_id, client_id on public.tasks
  for each row execute function public.check_task_program();
