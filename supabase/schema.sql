-- =====================================================================
-- BRIXA — database schema
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- Then run seed.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Accounts: profiles, organizations (agencies), members, invitations
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text check (phone is null or char_length(phone) <= 40),
  job_title text check (job_title is null or char_length(job_title) <= 80),
  bio text check (bio is null or char_length(bio) <= 1000),
  areas text[] not null default '{}' check (cardinality(areas) <= 20),
  -- avatars/<profile id>/<file>
  avatar_path text,
  -- for "what one hour of your time is worth"
  weekly_hours numeric(4, 1) not null default 40 check (weekly_hours between 1 and 100),
  created_at timestamptz not null default now(),
  constraint profiles_avatar_path_check check (avatar_path is null or avatar_path like id::text || '/%')
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- commission defaults: sale = % of the price, rent = months of rent
  commission_sale_percent numeric(5, 2) not null default 3 check (commission_sale_percent between 0 and 100),
  commission_rent_months numeric(4, 2) not null default 1 check (commission_rent_months between 0 and 24),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'broker' check (role in ('owner', 'manager', 'broker')),
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

create index organization_members_profile_idx on public.organization_members (profile_id);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null default 'broker' check (role in ('manager', 'broker')),
  invited_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index organization_invitations_pending_idx
  on public.organization_invitations (organization_id, lower(email))
  where accepted_at is null;

-- ---------------------------------------------------------------------
-- Property taxonomy
-- ---------------------------------------------------------------------

create table public.property_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  name_en text,
  sort_order int not null default 0
);

create table public.property_subtypes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.property_categories (id) on delete cascade,
  code text not null unique,
  name text not null,
  name_en text,
  sort_order int not null default 0
);

create table public.property_features (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  name_en text
);

create table public.property_subtype_features (
  subtype_id uuid not null references public.property_subtypes (id) on delete cascade,
  feature_id uuid not null references public.property_features (id) on delete cascade,
  primary key (subtype_id, feature_id)
);

-- ---------------------------------------------------------------------
-- Geography (Bulgaria)
-- ---------------------------------------------------------------------

create table public.geo_regions (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null
);

create table public.geo_settlements (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.geo_regions (id) on delete cascade,
  ekatte_code text,
  name text not null,
  settlement_type text not null check (settlement_type in ('гр.', 'с.'))
);

create index geo_settlements_region_idx on public.geo_settlements (region_id);

create table public.geo_neighborhoods (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.geo_settlements (id) on delete cascade,
  name text not null
);

create index geo_neighborhoods_settlement_idx on public.geo_neighborhoods (settlement_id);

-- ---------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  category_id uuid not null references public.property_categories (id),
  subtype_id uuid not null references public.property_subtypes (id),
  operation_type text not null check (operation_type in ('sale', 'rent', 'buy', 'wanted')),
  status text not null default 'active'
    check (status in ('active', 'reserved', 'sold', 'rented', 'withdrawn')),

  title text not null,

  region_id uuid references public.geo_regions (id),
  settlement_id uuid references public.geo_settlements (id),
  neighborhood_id uuid references public.geo_neighborhoods (id),
  address text,

  area numeric(10, 2) check (area is null or area > 0),
  rooms int check (rooms is null or rooms >= 0),
  bedrooms int check (bedrooms is null or bedrooms >= 0),
  floor int,
  total_floors int check (total_floors is null or total_floors >= 0),

  construction_type text,
  condition text,
  exposure text,
  furnishing text,
  heating text,

  asking_price numeric(14, 2) check (asking_price is null or asking_price >= 0),
  current_price numeric(14, 2) check (current_price is null or current_price >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN', 'USD')),

  exclusive_contract boolean not null default false,
  -- sale: % of the price, rent: months of rent; empty = the agency default
  commission_rate numeric(6, 2) check (commission_rate is null or commission_rate between 0 and 100),
  description text,

  responsible_broker_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_org_idx on public.properties (organization_id, created_at desc);
create index properties_broker_idx on public.properties (responsible_broker_id);

create table public.property_feature_values (
  property_id uuid not null references public.properties (id) on delete cascade,
  feature_id uuid not null references public.property_features (id) on delete cascade,
  boolean_value boolean not null default true,
  primary key (property_id, feature_id)
);

create table public.property_price_history (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  old_price numeric(14, 2),
  new_price numeric(14, 2),
  currency text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index property_price_history_property_idx
  on public.property_price_history (property_id, changed_at desc);

create table public.property_photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  storage_path text not null unique,
  position int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index property_photos_property_idx on public.property_photos (property_id, position);

-- ---------------------------------------------------------------------
-- Helper functions (security definer so RLS policies don't recurse)
-- ---------------------------------------------------------------------

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org and profile_id = auth.uid()
  );
$$;

create or replace function public.is_org_owner(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org and profile_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.is_org_manager(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org and profile_id = auth.uid() and role in ('owner', 'manager')
  );
$$;

create or replace function public.can_view_property(target_property uuid)
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
    where p.id = target_property and m.profile_id = auth.uid()
  );
$$;

-- Managers: any property of their agency. Brokers: only their own.
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
      and (m.role in ('owner', 'manager') or p.responsible_broker_id = auth.uid())
  );
$$;

-- Storage paths are <organization_id>/<property_id>/<file>
create or replace function public.can_view_photo_path(object_name text)
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
      and (m.role in ('owner', 'manager') or p.responsible_broker_id = auth.uid())
  );
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

-- Only the owner promotes / demotes (never to or from owner).
create or replace function public.set_member_role(target_org uuid, target_profile uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_owner(target_org) then raise exception 'forbidden'; end if;
  if new_role not in ('manager', 'broker') then raise exception 'invalid_role'; end if;

  update public.organization_members
  set role = new_role
  where organization_id = target_org and profile_id = target_profile and role <> 'owner';

  if not found then raise exception 'not_found'; end if;
end;
$$;

create or replace function public.shares_org_with(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.profile_id = auth.uid() and theirs.profile_id = target_profile
  );
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- New sign-up → profile + (invited org OR brand-new org as owner)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite record;
  new_org_id uuid;
  agency_name text;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''));

  select * into invite
  from public.organization_invitations
  where lower(email) = lower(new.email) and accepted_at is null
  order by created_at
  limit 1;

  if found then
    insert into public.organization_members (organization_id, profile_id, role)
    values (invite.organization_id, new.id, invite.role);

    update public.organization_invitations
    set accepted_at = now()
    where id = invite.id;
  else
    agency_name := coalesce(
      nullif(new.raw_user_meta_data ->> 'agency_name', ''),
      split_part(new.email, '@', 1)
    );

    insert into public.organizations (name)
    values (agency_name)
    returning id into new_org_id;

    insert into public.organization_members (organization_id, profile_id, role)
    values (new_org_id, new.id, 'owner');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Email and id come from sign-up; users edit everything else on their profile.
create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  new.email := old.email;
  return new;
end;
$$;

create trigger profiles_protect_identity
  before update on public.profiles
  for each row execute function public.protect_profile_identity();

-- Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger properties_touch_updated_at
  before update on public.properties
  for each row execute function public.touch_updated_at();

-- Price history is written by the database, never by the app
create or replace function public.log_property_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.current_price is not null then
      insert into public.property_price_history (property_id, old_price, new_price, currency, changed_by)
      values (new.id, null, new.current_price, new.currency, auth.uid());
    end if;
  elsif new.current_price is distinct from old.current_price
     or new.currency is distinct from old.currency then
    insert into public.property_price_history (property_id, old_price, new_price, currency, changed_by)
    values (new.id, old.current_price, new.current_price, new.currency, auth.uid());
  end if;

  return new;
end;
$$;

create trigger properties_log_price
  after insert or update of current_price, currency on public.properties
  for each row execute function public.log_property_price();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.property_categories enable row level security;
alter table public.property_subtypes enable row level security;
alter table public.property_features enable row level security;
alter table public.property_subtype_features enable row level security;
alter table public.geo_regions enable row level security;
alter table public.geo_settlements enable row level security;
alter table public.geo_neighborhoods enable row level security;
alter table public.properties enable row level security;
alter table public.property_feature_values enable row level security;
alter table public.property_price_history enable row level security;
alter table public.property_photos enable row level security;

-- profiles
create policy "profiles: read self and teammates" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));

create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- organizations
create policy "organizations: members read" on public.organizations
  for select to authenticated using (public.is_org_member(id));

create policy "organizations: owners update" on public.organizations
  for update to authenticated
  using (public.is_org_owner(id)) with check (public.is_org_owner(id));

-- organization_members
create policy "members: members read" on public.organization_members
  for select to authenticated using (public.is_org_member(organization_id));

-- (removing a member goes through remove_member(), which also reassigns their properties)

-- organization_invitations: managers invite brokers, only the owner invites managers
create policy "invitations: managers read" on public.organization_invitations
  for select to authenticated using (public.is_org_manager(organization_id));

create policy "invitations: managers create" on public.organization_invitations
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and (
      public.is_org_owner(organization_id)
      or (public.is_org_manager(organization_id) and role = 'broker')
    )
  );

create policy "invitations: managers delete" on public.organization_invitations
  for delete to authenticated using (public.is_org_manager(organization_id));

-- lookup tables: read-only for signed-in users
create policy "categories: read" on public.property_categories for select to authenticated using (true);
create policy "subtypes: read" on public.property_subtypes for select to authenticated using (true);
create policy "features: read" on public.property_features for select to authenticated using (true);
create policy "subtype features: read" on public.property_subtype_features for select to authenticated using (true);
create policy "regions: read" on public.geo_regions for select to authenticated using (true);
create policy "settlements: read" on public.geo_settlements for select to authenticated using (true);
create policy "neighborhoods: read" on public.geo_neighborhoods for select to authenticated using (true);

-- properties
create policy "properties: members read" on public.properties
  for select to authenticated using (public.is_org_member(organization_id));

create policy "properties: create own or as manager" on public.properties
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_org_manager(organization_id)
      or (public.is_org_member(organization_id) and responsible_broker_id = auth.uid())
    )
  );

-- A broker can edit their own property but cannot hand it to someone else.
create policy "properties: update own or as manager" on public.properties
  for update to authenticated
  using (
    public.is_org_manager(organization_id)
    or (public.is_org_member(organization_id) and responsible_broker_id = auth.uid())
  )
  with check (
    public.is_org_manager(organization_id)
    or (public.is_org_member(organization_id) and responsible_broker_id = auth.uid())
  );

create policy "properties: managers delete" on public.properties
  for delete to authenticated using (public.is_org_manager(organization_id));

-- property_feature_values
create policy "feature values: read" on public.property_feature_values
  for select to authenticated using (public.can_view_property(property_id));
create policy "feature values: insert" on public.property_feature_values
  for insert to authenticated with check (public.can_edit_property(property_id));
create policy "feature values: delete" on public.property_feature_values
  for delete to authenticated using (public.can_edit_property(property_id));

-- property_price_history (inserted only by trigger)
create policy "price history: read" on public.property_price_history
  for select to authenticated using (public.can_view_property(property_id));

-- property_photos
create policy "photos: read" on public.property_photos
  for select to authenticated using (public.can_view_property(property_id));
create policy "photos: insert" on public.property_photos
  for insert to authenticated
  with check (public.can_edit_property(property_id) and created_by = auth.uid());
create policy "photos: update" on public.property_photos
  for update to authenticated
  using (public.can_edit_property(property_id))
  with check (public.can_edit_property(property_id));
create policy "photos: delete" on public.property_photos
  for delete to authenticated using (public.can_edit_property(property_id));

-- ---------------------------------------------------------------------
-- Storage: private bucket for property photos
-- Files are stored as  <organization_id>/<property_id>/<file>.jpg
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-photos', 'property-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "property photos: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'property-photos' and public.can_view_photo_path(name));

create policy "property photos: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-photos' and public.can_edit_photo_path(name));

create policy "property photos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-photos' and public.can_edit_photo_path(name));

-- ---------------------------------------------------------------------
-- Storage: public bucket for profile photos, each user writes only
-- into their own folder  avatars/<profile id>/<file>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

create policy "avatars: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

create policy "avatars: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

-- =====================================================================
-- Clients
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

-- =====================================================================
-- Tasks, activity log, notifications
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


-- =====================================================================
-- Deals, commission goals and the ranking
-- =====================================================================

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
