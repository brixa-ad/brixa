-- =====================================================================
-- BRIXA — migration 005: clients (buyers, sellers, tenants, landlords,
-- investors), what buyers are looking for, and the seller of a property.
-- Run once after 004_shared_listings.sql.
--
-- Visibility: a broker sees only their own clients; managers see all.
-- Colleagues can see a property but not who its owner/seller is.
-- =====================================================================

-- "+359 888 123 456", "00359888123456" and "0888123456" are the same number.
create or replace function public.normalize_phone(raw text)
returns text
language sql
immutable
as $$
  select case
    when digits = '' then null
    when digits like '00359%' then '0' || substr(digits, 6)
    when digits like '359%' and length(digits) >= 11 then '0' || substr(digits, 4)
    else digits
  end
  from (select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as digits) d;
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  responsible_broker_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,

  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text check (phone is null or char_length(phone) <= 40),
  phone_normalized text generated always as (public.normalize_phone(phone)) stored,
  email text check (email is null or char_length(email) <= 200),

  types text[] not null
    check (cardinality(types) >= 1 and types <@ array['buyer', 'seller', 'tenant', 'landlord', 'investor']),
  client_class text not null default 'C' check (client_class in ('A', 'B', 'C')),
  source text check (source in (
    'personal', 'referral', 'email', 'google', 'facebook', 'instagram',
    'realistimo', 'yavlena', 'billboard', 'signs'
  )),
  stage text not null default 'new_contact' check (stage in (
    'new_contact', 'called', 'presentation', 'viewing', 'negotiation',
    'deposit', 'deal', 'lost', 'correspondence'
  )),
  notes text check (notes is null or char_length(notes) <= 5000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_org_idx on public.clients (organization_id, updated_at desc);
create index clients_broker_idx on public.clients (responsible_broker_id);
-- One client per phone number in an agency.
create unique index clients_phone_unique
  on public.clients (organization_id, phone_normalized)
  where phone_normalized is not null;

create trigger clients_touch_updated_at
  before update on public.clients
  for each row execute function public.touch_updated_at();

-- What a buyer / tenant is looking for (one search per client).
create table public.client_searches (
  client_id uuid primary key references public.clients (id) on delete cascade,
  operation text not null default 'sale' check (operation in ('sale', 'rent')),
  subtype_ids uuid[] not null default '{}',
  settlement_ids uuid[] not null default '{}',
  neighborhood_ids uuid[] not null default '{}',
  budget_min numeric(14, 2) check (budget_min is null or budget_min >= 0),
  budget_max numeric(14, 2) check (budget_max is null or budget_max >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN', 'USD')),
  area_min numeric(10, 2) check (area_min is null or area_min >= 0),
  area_max numeric(10, 2) check (area_max is null or area_max >= 0),
  rooms_min int check (rooms_min is null or rooms_min >= 0),
  rooms_max int check (rooms_max is null or rooms_max >= 0),
  feature_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_min <= budget_max),
  check (area_min is null or area_max is null or area_min <= area_max),
  check (rooms_min is null or rooms_max is null or rooms_min <= rooms_max)
);

create trigger client_searches_touch_updated_at
  before update on public.client_searches
  for each row execute function public.touch_updated_at();

-- The owner / seller of a listing.
alter table public.properties
  add column owner_client_id uuid references public.clients (id) on delete set null;
create index properties_owner_client_idx on public.properties (owner_client_id);

-- The owner must be a client of the same agency.
create or replace function public.check_property_owner_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_client_id is not null and not exists (
    select 1 from public.clients
    where id = new.owner_client_id and organization_id = new.organization_id
  ) then
    raise exception 'owner_client_not_in_agency';
  end if;
  return new;
end;
$$;

create trigger properties_check_owner_client
  before insert or update of owner_client_id on public.properties
  for each row execute function public.check_property_owner_client();

-- ---------------------------------------------------------------------
-- Helpers
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
      and (m.role in ('owner', 'manager') or c.responsible_broker_id = auth.uid())
  );
$$;

-- Duplicate check that reveals only WHOSE client it is, never the client's data.
create or replace function public.client_phone_owner(target_org uuid, raw_phone text, exclude_client uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.full_name, p.email, '—')
  from public.clients c
  left join public.profiles p on p.id = c.responsible_broker_id
  where public.is_org_member(target_org)
    and c.organization_id = target_org
    and c.phone_normalized = public.normalize_phone(raw_phone)
    and (exclude_client is null or c.id <> exclude_client)
  limit 1;
$$;

-- A leaving colleague's clients move together with their properties.
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

  update public.properties
  set responsible_broker_id = reassign_to
  where organization_id = target_org and responsible_broker_id = target_profile;

  update public.clients
  set responsible_broker_id = reassign_to
  where organization_id = target_org and responsible_broker_id = target_profile;

  delete from public.organization_members
  where organization_id = target_org and profile_id = target_profile;
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.client_searches enable row level security;

create policy "clients: read own or as manager" on public.clients
  for select to authenticated
  using (
    public.is_org_manager(organization_id)
    or (public.is_org_member(organization_id) and responsible_broker_id = auth.uid())
  );

create policy "clients: create own or as manager" on public.clients
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_org_manager(organization_id)
      or (public.is_org_member(organization_id) and responsible_broker_id = auth.uid())
    )
  );

create policy "clients: update own or as manager" on public.clients
  for update to authenticated
  using (
    public.is_org_manager(organization_id)
    or (public.is_org_member(organization_id) and responsible_broker_id = auth.uid())
  )
  with check (
    public.is_org_manager(organization_id)
    or (public.is_org_member(organization_id) and responsible_broker_id = auth.uid())
  );

create policy "clients: managers delete" on public.clients
  for delete to authenticated using (public.is_org_manager(organization_id));

create policy "client searches: read" on public.client_searches
  for select to authenticated using (public.can_view_client(client_id));
create policy "client searches: insert" on public.client_searches
  for insert to authenticated with check (public.can_view_client(client_id));
create policy "client searches: update" on public.client_searches
  for update to authenticated
  using (public.can_view_client(client_id))
  with check (public.can_view_client(client_id));
create policy "client searches: delete" on public.client_searches
  for delete to authenticated using (public.can_view_client(client_id));
