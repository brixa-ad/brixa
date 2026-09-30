-- =====================================================================
-- BRIXA — migration 031: my business (How to Get Rich in Real Estate)
--   • the broker's own numbers: their share of the commission, their
--     expenses by category, a monthly budget, and "pay yourself first"
--     (a part of every commission towards a goal, e.g. a first rental)
--   • personal: only the broker sees them — not even the managers
-- Run once in Supabase → SQL Editor → New query → Run (after 030).
-- =====================================================================

create table public.broker_finance (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- the part of the (net) commission that is the broker's own income
  commission_share numeric(5, 2) not null default 100 check (commission_share between 0 and 100),
  -- pay yourself first: this part of every income goes towards the goal
  savings_percent numeric(5, 2) not null default 10 check (savings_percent between 0 and 100),
  savings_goal numeric(12, 2) check (savings_goal is null or savings_goal between 0 and 100000000),
  savings_goal_name text check (savings_goal_name is null or char_length(savings_goal_name) <= 120),
  -- a monthly budget per expense category: {"marketing": 300, ...}
  budget jsonb not null default '{}'::jsonb check (jsonb_typeof(budget) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.broker_finance enable row level security;

create policy "finance: my own" on public.broker_finance
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.is_org_member(organization_id));

create table public.broker_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  spent_on date not null default public.sofia_today(),
  category text not null check (category in ('marketing', 'transport', 'phone', 'education', 'office', 'clients', 'fees', 'other')),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);

create index broker_expenses_profile_idx on public.broker_expenses (profile_id, spent_on desc);

alter table public.broker_expenses enable row level security;

create policy "expenses: my own" on public.broker_expenses
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.is_org_member(organization_id));
