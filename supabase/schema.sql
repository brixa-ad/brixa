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
  created_at timestamptz not null default now(),
  constraint profiles_avatar_path_check check (avatar_path is null or avatar_path like id::text || '/%')
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
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
