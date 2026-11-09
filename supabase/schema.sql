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
  -- the phone's bottom bar in the order the user picked (null = default)
  bottom_nav text[] check (bottom_nav is null or cardinality(bottom_nav) between 1 and 5),
  created_at timestamptz not null default now(),
  constraint profiles_avatar_path_check check (avatar_path is null or avatar_path like id::text || '/%')
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- commission defaults: sale = % of the price, rent = months of rent
  commission_sale_percent numeric(5, 2) not null default 3 check (commission_sale_percent between 0 and 100),
  commission_rent_months numeric(4, 2) not null default 1 check (commission_rent_months between 0 and 24),
  -- an external broker who brings a client gets this % of the commission
  referral_percent numeric(5, 2) not null default 10 check (referral_percent between 0 and 100),
  -- follow-up: a new client within N hours, then every N days by class; 0 = never give clients back
  follow_up_first_hours int not null default 24 check (follow_up_first_hours between 1 and 720),
  follow_up_days_a int not null default 2 check (follow_up_days_a between 1 and 365),
  follow_up_days_b int not null default 7 check (follow_up_days_b between 1 and 365),
  follow_up_days_c int not null default 30 check (follow_up_days_c between 1 and 365),
  release_after_days int not null default 7 check (release_after_days between 0 and 365),
  -- contact details and logo (agency-logos/<organization_id>/<file>) for shared listings and reports
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 200),
  website text check (website is null or char_length(website) <= 200),
  address text check (address is null or char_length(address) <= 300),
  logo_path text check (logo_path is null or logo_path like id::text || '/%'),
  default_currency text not null default 'EUR' check (default_currency in ('EUR', 'BGN', 'USD')),
  -- the ranking's point values
  points_deal_double int not null default 50 check (points_deal_double between 0 and 1000),
  points_deal int not null default 30 check (points_deal between 0 and 1000),
  points_listing int not null default 10 check (points_listing between 0 and 1000),
  points_exclusive int not null default 10 check (points_exclusive between 0 and 1000),
  points_viewing int not null default 5 check (points_viewing between 0 and 1000),
  points_meeting int not null default 3 check (points_meeting between 0 and 1000),
  points_client int not null default 2 check (points_client between 0 and 1000),
  points_call int not null default 1 check (points_call between 0 and 1000),
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
    check (status in ('active', 'reserved', 'sold', 'rented', 'withdrawn', 'sold_elsewhere')),

  title text not null,

  region_id uuid references public.geo_regions (id),
  settlement_id uuid references public.geo_settlements (id),
  neighborhood_id uuid references public.geo_neighborhoods (id),
  -- the parts, and the whole line built from them (for search and lists)
  street text check (street is null or char_length(street) <= 120),
  street_no text check (street_no is null or char_length(street_no) <= 20),
  block text check (block is null or char_length(block) <= 20),
  entrance text check (entrance is null or char_length(entrance) <= 10),
  apartment text check (apartment is null or char_length(apartment) <= 20),
  cadastral_id text check (cadastral_id is null or char_length(cadastral_id) <= 60),
  address text,

  area numeric(10, 2) check (area is null or area > 0),
  rooms int check (rooms is null or rooms >= 0),
  bedrooms int check (bedrooms is null or bedrooms >= 0),
  floor int,
  total_floors int check (total_floors is null or total_floors >= 0),

  construction_type text,
  condition text,
  exposure text, -- replaced by exposures (kept for old data)
  exposures text[] not null default '{}'
    check (exposures <@ array['south', 'north', 'east', 'west', 'south_east', 'south_west', 'north_east', 'north_west']),
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

create policy "organizations: managers update" on public.organizations
  for update to authenticated
  using (public.is_org_manager(id)) with check (public.is_org_manager(id));

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
    'personal', 'referral', 'agency', 'email', 'google', 'facebook', 'instagram', 'tiktok',
    'realistimo', 'billboard', 'flyers', 'banner'
  )),
  -- an external broker (or whoever) who referred the client
  referrer text check (referrer is null or char_length(referrer) <= 120),
  stage text not null default 'new_contact' check (stage in (
    'new_contact', 'called', 'presentation', 'viewing', 'negotiation',
    'deposit', 'deal', 'lost', 'correspondence'
  )),
  notes text check (notes is null or char_length(notes) <= 5000),

  -- follow-up: when the current broker got the client, and when the next contact is due
  assigned_at timestamptz,
  follow_up_at timestamptz,
  follow_up_notified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_follow_up_idx on public.clients (follow_up_at) where follow_up_at is not null;
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

-- What a seller / landlord offers (before or without a listing)
create table public.client_offers (
  client_id uuid primary key references public.clients (id) on delete cascade,
  operation text not null default 'sale' check (operation in ('sale', 'rent')),
  subtype_id uuid references public.property_subtypes (id),
  settlement_id uuid references public.geo_settlements (id),
  neighborhood_id uuid references public.geo_neighborhoods (id),
  area numeric(10, 2) check (area is null or area > 0),
  rooms int check (rooms is null or rooms between 0 and 100),
  -- what the owner hopes to get
  price numeric(14, 2) check (price is null or price >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN', 'USD')),
  updated_at timestamptz not null default now()
);

create trigger client_offers_touch_updated_at
  before update on public.client_offers
  for each row execute function public.touch_updated_at();

alter table public.client_offers enable row level security;

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

-- Duplicate check that reveals only WHOSE client it is (or "#free"), never the client's data.
create or replace function public.client_phone_owner(target_org uuid, raw_phone text, exclude_client uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when c.responsible_broker_id is null then '#free' else coalesce(p.full_name, p.email, '—') end
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

create policy "client offers: read" on public.client_offers
  for select to authenticated using (public.can_view_client(client_id));
create policy "client offers: insert" on public.client_offers
  for insert to authenticated with check (public.can_view_client(client_id));
create policy "client offers: update" on public.client_offers
  for update to authenticated
  using (public.can_view_client(client_id))
  with check (public.can_view_client(client_id));
create policy "client offers: delete" on public.client_offers
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
  -- the "in 15 minutes" reminder was sent that day
  reminded_on date,

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
  -- the client's feedback and how it went (viewings, meetings, calls)
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  outcome text check (outcome is null or outcome in ('positive', 'neutral', 'negative')),
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
  -- only the database knows it: its own call to /api/push uses it to fetch what to send
  push_token uuid not null default gen_random_uuid(),
  pushed_at timestamptz,
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
-- the task itself is the manager's to change. Moving a task re-arms its reminders.
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

create policy "activities: update" on public.activities
  for update to authenticated
  using (profile_id = auth.uid() or public.is_org_manager(organization_id))
  with check (profile_id = auth.uid() or public.is_org_manager(organization_id));

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

  -- both sides pay the agency: the seller (property's rate) and the buyer (buyer_rate)
  double_sided boolean not null default false,
  buyer_rate numeric(6, 2) check (buyer_rate is null or buyer_rate between 0 and 100),
  -- the other side of the deal is another agency
  partner_agency text check (partner_agency is null or char_length(partner_agency) <= 120),
  partner_broker text check (partner_broker is null or char_length(partner_broker) <= 120),
  partner_side text check (partner_side is null or partner_side in ('buyer', 'seller')),
  -- when each step happened, or is planned (time: when it's scheduled)
  viewing_on date,
  offer_on date,
  deposit_on date,
  preliminary_on date,
  notary_on date,
  viewing_time time,
  offer_time time,
  deposit_time time,
  preliminary_time time,
  notary_time time,
  -- money the buyer pays along the way
  deposit_amount numeric(14, 2) check (deposit_amount is null or deposit_amount >= 0),
  preliminary_bank numeric(14, 2) check (preliminary_bank is null or preliminary_bank >= 0),
  preliminary_cash numeric(14, 2) check (preliminary_cash is null or preliminary_cash >= 0),
  notary_bank numeric(14, 2) check (notary_bank is null or notary_bank >= 0),
  notary_cash numeric(14, 2) check (notary_cash is null or notary_cash >= 0),
  -- an external broker who brought the client gets a share of the commission
  referral_name text check (referral_name is null or char_length(referral_name) <= 120),
  referral_percent numeric(5, 2) check (referral_percent is null or referral_percent between 0 and 100),
  referral_paid_on date,
  -- what stays with the agency — this is what counts in rankings, goals and statistics
  net_commission numeric(12, 2) generated always as (
    case when commission is null then null
    else round(commission * (100 - coalesce(referral_percent, 0)) / 100, 2) end
  ) stored,

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
  -- what the broker wins for hitting the target
  monthly_bonus text check (monthly_bonus is null or char_length(monthly_bonus) <= 200),
  yearly_bonus text check (yearly_bonus is null or char_length(yearly_bonus) <= 200),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

-- Offers made on a deal (by the buyer, or through another agency)
create table public.deal_offers (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN', 'USD')),
  offered_by text not null check (char_length(offered_by) between 1 and 120),
  agency text check (agency is null or char_length(agency) <= 120),
  offered_on date not null default public.sofia_today(),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  -- what the buyer left to take the property off the market ("стоп капаро")
  hold_deposit numeric(14, 2) check (hold_deposit is null or hold_deposit >= 0),
  note text check (note is null or char_length(note) <= 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index deal_offers_deal_idx on public.deal_offers (deal_id, offered_on desc);

-- Every stage / status change, for the statistics
create table public.deal_stage_log (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.deals (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  stage text not null,
  status text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index deal_stage_log_deal_idx on public.deal_stage_log (deal_id, changed_at);

-- Reminders already sent (internal)
create table public.deal_reminders (
  deal_id uuid not null references public.deals (id) on delete cascade,
  stage text not null,
  -- the evening before, on the day, about an hour before the time
  kind text not null check (kind in ('eve', 'day', 'soon')),
  due date not null,
  primary key (deal_id, stage, kind, due)
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
  select coalesce(sum(net_commission), 0)
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
      and (m.role in ('owner', 'manager') or d.broker_id = auth.uid() or d.created_by = auth.uid())
  );
$$;

-- Managers: any deal. Brokers: their own, until a manager has confirmed it.
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
      and (m.role in ('owner', 'manager') or (d.broker_id = auth.uid() and d.confirmed_at is null))
  );
$$;

-- ---------------------------------------------------------------------
-- Deal triggers
-- ---------------------------------------------------------------------

-- Brokers run their deals; confirming the commission is the manager's.
-- Reaching a stage stamps its date (a planned date in the future becomes today, without the planned time).
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

create trigger deals_on_changed
  after insert or update or delete on public.deals
  for each row execute function public.on_deal_changed();

create or replace function public.log_deal_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage or new.status is distinct from old.status then
    insert into public.deal_stage_log (deal_id, organization_id, stage, status, changed_by)
    values (new.id, new.organization_id, new.stage, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger deals_log_stage
  after insert or update of stage, status on public.deals
  for each row execute function public.log_deal_stage();

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

-- ---------------------------------------------------------------------
-- The ranking: commission (confirmed deals) and activity points
--   with the agency's point values (by default: double deal 50 · deal 30 ·
--   new listing 10 (+10 exclusive) · viewing 5 · meeting 3 · new client 2 · call 1)
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
      case when period = 'all' then date '2000-01-01' else date_trunc(unit, day::timestamp)::date end as from_day,
      case when period = 'all' then date '3000-01-01'
        else (date_trunc(unit, day::timestamp) + ('1 ' || unit)::interval)::date end as to_day
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

alter table public.deal_offers enable row level security;
alter table public.deal_stage_log enable row level security;
alter table public.deal_reminders enable row level security;

create policy "deal offers: read" on public.deal_offers
  for select to authenticated using (public.can_view_deal(deal_id));
create policy "deal offers: create" on public.deal_offers
  for insert to authenticated
  with check (created_by = auth.uid() and public.can_edit_deal(deal_id));
create policy "deal offers: update" on public.deal_offers
  for update to authenticated
  using (public.can_edit_deal(deal_id)) with check (public.can_edit_deal(deal_id));
create policy "deal offers: delete" on public.deal_offers
  for delete to authenticated using (public.can_edit_deal(deal_id));

create policy "deal stage log: read" on public.deal_stage_log
  for select to authenticated using (public.can_view_deal(deal_id));

-- deal_reminders: no policies — only the reminder job writes it

-- ---------------------------------------------------------------------
-- Schedule the reminders (needs Integrations → Cron, enabled with 007)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-deal-dates', '*/15 * * * *', 'select public.notify_deal_dates()');
  end if;
end;
$$;


-- =====================================================================
-- Notifications on the phone (web push)
-- =====================================================================

-- HTTP calls from the database (Supabase's pg_net)
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net is not available — push notifications stay off';
end;
$$;

-- ---------------------------------------------------------------------
-- The devices that receive push notifications
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 10 and 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth_key text not null check (char_length(auth_key) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  -- the device's language, for the text of the notification
  lang text not null default 'bg' check (lang in ('bg', 'en')),
  created_at timestamptz not null default now()
);

create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- ---------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------

-- This device should get my notifications (a device moves to whoever signed in last).
create or replace function public.save_push_subscription(
  sub_endpoint text, sub_p256dh text, sub_auth text, sub_agent text, sub_lang text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if sub_endpoint !~ '^https://' then raise exception 'invalid_endpoint'; end if;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth_key, user_agent, lang)
  values (
    auth.uid(), sub_endpoint, sub_p256dh, sub_auth, left(sub_agent, 300),
    case when sub_lang in ('bg', 'en') then sub_lang else 'bg' end
  )
  on conflict (endpoint) do update
  set profile_id = excluded.profile_id,
      p256dh = excluded.p256dh,
      auth_key = excluded.auth_key,
      user_agent = excluded.user_agent,
      lang = excluded.lang,
      created_at = now();
end;
$$;

-- Called by /api/push with the notification's id and token: marks it sent (once)
-- and returns the text data plus the devices to send it to — and, for a task, the
-- client's phone / e-mail when the recipient may see that client.
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
        or exists (
          select 1 from public.organization_members m
          where m.organization_id = c.organization_id and m.profile_id = claimed.recipient_id
            and m.role in ('owner', 'manager')
        )
      );
  end if;

  return query
  select claimed.type, claimed.data, claimed.link, s.endpoint, s.p256dh, s.auth_key, s.lang,
    contact_phone, contact_email
  from public.push_subscriptions s
  where s.profile_id = claimed.recipient_id;
end;
$$;

-- /api/push reports devices the push service no longer knows (uninstalled, signed out…).
create or replace function public.remove_dead_push_subscriptions(target uuid, token uuid, endpoints text[])
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions s
  using public.notifications n
  where n.id = target and n.push_token = token and n.pushed_at is not null
    and s.profile_id = n.recipient_id
    and s.endpoint = any (endpoints);
$$;

-- "Send me a test notification" from Settings.
create or replace function public.send_test_notification()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  select organization_id into org from public.organization_members where profile_id = auth.uid() limit 1;
  if org is null then raise exception 'forbidden'; end if;
  perform public.notify(org, auth.uid(), null, 'push_test', '{}', '/settings');
end;
$$;

-- New notification → ask the app to push it (only if the recipient has a device).
create or replace function public.push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from public.push_subscriptions where profile_id = new.recipient_id) then
    perform net.http_post(
      url := 'https://brixa-yavlena.vercel.app/api/push',
      body := jsonb_build_object('id', new.id, 'token', new.push_token),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
end;
$$;

create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.push_notification();

-- ---------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

create policy "push subscriptions: read own" on public.push_subscriptions
  for select to authenticated using (profile_id = auth.uid());
create policy "push subscriptions: delete own" on public.push_subscriptions
  for delete to authenticated using (profile_id = auth.uid());
-- saving goes through save_push_subscription()

revoke execute on function public.push_notification() from public, anon, authenticated;
revoke execute on function public.save_push_subscription(text, text, text, text, text) from public, anon;
revoke execute on function public.send_test_notification() from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text, text) to authenticated;
grant execute on function public.send_test_notification() to authenticated;
-- /api/push calls these without a signed-in user; they need the notification's secret token
grant execute on function public.claim_push(uuid, uuid) to anon, authenticated;
grant execute on function public.remove_dead_push_subscriptions(uuid, uuid, text[]) to anon, authenticated;


-- =====================================================================
-- Task reminders, calendar feed, broker results
-- =====================================================================

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


-- =====================================================================
-- Unfinished-task report, property history and documents
-- =====================================================================

-- ---------------------------------------------------------------------
-- Unfinished tasks: next morning (from 08:30) the broker and the managers hear
-- ---------------------------------------------------------------------
create table public.task_digests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (profile_id, day)
);
alter table public.task_digests enable row level security;
-- no policies: only the job below writes it

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
        and role in ('owner', 'manager')
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

revoke execute on function public.notify_missed_tasks(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Property history: status changes (prices are already kept)
-- ---------------------------------------------------------------------
create table public.property_status_log (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties (id) on delete cascade,
  status text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index property_status_log_property_idx on public.property_status_log (property_id, changed_at desc);

create or replace function public.log_property_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.property_status_log (property_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger properties_log_status
  after update of status on public.properties
  for each row execute function public.log_property_status();

alter table public.property_status_log enable row level security;
create policy "property status log: read" on public.property_status_log
  for select to authenticated using (public.can_view_property(property_id));

-- ---------------------------------------------------------------------
-- Property documents (deeds, sketches, contracts…) — the responsible broker
-- and the managers only. Files: <organization_id>/<property_id>/<uuid>/<name>
-- ---------------------------------------------------------------------
create table public.property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  storage_path text not null unique,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  mime_type text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index property_documents_property_idx on public.property_documents (property_id, created_at desc);

alter table public.property_documents enable row level security;
create policy "property documents: read" on public.property_documents
  for select to authenticated using (public.can_edit_property(property_id));
create policy "property documents: add" on public.property_documents
  for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_edit_property(property_id));
create policy "property documents: delete" on public.property_documents
  for delete to authenticated using (public.can_edit_property(property_id));

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
      and (m.role in ('owner', 'manager') or p.responsible_broker_id = auth.uid())
  );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-documents', 'property-documents', false, 20971520, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
])
on conflict (id) do nothing;

create policy "property documents: read files" on storage.objects
  for select to authenticated
  using (bucket_id = 'property-documents' and public.can_manage_property_file(name));
create policy "property documents: upload files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-documents' and public.can_manage_property_file(name));
create policy "property documents: delete files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-documents' and public.can_manage_property_file(name));

-- ---------------------------------------------------------------------
-- Schedule the morning report (needs Cron, on since 007)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-missed-tasks', '*/15 * * * *', 'select public.notify_missed_tasks()');
  end if;
end;
$$;


-- =====================================================================
-- Follow-up and free contacts
-- =====================================================================

-- ---------------------------------------------------------------------
-- Each client's deadline
-- ---------------------------------------------------------------------
-- The next contact is due: a fresh client within N hours of getting them, otherwise
-- the class's days after the last contact. No broker, a closed deal or a lost client → none.
create or replace function public.compute_follow_up(
  target_org uuid, target_client uuid, broker uuid, client_stage text, client_class text, assigned timestamptz
)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when broker is null or client_stage in ('deal', 'lost') then null
    when last_contact.at is null or last_contact.at < assigned then assigned + make_interval(hours => o.follow_up_first_hours)
    else last_contact.at + make_interval(days => case client_class
      when 'A' then o.follow_up_days_a when 'B' then o.follow_up_days_b else o.follow_up_days_c end)
  end
  from public.organizations o
  left join lateral (
    select max(a.occurred_at) as at
    from public.activities a
    where a.client_id = target_client and a.type <> 'note'
  ) last_contact on true
  where o.id = target_org;
$$;

create or replace function public.follow_up_due(target_client uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select public.compute_follow_up(
    c.organization_id, c.id, c.responsible_broker_id, c.stage, c.client_class, coalesce(c.assigned_at, c.created_at)
  )
  from public.clients c
  where c.id = target_client;
$$;

revoke execute on function public.compute_follow_up(uuid, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.follow_up_due(uuid) from public, anon, authenticated;

-- Broker, class or stage changes → the deadline moves with them.
create or replace function public.guard_client_follow_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.assigned_at := case when new.responsible_broker_id is null then null else now() end;
  elsif new.responsible_broker_id is distinct from old.responsible_broker_id then
    new.assigned_at := case when new.responsible_broker_id is null then null else now() end;
  end if;

  if tg_op = 'INSERT'
     or new.responsible_broker_id is distinct from old.responsible_broker_id
     or new.client_class is distinct from old.client_class
     or new.stage is distinct from old.stage then
    new.follow_up_at := public.compute_follow_up(
      new.organization_id, new.id, new.responsible_broker_id, new.stage, new.client_class,
      coalesce(new.assigned_at, new.created_at, now())
    );
    new.follow_up_notified_at := null;
  end if;
  return new;
end;
$$;

create trigger clients_guard_follow_up
  before insert or update on public.clients
  for each row execute function public.guard_client_follow_up();

-- Who needs to know: a new free contact → everyone; a client handed to you → you;
-- a free contact taken → the managers.
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
      where organization_id = new.organization_id and role in ('owner', 'manager') and profile_id <> auth.uid()
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

create trigger clients_on_owner_changed
  after insert or update of responsible_broker_id on public.clients
  for each row execute function public.on_client_owner_changed();

-- A call, meeting, viewing… with the client resets the deadline (a plain note doesn't).
create or replace function public.on_client_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.client_id else new.client_id end;
begin
  if target is not null then
    update public.clients
    set follow_up_at = public.follow_up_due(id), follow_up_notified_at = null
    where id = target;
  end if;
  return null;
end;
$$;

create trigger activities_follow_up
  after insert or delete on public.activities
  for each row execute function public.on_client_contact();

-- ---------------------------------------------------------------------
-- Taking a free contact: the first one wins
-- ---------------------------------------------------------------------
create or replace function public.claim_client(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clients
  set responsible_broker_id = auth.uid()
  where id = target
    and responsible_broker_id is null
    and public.is_org_member(organization_id);
  return found;
end;
$$;

revoke execute on function public.claim_client(uuid) from public, anon;
grant execute on function public.claim_client(uuid) to authenticated;

-- The managers set the rules; everyone's deadlines follow.
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
  where profile_id = auth.uid() and role in ('owner', 'manager')
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

revoke execute on function public.set_follow_up_rules(int, int, int, int, int) from public, anon;
grant execute on function public.set_follow_up_rules(int, int, int, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- The job (every 15 minutes): missed deadlines and giving clients back
-- (who to contact today is in the 08:00 morning brief)
-- ---------------------------------------------------------------------
create table public.follow_up_digests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (profile_id, day)
);
alter table public.follow_up_digests enable row level security;
-- no policies: only the job writes it

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
      where organization_id = client.organization_id and role in ('owner', 'manager')
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
      where organization_id = client.organization_id and role in ('owner', 'manager')
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

revoke execute on function public.notify_follow_ups(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Access: free contacts are open to the whole agency
-- ---------------------------------------------------------------------
create policy "clients: free contacts readable by the agency" on public.clients
  for select to authenticated
  using (responsible_broker_id is null and public.is_org_member(organization_id));

-- ---------------------------------------------------------------------
-- Schedule (needs Cron, on since 007)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-follow-ups', '*/15 * * * *', 'select public.notify_follow_ups()');
  end if;
end;
$$;


-- =====================================================================
-- Brix, the AI assistant
-- =====================================================================

-- ---------------------------------------------------------------------
-- Brix's plan for the day, one per person per day
-- ---------------------------------------------------------------------
create table public.brix_briefs (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now(),
  primary key (profile_id, day)
);

alter table public.brix_briefs enable row level security;
create policy "brix briefs: read own" on public.brix_briefs
  for select to authenticated using (profile_id = auth.uid());
create policy "brix briefs: write own" on public.brix_briefs
  for insert to authenticated with check (profile_id = auth.uid());
create policy "brix briefs: replace own" on public.brix_briefs
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- Messages to Brix per person per day
-- ---------------------------------------------------------------------
create table public.brix_usage (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  messages int not null default 0,
  primary key (profile_id, day)
);
alter table public.brix_usage enable row level security;
create policy "brix usage: read own" on public.brix_usage
  for select to authenticated using (profile_id = auth.uid());

-- One more message, if today's limit allows it.
create or replace function public.brix_take_turn(daily_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  if auth.uid() is null then return false; end if;
  insert into public.brix_usage (profile_id, day, messages)
  values (auth.uid(), public.sofia_today(), 1)
  on conflict (profile_id, day) do update set messages = brix_usage.messages + 1
  where brix_usage.messages < daily_limit
  returning messages into used;
  return used is not null;
end;
$$;

revoke execute on function public.brix_take_turn(int) from public, anon;
grant execute on function public.brix_take_turn(int) to authenticated;

-- ---------------------------------------------------------------------
-- 08:00: the day in numbers (tasks, clients to contact, deal steps)
-- ---------------------------------------------------------------------
create table public.morning_digests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (profile_id, day)
);
alter table public.morning_digests enable row level security;
-- no policies: only the job writes it

create or replace function public.notify_morning_brief(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  end_of_day timestamptz := (today + 1)::timestamp at time zone 'Europe/Sofia';
  stages text[] := array['viewing', 'offer', 'deposit', 'preliminary', 'notary'];
  person record;
  sent integer := 0;
begin
  if local_now::time < time '08:00' then return 0; end if;

  for person in
    select m.organization_id, m.profile_id,
      (select count(*)::int from public.tasks t
        where t.assigned_to = m.profile_id and t.status = 'open' and t.due_date <= today) as tasks,
      (select count(*)::int from public.clients c
        where c.responsible_broker_id = m.profile_id and c.follow_up_at < end_of_day) as followups,
      (select array_to_string((array_agg(c.full_name order by c.follow_up_at))[1:2], ', ') from public.clients c
        where c.responsible_broker_id = m.profile_id and c.follow_up_at < end_of_day) as names,
      (select count(*)::int from public.deals d
        cross join lateral (values
          ('viewing', d.viewing_on), ('offer', d.offer_on), ('deposit', d.deposit_on),
          ('preliminary', d.preliminary_on), ('notary', d.notary_on)
        ) as s (stage, due)
        where d.broker_id = m.profile_id and d.status = 'open' and s.due = today
          and (array_position(stages, s.stage) > array_position(stages, d.stage)
               or (s.stage = d.stage and s.stage in ('viewing', 'notary')))) as steps
    from public.organization_members m
  loop
    continue when person.tasks + person.followups + person.steps = 0;

    insert into public.morning_digests (profile_id, day) values (person.profile_id, today)
    on conflict do nothing;
    if not found then continue; end if;

    perform public.notify(
      person.organization_id, person.profile_id, null, 'morning_brief',
      jsonb_build_object(
        'tasks', person.tasks, 'followups', person.followups, 'steps', person.steps,
        'title', coalesce(person.names, '')
      ),
      '/'
    );
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.notify_morning_brief(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Schedule (needs Cron, on since 007)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-morning-brief', '*/15 * * * *', 'select public.notify_morning_brief()');
  end if;
end;
$$;


-- =====================================================================
-- Agency logo
-- =====================================================================

-- The agency a storage path belongs to (null when the first folder isn't an id).
create or replace function public.org_from_path(object_name text)
returns uuid
language sql
immutable
as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agency-logos', 'agency-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "agency logos: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'agency-logos' and public.is_org_manager(public.org_from_path(name)));
create policy "agency logos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'agency-logos' and public.is_org_manager(public.org_from_path(name)));
create policy "agency logos: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'agency-logos' and public.is_org_member(public.org_from_path(name)));


-- =====================================================================
-- Sharing a listing with a client (/p/<token>)
-- =====================================================================

create table public.property_shares (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  views int not null default 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index property_shares_property_idx on public.property_shares (property_id, created_at desc);
create index property_shares_client_idx on public.property_shares (client_id);

alter table public.property_shares enable row level security;

-- my shares; managers see the agency's
create policy "property shares: read" on public.property_shares
  for select to authenticated
  using (created_by = auth.uid() or public.is_org_manager(organization_id));

-- any agency listing (listings are shared inside the agency), to my own client or nobody
create policy "property shares: create" on public.property_shares
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and exists (
      select 1 from public.properties p
      where p.id = property_shares.property_id and p.organization_id = property_shares.organization_id
    )
    and (client_id is null or public.can_view_client(client_id))
  );

create policy "property shares: stop" on public.property_shares
  for update to authenticated
  using (created_by = auth.uid() or public.is_org_manager(organization_id))
  with check (created_by = auth.uid() or public.is_org_manager(organization_id));

create policy "property shares: delete" on public.property_shares
  for delete to authenticated
  using (created_by = auth.uid() or public.is_org_manager(organization_id));

-- ---------------------------------------------------------------------
-- The public page's data (no address, no owner, no internal notes)
-- ---------------------------------------------------------------------
create or replace function public.shared_property(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'operation', p.operation_type,
      'status', p.status,
      'price', p.current_price,
      'currency', p.currency,
      'area', p.area,
      'rooms', p.rooms,
      'bedrooms', p.bedrooms,
      'floor', p.floor,
      'total_floors', p.total_floors,
      'construction', p.construction_type,
      'condition', p.condition,
      'furnishing', p.furnishing,
      'heating', p.heating,
      'exposures', p.exposures,
      'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((
        select jsonb_agg(ph.storage_path order by ph.position)
        from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = coalesce(sh.created_by, p.responsible_broker_id)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  )
  from public.property_shares sh
  join public.properties p on p.id = sh.property_id
  where sh.token = share_token and sh.revoked_at is null;
$$;

-- Someone opened the page: count it, and tell the broker the first time.
create or replace function public.mark_share_viewed(share_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  share record;
begin
  update public.property_shares
  set views = views + 1,
      first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now()
  where token = share_token and revoked_at is null
  returning id, organization_id, property_id, client_id, created_by, views into share;

  if share.id is not null and share.views = 1 and share.created_by is not null then
    perform public.notify(
      share.organization_id, share.created_by, null, 'share_viewed',
      jsonb_build_object(
        'title', (select title from public.properties where id = share.property_id),
        'actor', (select full_name from public.clients where id = share.client_id)
      ),
      '/properties/' || share.property_id
    );
  end if;
end;
$$;

grant execute on function public.shared_property(uuid) to anon, authenticated;
grant execute on function public.mark_share_viewed(uuid) to anon, authenticated;

-- =====================================================================
-- The owner's report (/r/<token>)
-- =====================================================================

create table public.owner_reports (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  period_start date not null,
  period_end date not null,
  comment text check (comment is null or char_length(comment) <= 2000),
  views int not null default 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index owner_reports_property_idx on public.owner_reports (property_id, created_at desc);

alter table public.owner_reports enable row level security;

-- the listing's broker and the managers
create policy "owner reports: read" on public.owner_reports
  for select to authenticated
  using (public.can_edit_property(property_id));

create policy "owner reports: create" on public.owner_reports
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_edit_property(property_id)
    and exists (
      select 1 from public.properties p
      where p.id = owner_reports.property_id and p.organization_id = owner_reports.organization_id
    )
  );

create policy "owner reports: stop" on public.owner_reports
  for update to authenticated
  using (public.can_edit_property(property_id))
  with check (public.can_edit_property(property_id));

create policy "owner reports: delete" on public.owner_reports
  for delete to authenticated
  using (public.can_edit_property(property_id));

-- ---------------------------------------------------------------------
-- The report page's data: counts and dates, never who the buyers are
-- ---------------------------------------------------------------------
create or replace function public.owner_report(report_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.owner_reports;
  p public.properties;
  result jsonb;
begin
  select * into r from public.owner_reports where token = report_token and revoked_at is null;
  if r.id is null then
    return null;
  end if;
  select * into p from public.properties where id = r.property_id;

  with
  -- a viewing logged by hand and the same one on a deal count once
  viewings as (
    select (a.occurred_at at time zone 'Europe/Sofia')::date as on_day, a.client_id
    from public.activities a
    where a.property_id = p.id and a.type = 'viewing'
      and a.client_id is distinct from p.owner_client_id
    union
    select d.viewing_on, d.client_id
    from public.deals d
    where d.property_id = p.id and d.viewing_on is not null
  ),
  period_viewings as (
    select on_day from viewings where on_day between r.period_start and r.period_end
  ),
  -- buyers calling, writing, meeting about it (not the owner; not the links sent — counted apart)
  inquiries as (
    select (a.occurred_at at time zone 'Europe/Sofia')::date as on_day
    from public.activities a
    where a.property_id = p.id
      and a.type in ('call', 'email', 'message', 'meeting')
      and a.client_id is distinct from p.owner_client_id
      and not (a.type = 'message' and coalesce(a.note, '') like '🔗%')
      and (a.occurred_at at time zone 'Europe/Sofia')::date between r.period_start and r.period_end
  ),
  shares as (
    select sh.views, sh.first_viewed_at
    from public.property_shares sh
    where sh.property_id = p.id
      and (sh.created_at at time zone 'Europe/Sofia')::date between r.period_start and r.period_end
  ),
  offers as (
    select o.amount, o.currency, o.offered_on, o.status
    from public.deal_offers o
    join public.deals d on d.id = o.deal_id
    where d.property_id = p.id and o.offered_on between r.period_start and r.period_end
  )
  select jsonb_build_object(
    'report', jsonb_build_object(
      'period_start', r.period_start,
      'period_end', r.period_end,
      'comment', r.comment,
      'created_at', r.created_at
    ),
    'owner', (select c.full_name from public.clients c where c.id = p.owner_client_id),
    'property', jsonb_build_object(
      'title', p.title,
      'operation', p.operation_type,
      'status', p.status,
      'price', p.current_price,
      'asking_price', p.asking_price,
      'currency', p.currency,
      'area', p.area,
      'listed_at', p.created_at,
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'cover', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1)
    ),
    'totals', jsonb_build_object(
      'viewings', (select count(*) from period_viewings),
      'inquiries', (select count(*) from inquiries),
      'shared', (select count(*) from shares),
      'opened', (select count(*) from shares where first_viewed_at is not null),
      'offers', (select count(*) from offers),
      'best_offer', (select max(amount) from offers where status <> 'rejected')
    ),
    'viewings', coalesce((select jsonb_agg(on_day order by on_day desc) from period_viewings), '[]'::jsonb),
    'inquiries', coalesce((select jsonb_agg(on_day order by on_day desc) from inquiries), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object('amount', amount, 'currency', currency, 'on', offered_on, 'status', status)
        order by offered_on desc)
      from offers), '[]'::jsonb),
    -- where the interested clients are now (open deals, by stage)
    'in_progress', coalesce((
      select jsonb_agg(jsonb_build_object('stage', stage, 'kind', kind, 'count', n) order by n desc)
      from (
        select d.stage, d.kind, count(*) as n
        from public.deals d
        where d.property_id = p.id and d.status = 'open'
        group by d.stage, d.kind
      ) s), '[]'::jsonb),
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object('at', h.changed_at, 'old', h.old_price, 'new', h.new_price, 'currency', h.currency)
        order by h.changed_at)
      from public.property_price_history h
      where h.property_id = p.id), '[]'::jsonb),
    'market', public.market_facts(p.id),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = coalesce(p.responsible_broker_id, r.created_by)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  ) into result;

  return result;
end;
$$;

-- The owner opened it: count it, and tell the broker the first time.
create or replace function public.mark_report_viewed(report_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  report_id uuid;
  report_org uuid;
  report_property uuid;
  report_creator uuid;
  report_views int;
begin
  update public.owner_reports
  set views = views + 1,
      first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now()
  where token = report_token and revoked_at is null
  returning id, organization_id, property_id, created_by, views
  into report_id, report_org, report_property, report_creator, report_views;

  if report_id is not null and report_views = 1 and report_creator is not null then
    perform public.notify(
      report_org, report_creator, null, 'report_viewed',
      jsonb_build_object(
        'title', (select title from public.properties where id = report_property),
        'actor', (select c.full_name from public.properties pp join public.clients c on c.id = pp.owner_client_id
                  where pp.id = report_property)
      ),
      '/properties/' || report_property
    );
  end if;
end;
$$;

grant execute on function public.owner_report(uuid) to anon, authenticated;
grant execute on function public.mark_report_viewed(uuid) to anon, authenticated;

-- Shared listings and owner reports show the listing's photos to anyone with the link.
create or replace function public.photo_is_shared(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.property_shares sh
    where sh.revoked_at is null
      and sh.property_id::text = split_part(object_name, '/', 2)
      and sh.organization_id::text = split_part(object_name, '/', 1)
  ) or exists (
    select 1 from public.owner_reports r
    where r.revoked_at is null
      and r.property_id::text = split_part(object_name, '/', 2)
      and r.organization_id::text = split_part(object_name, '/', 1)
  );
$$;

create policy "property photos: shared" on storage.objects
  for select to anon
  using (bucket_id = 'property-photos' and public.photo_is_shared(name));

-- =====================================================================
-- The market: reference prices and comparisons
-- =====================================================================

-- ---------------------------------------------------------------------
-- Reference prices the agency keeps: average €/m² of apartments by
-- neighborhood (or the whole town when neighborhood_id is null),
-- e.g. taken monthly from the portals' statistics.
-- ---------------------------------------------------------------------
create table public.market_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  operation text not null default 'sale' check (operation in ('sale', 'rent')),
  settlement_id uuid not null references public.geo_settlements (id) on delete cascade,
  neighborhood_id uuid references public.geo_neighborhoods (id) on delete cascade,
  -- euro per m² (rent: per month)
  price_per_sqm numeric(10, 2) not null check (price_per_sqm > 0),
  source text check (source is null or char_length(source) <= 120),
  as_of date not null default public.sofia_today(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint market_prices_one unique nulls not distinct (organization_id, operation, settlement_id, neighborhood_id)
);

alter table public.market_prices enable row level security;

-- everyone in the agency reads them; only managers change them (through set_market_prices)
create policy "market prices: read" on public.market_prices
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Euro, whatever the listing was entered in (the lev at the fixed rate).
create or replace function public.to_eur(amount numeric, currency text)
returns numeric
language sql
immutable
as $$
  select case currency when 'EUR' then amount when 'BGN' then amount / 1.95583 else null end;
$$;

-- A manager saves a town's prices at once; an empty price removes the row.
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
  if not public.is_org_manager(target_org) then
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

-- ---------------------------------------------------------------------
-- The listings a property is compared with: the agency's own, same
-- kind (any apartment for an apartment, else the same subtype), same
-- town and operation, area within ±30%. Sold ones carry the deal price.
-- ---------------------------------------------------------------------
create or replace function public.market_pool(target_property uuid)
returns table (
  property_id uuid,
  same_neighborhood boolean,
  area numeric,
  status text,
  listed_on date,
  price_eur numeric,
  sold_eur numeric,
  sold_on date,
  from_deal boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select p.*, s.code as sub_code,
      s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier']) as is_apartment
    from public.properties p
    join public.property_subtypes s on s.id = p.subtype_id
    where p.id = target_property
  )
  select c.id,
    c.neighborhood_id is not distinct from t.neighborhood_id and t.neighborhood_id is not null,
    c.area,
    c.status,
    (c.created_at at time zone 'Europe/Sofia')::date,
    public.to_eur(c.current_price, c.currency),
    coalesce(public.to_eur(w.price, w.currency),
             case when c.status in ('sold', 'rented') then public.to_eur(c.current_price, c.currency) end),
    coalesce(w.closed_on,
             case when c.status in ('sold', 'rented') then (c.updated_at at time zone 'Europe/Sofia')::date end),
    w.price is not null
  from target t
  join public.properties c
    on c.organization_id = t.organization_id
   and c.id <> t.id
   and c.operation_type = t.operation_type
   and c.settlement_id = t.settlement_id
  join public.property_subtypes cs on cs.id = c.subtype_id
  left join lateral (
    select d.price, d.currency, d.closed_on
    from public.deals d
    where d.property_id = c.id and d.status = 'won' and d.price is not null
    order by d.closed_on desc
    limit 1
  ) w on true
  where c.area > 0
    and (case when t.is_apartment
         then cs.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier'])
         else c.subtype_id = t.subtype_id end)
    and (t.area is null or c.area between t.area * 0.7 and t.area * 1.3);
$$;

-- Everything the app says about one listing's price: its €/m², the
-- agency's reference for the neighborhood, the agency's own listings and
-- sales around it, and a price range. Only aggregates — never whose.
create or replace function public.market_facts(target_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.properties;
  is_apartment boolean;
  own_sqm numeric;
  ref_sqm numeric;
  ref_source text;
  ref_as_of date;
  ref_level text;
  has_ref boolean := false;
  near integer;
  scope text;
  sold_scope text;
  active_count integer;
  active_median numeric;
  sold_count integer;
  sold_median numeric;
  sold_days numeric;
  discount numeric;
  bench numeric;
  basis text;
begin
  select * into p from public.properties where id = target_property;
  if p.id is null or p.operation_type not in ('sale', 'rent') then
    return null;
  end if;
  select s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier'])
    into is_apartment
  from public.property_subtypes s where s.id = p.subtype_id;

  if p.area > 0 and p.current_price > 0 then
    own_sqm := round(public.to_eur(p.current_price, p.currency) / p.area, 2);
  end if;

  -- the reference: this neighborhood, else the whole town (apartments only — that's what the portals publish)
  if is_apartment and p.settlement_id is not null then
    select m.price_per_sqm, m.source, m.as_of,
      case when m.neighborhood_id is null then 'city' else 'neighborhood' end
      into ref_sqm, ref_source, ref_as_of, ref_level
    from public.market_prices m
    where m.organization_id = p.organization_id
      and m.operation = p.operation_type
      and m.settlement_id = p.settlement_id
      and (m.neighborhood_id = p.neighborhood_id or m.neighborhood_id is null)
    order by m.neighborhood_id is null
    limit 1;
    has_ref := found;
  end if;

  -- the agency's own listings: the neighborhood when there are enough, else the town
  select count(*) into near from public.market_pool(p.id) where same_neighborhood;
  scope := case when near >= 3 then 'neighborhood' else 'city' end;

  select count(*), percentile_cont(0.5) within group (order by x.price_eur / x.area)
    into active_count, active_median
  from public.market_pool(p.id) x
  where (scope = 'city' or x.same_neighborhood)
    and x.status in ('active', 'reserved') and x.price_eur > 0;

  -- sales: the neighborhood when it has enough of them, else the town (decided apart from the listings)
  select count(*) into near from public.market_sold(p.id) x
  where x.same_neighborhood and x.sold_on >= public.sofia_today() - 365;
  sold_scope := case when near >= 3 then 'neighborhood' else 'city' end;

  select count(*),
    percentile_cont(0.5) within group (order by x.sold_eur / x.area),
    avg(x.sold_on - x.listed_on) filter (where x.sold_on >= x.listed_on),
    avg((x.price_eur - x.sold_eur) / x.price_eur) filter (where x.from_deal and x.price_eur > 0)
    into sold_count, sold_median, sold_days, discount
  from public.market_sold(p.id) x
  where (sold_scope = 'city' or x.same_neighborhood)
    and x.sold_on >= public.sofia_today() - 365;

  -- what "the market" means for this listing: the reference, else the agency's own listings
  if has_ref then
    bench := ref_sqm;
    basis := 'reference';
  elsif active_count >= 3 then
    bench := round(active_median, 2);
    basis := 'listings';
  end if;
  -- no sales with a deal price → no haggling figure (not 0)
  if discount is not null then
    discount := greatest(0, least(0.3, discount));
  end if;

  return jsonb_build_object(
    'operation', p.operation_type,
    'apartment', coalesce(is_apartment, false),
    'area', p.area,
    'price_eur', round(public.to_eur(p.current_price, p.currency), 2),
    'own_sqm', own_sqm,
    'reference', case when has_ref then jsonb_build_object(
      'sqm', ref_sqm, 'source', ref_source, 'as_of', ref_as_of, 'level', ref_level) end,
    'scope', scope,
    'active', jsonb_build_object('count', active_count, 'median_sqm', round(active_median, 2)),
    'sold', jsonb_build_object('count', sold_count, 'median_sqm', round(sold_median, 2), 'avg_days', round(sold_days), 'scope', sold_scope),
    'discount', round(discount, 4),
    'benchmark', case when bench is not null then jsonb_build_object('sqm', bench, 'basis', basis) end,
    'diff', case when bench > 0 and own_sqm > 0 then round(own_sqm / bench - 1, 4) end,
    'estimate', case when bench > 0 and p.area > 0 then jsonb_build_object(
      'low', round(bench * p.area * 0.95, -2),
      'mid', round(bench * p.area, -2),
      'high', round(bench * p.area * 1.05, -2)) end,
    -- what it's likely to sell for: the agency's own sales, else the market less the usual haggling
    'expected_final', case
      when sold_count >= 3 and p.area > 0 then round(sold_median * p.area, -2)
      when bench > 0 and p.area > 0 and discount is not null then round(bench * p.area * (1 - discount), -2)
    end
  );
end;
$$;

revoke execute on function public.market_pool(uuid) from public, anon, authenticated;
revoke execute on function public.market_facts(uuid) from public, anon, authenticated;

-- For the app: anyone in the listing's agency.
create or replace function public.market_snapshot(target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.market_facts(p.id)
  from public.properties p
  where p.id = target_property and public.is_org_member(p.organization_id);
$$;

-- The Market page: every town / neighborhood the agency has apartments or a
-- reference price in, and the listings priced away from the market.
-- (market_overview is defined with the register of closed deals, further down)

grant execute on function public.market_snapshot(uuid) to authenticated;
grant execute on function public.set_market_prices(uuid, text, uuid, jsonb, text, date) to authenticated;
revoke execute on function public.market_snapshot(uuid) from anon;
revoke execute on function public.set_market_prices(uuid, text, uuid, jsonb, text, date) from anon;

-- =====================================================================
-- Searches: shared by link, and colleagues' searches from other agencies
-- =====================================================================

create table public.search_shares (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  comment text check (comment is null or char_length(comment) <= 1000),
  views int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index search_shares_client_idx on public.search_shares (client_id, created_at desc);

alter table public.search_shares enable row level security;

create policy "search shares: read" on public.search_shares
  for select to authenticated
  using (created_by = auth.uid() or public.is_org_manager(organization_id));

create policy "search shares: create" on public.search_shares
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and public.can_view_client(client_id)
    and exists (select 1 from public.clients c where c.id = client_id and c.organization_id = search_shares.organization_id)
  );

create policy "search shares: stop" on public.search_shares
  for update to authenticated
  using (created_by = auth.uid() or public.is_org_manager(organization_id))
  with check (created_by = auth.uid() or public.is_org_manager(organization_id));

-- The public page's data: what is searched, who to call. No name, phone or notes of the client.
create or replace function public.shared_search(share_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sh public.search_shares;
  s public.client_searches;
  result jsonb;
begin
  select * into sh from public.search_shares where token = share_token and revoked_at is null;
  if sh.id is null then
    return null;
  end if;
  select * into s from public.client_searches where client_id = sh.client_id;
  if s.client_id is null then
    return null;
  end if;

  update public.search_shares set views = views + 1 where id = sh.id;

  select jsonb_build_object(
    'search', jsonb_build_object(
      'operation', s.operation,
      'subtypes', coalesce((select jsonb_agg(jsonb_build_object('name', st.name, 'name_en', st.name_en) order by st.sort_order)
        from public.property_subtypes st where st.id = any (s.subtype_ids)), '[]'::jsonb),
      'settlements', coalesce((select jsonb_agg(g.settlement_type || ' ' || g.name order by g.name)
        from public.geo_settlements g where g.id = any (s.settlement_ids)), '[]'::jsonb),
      'neighborhoods', coalesce((select jsonb_agg(n.name order by n.name)
        from public.geo_neighborhoods n where n.id = any (s.neighborhood_ids)), '[]'::jsonb),
      'budget_min', s.budget_min,
      'budget_max', s.budget_max,
      'currency', s.currency,
      'area_min', s.area_min,
      'area_max', s.area_max,
      'rooms_min', s.rooms_min,
      'rooms_max', s.rooms_max,
      'features', coalesce((select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_features f where f.id = any (s.feature_ids)), '[]'::jsonb),
      'updated_at', s.updated_at
    ),
    'comment', sh.comment,
    'shared_at', sh.created_at,
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr
      where pr.id = coalesce((select c.responsible_broker_id from public.clients c where c.id = sh.client_id), sh.created_by)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = sh.organization_id
    )
  ) into result;
  return result;
end;
$$;

grant execute on function public.shared_search(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Searches from colleagues at other agencies: their buyer's criteria,
-- so our listings that fit come up
-- ---------------------------------------------------------------------
create table public.partner_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  broker_name text not null check (char_length(broker_name) between 1 and 120),
  agency text check (agency is null or char_length(agency) <= 120),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 200),
  note text check (note is null or char_length(note) <= 2000),
  active boolean not null default true,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_min <= budget_max),
  check (area_min is null or area_max is null or area_min <= area_max),
  check (rooms_min is null or rooms_max is null or rooms_min <= rooms_max)
);

create index partner_searches_org_idx on public.partner_searches (organization_id, active, operation);

create trigger partner_searches_touch_updated_at
  before update on public.partner_searches
  for each row execute function public.touch_updated_at();

alter table public.partner_searches enable row level security;

-- the whole agency sees them (any of our listings may fit); whoever entered it, or a manager, changes it
create policy "partner searches: read" on public.partner_searches
  for select to authenticated using (public.is_org_member(organization_id));
create policy "partner searches: create" on public.partner_searches
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_org_member(organization_id));
create policy "partner searches: update" on public.partner_searches
  for update to authenticated
  using (created_by = auth.uid() or public.is_org_manager(organization_id))
  with check (public.is_org_member(organization_id));
create policy "partner searches: delete" on public.partner_searches
  for delete to authenticated
  using (created_by = auth.uid() or public.is_org_manager(organization_id));

-- =====================================================================
-- Deals actually closed: the register, and the market reading it
-- =====================================================================

-- ---------------------------------------------------------------------
-- The register of deals the agency actually closed, entered week by week
-- (usually at the preliminary contract) — for the agency's statistics and
-- the market's real sold prices
-- ---------------------------------------------------------------------
create table public.closed_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  -- when the deal was announced (not when it was entered here)
  reported_on date not null,
  subtype_id uuid not null references public.property_subtypes (id),
  settlement_id uuid references public.geo_settlements (id),
  neighborhood_id uuid references public.geo_neighborhoods (id),
  -- the address in parts, and put together for lists and search
  street text check (street is null or char_length(street) <= 120),
  street_no text check (street_no is null or char_length(street_no) <= 20),
  block text check (block is null or char_length(block) <= 20),
  entrance text check (entrance is null or char_length(entrance) <= 10),
  floor text check (floor is null or char_length(floor) <= 10),
  apartment text check (apartment is null or char_length(apartment) <= 20),
  address text check (address is null or char_length(address) <= 300),
  -- we sold (the seller's side) or bought (the buyer's side)
  side text not null default 'sale' check (side in ('sale', 'purchase')),
  conditions text[] not null default '{}' check (conditions <@ array[
    'needs_renovation', 'good', 'renovated', 'furnished', 'unfurnished', 'bds',
    'under_construction', 'act14', 'act15', 'act16', 'new'
  ]),
  construction text check (construction is null or construction in (
    'brick', 'panel', 'epk', 'pk', 'monolithic', 'beam', 'wood', 'prefab'
  )),
  parking boolean not null default false,
  area numeric(10, 2) not null check (area > 0),
  -- euro
  price numeric(14, 2) not null check (price >= 0),
  parking_price numeric(14, 2) check (parking_price is null or parking_price >= 0),
  total_price numeric(14, 2) generated always as (price + coalesce(parking_price, 0)) stored,
  price_per_sqm numeric(12, 2) generated always as (round(price / area, 2)) stored,
  total_per_sqm numeric(12, 2) generated always as (round((price + coalesce(parking_price, 0)) / area, 2)) stored,
  -- names as the office writes them: our broker; the broker on the other side and their agency
  -- (no agency: a colleague of ours — the deal is double within the agency)
  broker_name text not null check (char_length(broker_name) <= 120),
  colleague_name text check (colleague_name is null or char_length(colleague_name) <= 120),
  colleague_agency text check (colleague_agency is null or char_length(colleague_agency) <= 120),
  -- our broker did both sides alone
  double_sided boolean not null default false,
  -- the listing in BRIXA, when there is one
  property_id uuid references public.properties (id) on delete set null,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index closed_deals_org_idx on public.closed_deals (organization_id, reported_on desc);
create index closed_deals_place_idx on public.closed_deals (settlement_id, neighborhood_id);
create index closed_deals_property_idx on public.closed_deals (property_id) where property_id is not null;

create trigger closed_deals_touch_updated_at
  before update on public.closed_deals
  for each row execute function public.touch_updated_at();

alter table public.closed_deals enable row level security;

-- the whole agency learns from them; managers keep the register
create policy "closed deals: read" on public.closed_deals
  for select to authenticated using (public.is_org_member(organization_id));
create policy "closed deals: create" on public.closed_deals
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_org_manager(organization_id));
create policy "closed deals: update" on public.closed_deals
  for update to authenticated
  using (public.is_org_manager(organization_id))
  with check (public.is_org_manager(organization_id));
create policy "closed deals: delete" on public.closed_deals
  for delete to authenticated using (public.is_org_manager(organization_id));

-- The sales a listing is compared with: the register (the real prices) and the
-- listings sold through BRIXA deals that aren't in the register already.
create or replace function public.market_sold(target_property uuid)
returns table (
  same_neighborhood boolean,
  area numeric,
  sold_eur numeric,
  sold_on date,
  listed_on date,
  price_eur numeric,
  from_deal boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select p.*, s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier']) as is_apartment
    from public.properties p
    join public.property_subtypes s on s.id = p.subtype_id
    where p.id = target_property
  )
  select x.same_neighborhood, x.area, x.sold_eur, x.sold_on, x.listed_on, x.price_eur, x.from_deal
  from public.market_pool(target_property) x
  where x.sold_eur > 0
    and not exists (select 1 from public.closed_deals cd where cd.property_id = x.property_id)
  union all
  select cd.neighborhood_id is not distinct from t.neighborhood_id and t.neighborhood_id is not null,
    cd.area, cd.price, cd.reported_on, null::date, null::numeric, false
  from target t
  join public.closed_deals cd
    on cd.organization_id = t.organization_id
   and cd.settlement_id = t.settlement_id
   and cd.property_id is distinct from t.id
  join public.property_subtypes cs on cs.id = cd.subtype_id
  where t.operation_type = 'sale'
    and (case when t.is_apartment then cs.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier']) else cd.subtype_id = t.subtype_id end)
    and (t.area is null or cd.area between t.area * 0.7 and t.area * 1.3);
$$;

revoke execute on function public.market_sold(uuid) from public, anon, authenticated;

-- The Market page: every town / neighborhood the agency has apartments, sales or a
-- reference price in, and the listings priced away from the market.
create or replace function public.market_overview(target_org uuid, target_operation text default 'sale')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with apt as (
    select c.id, c.title, c.settlement_id, c.neighborhood_id, c.area, c.status, c.responsible_broker_id,
      public.to_eur(c.current_price, c.currency) as price_eur,
      coalesce(public.to_eur(w.price, w.currency),
               case when c.status in ('sold', 'rented') then public.to_eur(c.current_price, c.currency) end) as sold_eur,
      coalesce(w.closed_on,
               case when c.status in ('sold', 'rented') then (c.updated_at at time zone 'Europe/Sofia')::date end) as sold_on,
      (c.created_at at time zone 'Europe/Sofia')::date as listed_on
    from public.properties c
    join public.property_subtypes s on s.id = c.subtype_id
    left join lateral (
      select d.price, d.currency, d.closed_on from public.deals d
      where d.property_id = c.id and d.status = 'won' and d.price is not null
      order by d.closed_on desc limit 1
    ) w on true
    where c.organization_id = target_org
      and c.operation_type = target_operation
      and c.settlement_id is not null
      and c.area > 0
      and s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier'])
  ),
  registered as (
    select cd.settlement_id, cd.neighborhood_id, cd.area, cd.price as sold_eur, cd.reported_on as sold_on, null::date as listed_on
    from public.closed_deals cd
    join public.property_subtypes s on s.id = cd.subtype_id
    where cd.organization_id = target_org
      and target_operation = 'sale'
      and cd.settlement_id is not null
      and s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier'])
  ),
  sold as (
    select a.settlement_id, a.neighborhood_id, a.area, a.sold_eur, a.sold_on, a.listed_on
    from apt a
    where a.sold_eur > 0 and not exists (select 1 from public.closed_deals cd where cd.property_id = a.id)
    union all
    select * from registered
  ),
  places as (
    select settlement_id, neighborhood_id from apt
    union
    select settlement_id, neighborhood_id from registered
    union
    select settlement_id, neighborhood_id from public.market_prices
    where organization_id = target_org and operation = target_operation
  ),
  rows as (
    select pl.settlement_id, pl.neighborhood_id,
      gs.settlement_type || ' ' || gs.name as town,
      gn.name as neighborhood,
      m.price_per_sqm as ref_sqm, m.source, m.as_of,
      (select count(*) from apt a where a.settlement_id = pl.settlement_id
         and a.neighborhood_id is not distinct from pl.neighborhood_id
         and a.status in ('active', 'reserved') and a.price_eur > 0) as active_count,
      (select round(percentile_cont(0.5) within group (order by a.price_eur / a.area)::numeric, 2) from apt a
         where a.settlement_id = pl.settlement_id and a.neighborhood_id is not distinct from pl.neighborhood_id
           and a.status in ('active', 'reserved') and a.price_eur > 0) as active_sqm,
      (select count(*) from sold a where a.settlement_id = pl.settlement_id
         and a.neighborhood_id is not distinct from pl.neighborhood_id
         and a.sold_on >= public.sofia_today() - 365) as sold_count,
      (select round(percentile_cont(0.5) within group (order by a.sold_eur / a.area)::numeric, 2) from sold a
         where a.settlement_id = pl.settlement_id and a.neighborhood_id is not distinct from pl.neighborhood_id
           and a.sold_on >= public.sofia_today() - 365) as sold_sqm,
      (select round(avg(a.sold_on - a.listed_on)) from sold a
         where a.settlement_id = pl.settlement_id and a.neighborhood_id is not distinct from pl.neighborhood_id
           and a.sold_on >= public.sofia_today() - 365 and a.sold_on >= a.listed_on) as sold_days
    from places pl
    join public.geo_settlements gs on gs.id = pl.settlement_id
    left join public.geo_neighborhoods gn on gn.id = pl.neighborhood_id
    left join public.market_prices m
      on m.organization_id = target_org and m.operation = target_operation
     and m.settlement_id = pl.settlement_id and m.neighborhood_id is not distinct from pl.neighborhood_id
  ),
  -- each active listing against the neighborhood's reference (else the town's)
  priced as (
    select a.id, a.title, a.area, a.price_eur, a.responsible_broker_id,
      gn.name as neighborhood,
      round(a.price_eur / a.area, 2) as own_sqm,
      coalesce(
        (select m.price_per_sqm from public.market_prices m
          where m.organization_id = target_org and m.operation = target_operation
            and m.settlement_id = a.settlement_id and m.neighborhood_id = a.neighborhood_id),
        (select m.price_per_sqm from public.market_prices m
          where m.organization_id = target_org and m.operation = target_operation
            and m.settlement_id = a.settlement_id and m.neighborhood_id is null)
      ) as bench
    from apt a
    left join public.geo_neighborhoods gn on gn.id = a.neighborhood_id
    where a.status in ('active', 'reserved') and a.price_eur > 0
  )
  select jsonb_build_object(
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object(
          'settlement_id', r.settlement_id, 'neighborhood_id', r.neighborhood_id,
          'town', r.town, 'neighborhood', r.neighborhood,
          'ref_sqm', r.ref_sqm, 'source', r.source, 'as_of', r.as_of,
          'active_count', r.active_count, 'active_sqm', r.active_sqm,
          'sold_count', r.sold_count, 'sold_sqm', r.sold_sqm, 'sold_days', r.sold_days)
        order by r.town, r.neighborhood nulls first)
      from rows r
      where public.is_org_member(target_org)), '[]'::jsonb),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', x.id, 'title', x.title, 'neighborhood', x.neighborhood,
          'broker', public.person_name(x.responsible_broker_id),
          'own_sqm', x.own_sqm, 'bench', x.bench, 'diff', round(x.own_sqm / x.bench - 1, 4))
        order by abs(x.own_sqm / x.bench - 1) desc)
      from priced x
      where x.bench > 0 and abs(x.own_sqm / x.bench - 1) >= 0.05
        and public.is_org_member(target_org)), '[]'::jsonb)
  );
$$;

grant execute on function public.market_overview(uuid, text) to authenticated;
revoke execute on function public.market_overview(uuid, text) from anon;

-- ---------------------------------------------------------------------
-- Activity points day by day, for everyone in the agency (the streaks)
--   the same points as the ranking, on the day they were earned
-- ---------------------------------------------------------------------
create or replace function public.daily_points(target_org uuid, since date)
returns table (profile_id uuid, day date, points integer)
language sql
stable
security definer
set search_path = public
as $$
  with o as (
    select * from public.organizations where id = target_org
  ),
  start as (
    select since::timestamp at time zone 'Europe/Sofia' as ts
  ),
  earned as (
    select d.broker_id as pid, d.closed_on as day,
      case when d.double_sided then o.points_deal_double else o.points_deal end as pts
    from public.deals d, o
    where d.organization_id = target_org and d.status = 'won' and d.confirmed_at is not null and d.closed_on >= since
    union all
    select p.responsible_broker_id, (p.created_at at time zone 'Europe/Sofia')::date,
      o.points_listing + case when p.exclusive_contract then o.points_exclusive else 0 end
    from public.properties p, o, start
    where p.organization_id = target_org and p.operation_type in ('sale', 'rent') and p.created_at >= start.ts
    union all
    select a.profile_id, (a.occurred_at at time zone 'Europe/Sofia')::date,
      case a.type when 'viewing' then o.points_viewing when 'meeting' then o.points_meeting else o.points_call end
    from public.activities a, o, start
    where a.organization_id = target_org and a.type in ('viewing', 'meeting', 'call') and a.occurred_at >= start.ts
    union all
    select c.responsible_broker_id, (c.created_at at time zone 'Europe/Sofia')::date, o.points_client
    from public.clients c, o, start
    where c.organization_id = target_org and c.created_at >= start.ts
  )
  select e.pid, e.day, sum(e.pts)::int
  from earned e
  join public.organization_members m on m.organization_id = target_org and m.profile_id = e.pid
  where public.is_org_member(target_org)
  group by e.pid, e.day
  order by e.pid, e.day;
$$;

-- ---------------------------------------------------------------------
-- The broker's own plan: the goal for the year and the "why"
--   (the manager's target stays as it is; this is the broker's own)
-- ---------------------------------------------------------------------
create table public.broker_plans (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- commission in euro the broker wants to earn this year
  yearly_goal numeric(12, 2) check (yearly_goal is null or yearly_goal between 0 and 100000000),
  big_why text check (big_why is null or char_length(big_why) <= 500),
  updated_at timestamptz not null default now()
);

alter table public.broker_plans enable row level security;

-- my own plan; managers read the agency's
create policy "plans: read" on public.broker_plans
  for select to authenticated
  using (profile_id = auth.uid() or public.is_org_manager(organization_id));

create policy "plans: create my own" on public.broker_plans
  for insert to authenticated
  with check (profile_id = auth.uid() and public.is_org_member(organization_id));

create policy "plans: update my own" on public.broker_plans
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.is_org_member(organization_id));

grant execute on function public.daily_points(uuid, date) to authenticated;
revoke execute on function public.daily_points(uuid, date) from anon;

-- ---------------------------------------------------------------------
-- Contact programs and greetings (028)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Open houses (029)
-- ---------------------------------------------------------------------
-- a new client source
alter table public.clients drop constraint if exists clients_source_check;
alter table public.clients add constraint clients_source_check check (source in (
  'personal', 'referral', 'agency', 'email', 'google', 'facebook', 'instagram', 'tiktok',
  'realistimo', 'billboard', 'flyers', 'banner', 'open_house'
));

create table public.open_houses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  -- the broker who hosts: the visitors become their clients
  host_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  starts_at time not null,
  ends_at time not null,
  -- the key of the sign-in page (the QR code)
  token uuid not null unique default gen_random_uuid(),
  note text check (note is null or char_length(note) <= 1000),
  cancelled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index open_houses_org_idx on public.open_houses (organization_id, day desc);
create index open_houses_property_idx on public.open_houses (property_id, day desc);

create trigger open_houses_touch_updated_at
  before update on public.open_houses
  for each row execute function public.touch_updated_at();

create table public.open_house_visitors (
  id uuid primary key default gen_random_uuid(),
  open_house_id uuid not null references public.open_houses (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 200),
  -- looking for a home, a neighbour, another agent, just looking
  kind text not null check (kind in ('buyer', 'neighbor', 'agent', 'curious')),
  price_opinion text check (price_opinion is null or price_opinion in ('low', 'right', 'high')),
  rating int check (rating is null or rating between 1 and 5),
  liked text check (liked is null or char_length(liked) <= 500),
  looking_for text check (looking_for is null or char_length(looking_for) <= 500),
  consent boolean not null default false,
  created_at timestamptz not null default now()
);

create index open_house_visitors_event_idx on public.open_house_visitors (open_house_id, created_at);

-- the preparation steps
alter table public.tasks
  add column open_house_id uuid references public.open_houses (id) on delete set null;
create index tasks_open_house_idx on public.tasks (open_house_id) where open_house_id is not null;

-- ---------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------
alter table public.open_houses enable row level security;
alter table public.open_house_visitors enable row level security;

-- the agency plans them together (listings are shared inside the agency)
create policy "open houses: read" on public.open_houses
  for select to authenticated
  using (public.is_org_member(organization_id));

-- for an agency listing; brokers host their own, managers pick anyone
create policy "open houses: create" on public.open_houses
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and (host_id = auth.uid() or public.is_org_manager(organization_id))
    and exists (select 1 from public.organization_members m where m.organization_id = open_houses.organization_id and m.profile_id = open_houses.host_id)
    and exists (select 1 from public.properties p where p.id = open_houses.property_id and p.organization_id = open_houses.organization_id)
  );

create policy "open houses: update" on public.open_houses
  for update to authenticated
  using (host_id = auth.uid() or created_by = auth.uid() or public.is_org_manager(organization_id))
  with check (
    exists (select 1 from public.organization_members m where m.organization_id = open_houses.organization_id and m.profile_id = open_houses.host_id)
    and exists (select 1 from public.properties p where p.id = open_houses.property_id and p.organization_id = open_houses.organization_id)
  );

create policy "open houses: delete" on public.open_houses
  for delete to authenticated
  using (created_by = auth.uid() or public.is_org_manager(organization_id));

-- visitors are the host's (and the managers'): they are people's contact details
create policy "open house visitors: read" on public.open_house_visitors
  for select to authenticated
  using (
    public.is_org_manager(organization_id)
    or exists (select 1 from public.open_houses h where h.id = open_house_visitors.open_house_id and h.host_id = auth.uid())
  );

create policy "open house visitors: delete" on public.open_house_visitors
  for delete to authenticated
  using (
    public.is_org_manager(organization_id)
    or exists (select 1 from public.open_houses h where h.id = open_house_visitors.open_house_id and h.host_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- The sign-in page (anyone with the QR code)
-- ---------------------------------------------------------------------
create or replace function public.open_house_public(house_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'title', p.title,
    'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
    'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
    'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
    'price', p.current_price,
    'currency', p.currency,
    'area', p.area,
    'rooms', p.rooms,
    'day', h.day,
    'starts_at', to_char(h.starts_at, 'HH24:MI'),
    'ends_at', to_char(h.ends_at, 'HH24:MI'),
    'cancelled', h.cancelled_at is not null,
    -- signing in: on the day and the day after
    'open', h.cancelled_at is null and public.sofia_today() between h.day and h.day + 1,
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = h.host_id
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = h.organization_id
    )
  )
  from public.open_houses h
  join public.properties p on p.id = h.property_id
  where h.token = house_token;
$$;

-- A visitor signs in: they become the host's client (or an existing client is found by the phone).
create or replace function public.open_house_sign_in(
  house_token uuid,
  visitor_name text,
  visitor_phone text,
  visitor_email text,
  visitor_kind text,
  opinion text,
  stars int,
  liked_most text,
  wants text,
  agreed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  title text;
  found uuid;
  new_client uuid;
  clean_name text := nullif(btrim(visitor_name), '');
  clean_phone text := nullif(btrim(visitor_phone), '');
  clean_email text := nullif(lower(btrim(visitor_email)), '');
begin
  select oh.*, p.title as property_title into h
  from public.open_houses oh join public.properties p on p.id = oh.property_id
  where oh.token = house_token;

  if h.id is null or h.cancelled_at is not null or public.sofia_today() not between h.day and h.day + 1 then
    raise exception 'open_house_closed';
  end if;
  if not coalesce(agreed, false) then raise exception 'consent_required'; end if;
  if clean_name is null or char_length(clean_name) not between 2 and 120 then raise exception 'name_required'; end if;
  if clean_phone is null and clean_email is null then raise exception 'contact_required'; end if;
  if visitor_kind not in ('buyer', 'neighbor', 'agent', 'curious') then raise exception 'invalid_kind'; end if;
  if (select count(*) from public.open_house_visitors v where v.open_house_id = h.id) >= 300 then
    raise exception 'too_many';
  end if;
  title := h.property_title;

  -- everyone except other agents becomes (or already is) a client
  if visitor_kind <> 'agent' then
    if clean_phone is not null then
      select c.id into found from public.clients c
      where c.organization_id = h.organization_id and c.phone_normalized = public.normalize_phone(clean_phone);
    end if;
    if found is null then
      insert into public.clients (
        organization_id, responsible_broker_id, created_by, full_name, phone, email, types, source, stage, notes
      ) values (
        h.organization_id, h.host_id, h.host_id, clean_name, left(clean_phone, 40), left(clean_email, 200),
        case when visitor_kind = 'neighbor' then array['seller'] else array['buyer'] end,
        'open_house', 'new_contact',
        left(concat_ws(E'\n',
          'Отворени врати: ' || title || ' (' || to_char(h.day, 'DD.MM.YYYY') || ')',
          case when nullif(btrim(wants), '') is not null then 'Търси: ' || btrim(wants) end,
          case when nullif(btrim(liked_most), '') is not null then 'Хареса: ' || btrim(liked_most) end
        ), 5000)
      )
      returning id into new_client;
    end if;
  end if;

  insert into public.open_house_visitors (
    open_house_id, organization_id, client_id, full_name, phone, email, kind, price_opinion, rating, liked, looking_for, consent
  ) values (
    h.id, h.organization_id, coalesce(new_client, found), clean_name, left(clean_phone, 40), left(clean_email, 200), visitor_kind,
    case when opinion in ('low', 'right', 'high') then opinion end,
    case when stars between 1 and 5 then stars end,
    left(nullif(btrim(liked_most), ''), 500),
    left(nullif(btrim(wants), ''), 500),
    true
  );

  -- a brand-new client already tells the host ("you got a client"); anyone else — this does
  if new_client is null then
    perform public.notify(
      h.organization_id, h.host_id, null, 'open_house_visitor',
      jsonb_build_object('title', title, 'actor', clean_name),
      '/open-houses/' || h.id
    );
  end if;
  return true;
end;
$$;

grant execute on function public.open_house_public(uuid) to anon, authenticated;
grant execute on function public.open_house_sign_in(uuid, text, text, text, text, text, int, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------
-- The owner's report: the open houses in its period (no names — numbers and what people liked)
-- ---------------------------------------------------------------------
create or replace function public.owner_report_open_houses(report_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'events', count(distinct h.id),
    'visitors', count(v.id),
    'buyers', count(v.id) filter (where v.kind = 'buyer'),
    'neighbors', count(v.id) filter (where v.kind = 'neighbor'),
    'price_low', count(v.id) filter (where v.price_opinion = 'low'),
    'price_right', count(v.id) filter (where v.price_opinion = 'right'),
    'price_high', count(v.id) filter (where v.price_opinion = 'high'),
    'rating', round(avg(v.rating)::numeric, 1),
    'liked', coalesce(jsonb_agg(v.liked) filter (where v.liked is not null), '[]'::jsonb)
  )
  from public.owner_reports r
  join public.open_houses h
    on h.property_id = r.property_id and h.cancelled_at is null and h.day between r.period_start and r.period_end
  left join public.open_house_visitors v on v.open_house_id = h.id and v.kind <> 'agent'
  where r.token = report_token and r.revoked_at is null;
$$;

grant execute on function public.owner_report_open_houses(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Personal data and yearly greetings (030)
-- ---------------------------------------------------------------------
create table public.client_identity (
  client_id uuid primary key references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  egn text check (egn is null or egn ~ '^[0-9]{10}$'),
  id_card text check (id_card is null or id_card ~ '^[A-Za-z0-9]{5,20}$'),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.client_identity enable row level security;

-- the client's broker and the managers — nobody else, ever
create policy "identity: read" on public.client_identity
  for select to authenticated
  using (public.can_view_client(client_id));

create policy "identity: create" on public.client_identity
  for insert to authenticated
  with check (
    public.can_view_client(client_id)
    and exists (select 1 from public.clients c where c.id = client_identity.client_id and c.organization_id = client_identity.organization_id)
  );

create policy "identity: update" on public.client_identity
  for update to authenticated
  using (public.can_view_client(client_id))
  with check (
    public.can_view_client(client_id)
    and exists (select 1 from public.clients c where c.id = client_identity.client_id and c.organization_id = client_identity.organization_id)
  );

create policy "identity: delete" on public.client_identity
  for delete to authenticated
  using (public.can_view_client(client_id));

-- ---------------------------------------------------------------------
-- Greeting tasks: a birthday, or the anniversary of a purchase (the deal)
-- ---------------------------------------------------------------------
alter table public.tasks
  add column occasion text check (occasion is null or occasion in ('birthday', 'anniversary')),
  add column anniversary_of uuid references public.deals (id) on delete cascade;

create unique index tasks_occasion_once on public.tasks (client_id, occasion, due_date) where occasion is not null;

-- How much a home bought through us is worth now, from the market data:
-- the agency's sales in the area (3 or more), else the market reference / listings.
create or replace function public.purchase_growth(target_deal uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d public.deals;
  p public.properties;
  facts jsonb;
  bought numeric;
  now_sqm numeric;
begin
  select * into d from public.deals where id = target_deal;
  if d.id is null or d.property_id is null or d.price is null or d.price <= 0 then return null; end if;
  select * into p from public.properties where id = d.property_id;
  if p.id is null or coalesce(p.area, 0) <= 0 then return null; end if;

  facts := public.market_facts(p.id);
  if facts is null then return null; end if;
  now_sqm := case
    when coalesce((facts -> 'sold' ->> 'count')::int, 0) >= 3 then (facts -> 'sold' ->> 'median_sqm')::numeric
    else (facts -> 'benchmark' ->> 'sqm')::numeric
  end;
  bought := public.to_eur(d.price, d.currency) / p.area;
  if now_sqm is null or bought is null or bought <= 0 then return null; end if;

  return jsonb_build_object(
    'growth', round(now_sqm / bought - 1, 4),
    'value', round(now_sqm * p.area, -2),
    'bought', round(public.to_eur(d.price, d.currency), -2)
  );
end;
$$;

revoke execute on function public.purchase_growth(uuid) from public, anon, authenticated;

-- The anniversary card, for whoever may see the deal.
create or replace function public.anniversary_card(target_deal uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'client', c.full_name,
    'closed_on', d.closed_on,
    'title', p.title,
    'area', p.area,
    'place', concat_ws(', ', n.name, s.settlement_type || ' ' || s.name),
    'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
    'market', public.purchase_growth(d.id),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = d.broker_id
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = d.organization_id
    )
  )
  from public.deals d
  left join public.clients c on c.id = d.client_id
  left join public.properties p on p.id = d.property_id
  left join public.geo_settlements s on s.id = p.settlement_id
  left join public.geo_neighborhoods n on n.id = p.neighborhood_id
  where d.id = target_deal and d.status = 'won' and public.can_view_deal(d.id);
$$;

grant execute on function public.anniversary_card(uuid) to authenticated;
revoke execute on function public.anniversary_card(uuid) from anon;

-- Once a day (from 06:00): today's birthdays and purchase anniversaries become the brokers' tasks,
-- each with a ready greeting.
create table public.greeting_runs (
  day date primary key
);
alter table public.greeting_runs enable row level security;
-- no policies: only the job writes it

create or replace function public.create_greeting_tasks(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  m int := extract(month from today);
  dd int := extract(day from today);
  -- 29 February birthdays and anniversaries are kept on the 28th in other years
  leap_late boolean := m = 2 and dd = 28 and extract(day from (make_date(extract(year from today)::int, 3, 1) - 1)) = 28;
  made integer := 0;
  n integer;
begin
  if local_now::time < time '06:00' then return 0; end if;
  insert into public.greeting_runs (day) values (today) on conflict do nothing;
  if not found then return 0; end if;

  insert into public.tasks (organization_id, assigned_to, created_by, title, type, client_id, due_date, description, occasion)
  select c.organization_id, c.responsible_broker_id, c.responsible_broker_id,
    left('Рожден ден: ' || c.full_name, 200), 'message', c.id, today,
    'Здравейте, ' || split_part(btrim(c.full_name), ' ', 1) || '! Честит рожден ден! Бъдете здрави и нека новата година Ви донесе много щастие! '
      || public.person_name(c.responsible_broker_id),
    'birthday'
  from public.clients c
  join public.organization_members mem on mem.organization_id = c.organization_id and mem.profile_id = c.responsible_broker_id
  where c.birth_month = m and (c.birth_day = dd or (leap_late and c.birth_day = 29))
  on conflict (client_id, occasion, due_date) where occasion is not null do nothing;
  get diagnostics n = row_count;
  made := made + n;

  insert into public.tasks (organization_id, assigned_to, created_by, title, type, client_id, property_id, due_date, description, occasion, anniversary_of)
  select d.organization_id, d.broker_id, d.broker_id,
    left('Годишнина от покупката: ' || c.full_name || ' (' || y.years || ' г.)', 200), 'message', c.id, d.property_id, today,
    'Здравейте, ' || split_part(btrim(c.full_name), ' ', 1) || '! Днес '
      || case when y.years = 1 then 'се навършва една година' else 'се навършват ' || y.years || ' години' end
      || ' от покупката на Вашия имот'
      || coalesce(' в ' || nullif(concat_ws(', ', nb.name, st.settlement_type || ' ' || st.name), ''), '')
      || '. Честита годишнина! '
      || case when (g.info ->> 'growth')::numeric >= 0.01
           then 'По нашите пазарни данни стойността му е нараснала с около ' || round((g.info ->> 'growth')::numeric * 100) || '%. '
           else '' end
      || 'Благодаря Ви за доверието — ако мога да помогна с нещо, аз съм насреща. '
      || public.person_name(d.broker_id),
    'anniversary', d.id
  from public.deals d
  join public.clients c on c.id = d.client_id
  join public.organization_members mem on mem.organization_id = d.organization_id and mem.profile_id = d.broker_id
  left join public.properties pr on pr.id = d.property_id
  left join public.geo_settlements st on st.id = pr.settlement_id
  left join public.geo_neighborhoods nb on nb.id = pr.neighborhood_id
  cross join lateral (select (extract(year from today) - extract(year from d.closed_on))::int as years) y
  cross join lateral (select public.purchase_growth(d.id) as info) g
  where d.status = 'won' and d.kind = 'sale' and d.closed_on < today
    and extract(month from d.closed_on) = m
    and (extract(day from d.closed_on) = dd or (leap_late and extract(day from d.closed_on) = 29))
    and y.years >= 1
  on conflict (client_id, occasion, due_date) where occasion is not null do nothing;
  get diagnostics n = row_count;
  made := made + n;

  return made;
end;
$$;

revoke execute on function public.create_greeting_tasks(timestamptz) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-greetings', '*/15 * * * *', 'select public.create_greeting_tasks()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- My business: income, expenses, pay yourself first (031)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- The territory board (032)
-- ---------------------------------------------------------------------
create or replace function public.territory_board(target_org uuid)
returns table (
  neighborhood_id uuid,
  neighborhood text,
  town text,
  broker_id uuid,
  broker_name text,
  listings integer,
  exclusives integer,
  deals integer,
  viewings integer
)
language sql
stable
security definer
set search_path = public
as $$
  with won as (
    select d.broker_id, p.neighborhood_id, d.property_id
    from public.deals d
    join public.properties p on p.id = d.property_id
    where d.organization_id = target_org and d.status = 'won' and d.closed_on >= public.sofia_today() - 365
      and p.neighborhood_id is not null
  ),
  events as (
    -- active listings now
    select p.neighborhood_id as nid, p.responsible_broker_id as bid, null::text as bname,
      1 as listings, (case when p.exclusive_contract then 1 else 0 end) as exclusives, 0 as deals, 0 as viewings
    from public.properties p
    where p.organization_id = target_org and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
      and p.neighborhood_id is not null and p.responsible_broker_id is not null
    union all
    -- deals closed in BRIXA in the last year
    select w.neighborhood_id, w.broker_id, null, 0, 0, 1, 0 from won w where w.broker_id is not null
    union all
    -- the register's deals of the last year (by the broker's name), unless the same listing is a BRIXA deal
    select c.neighborhood_id, null, btrim(c.broker_name), 0, 0, 1, 0
    from public.closed_deals c
    where c.organization_id = target_org and c.reported_on >= public.sofia_today() - 365 and c.neighborhood_id is not null
      and (c.property_id is null or not exists (select 1 from won w where w.property_id = c.property_id))
    union all
    -- viewings of the last 90 days
    select p.neighborhood_id, a.profile_id, null, 0, 0, 0, 1
    from public.activities a
    join public.properties p on p.id = a.property_id
    where a.organization_id = target_org and a.type = 'viewing'
      and a.occurred_at >= (public.sofia_today() - 90)::timestamp at time zone 'Europe/Sofia'
      and p.neighborhood_id is not null
  )
  select e.nid, n.name, s.settlement_type || ' ' || s.name, e.bid, e.bname,
    sum(e.listings)::int, sum(e.exclusives)::int, sum(e.deals)::int, sum(e.viewings)::int
  from events e
  join public.geo_neighborhoods n on n.id = e.nid
  join public.geo_settlements s on s.id = n.settlement_id
  where public.is_org_member(target_org)
  group by e.nid, n.name, s.settlement_type, s.name, e.bid, e.bname;
$$;

grant execute on function public.territory_board(uuid) to authenticated;
revoke execute on function public.territory_board(uuid) from anon;

-- ---------------------------------------------------------------------
-- The website (033)
-- ---------------------------------------------------------------------
alter table public.organizations
  add column site_slug text unique check (site_slug is null or site_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  add column site_enabled boolean not null default false,
  add column site_headline text check (site_headline is null or char_length(site_headline) <= 120),
  add column site_about text check (site_about is null or char_length(site_about) <= 2000);

-- a new client source: the website
alter table public.clients drop constraint if exists clients_source_check;
alter table public.clients add constraint clients_source_check check (source in (
  'personal', 'referral', 'agency', 'email', 'google', 'facebook', 'instagram', 'tiktok',
  'realistimo', 'billboard', 'flyers', 'banner', 'open_house', 'website'
));

-- the photos of a listing on a live website can be seen by anyone (like a shared listing)
create or replace function public.photo_is_shared(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.property_shares sh
    where sh.revoked_at is null
      and sh.property_id::text = split_part(object_name, '/', 2)
      and sh.organization_id::text = split_part(object_name, '/', 1)
  ) or exists (
    select 1 from public.owner_reports r
    where r.revoked_at is null
      and r.property_id::text = split_part(object_name, '/', 2)
      and r.organization_id::text = split_part(object_name, '/', 1)
  ) or exists (
    select 1 from public.properties p
    join public.organizations o on o.id = p.organization_id
    where o.site_enabled
      and p.id::text = split_part(object_name, '/', 2)
      and o.id::text = split_part(object_name, '/', 1)
      and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
  );
$$;

-- ---------------------------------------------------------------------
-- The website's data (anyone): the agency and its active listings
-- ---------------------------------------------------------------------
create or replace function public.site_public(site text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website,
      'address', o.address, 'logo_path', o.logo_path, 'headline', o.site_headline, 'about', o.site_about),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
          'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms,
          'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
          'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
          'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
          'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1))
        order by p.created_at desc)
      from public.properties p
      where p.organization_id = o.id and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'phone', pr.phone, 'email', pr.email,
          'job_title', pr.job_title, 'avatar_path', pr.avatar_path) order by m.created_at)
      from public.organization_members m join public.profiles pr on pr.id = m.profile_id
      where m.organization_id = o.id), '[]'::jsonb)
  )
  from public.organizations o
  where o.site_slug = lower(site) and o.site_enabled;
$$;

-- One listing of the website: its details, its photos, its broker.
create or replace function public.site_listing(site text, target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
      'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms, 'bedrooms', p.bedrooms,
      'floor', p.floor, 'total_floors', p.total_floors, 'construction', p.construction_type, 'condition', p.condition,
      'furnishing', p.furnishing, 'heating', p.heating, 'exposures', p.exposures, 'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position) from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = p.responsible_broker_id
    ),
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
  )
  from public.properties p
  join public.organizations o on o.id = p.organization_id
  where o.site_slug = lower(site) and o.site_enabled and p.id = target_property
    and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent');
$$;

-- "Call me back": the visitor becomes a client — of the listing's broker, or (a general question)
-- a free contact for the agency (the only broker, when there's just one).
create or replace function public.site_inquiry(
  site text,
  target_property uuid,
  visitor_name text,
  visitor_phone text,
  visitor_email text,
  message text,
  agreed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.organizations;
  p public.properties;
  broker uuid;
  found uuid;
  found_broker uuid;
  clean_name text := nullif(btrim(visitor_name), '');
  clean_phone text := nullif(btrim(visitor_phone), '');
  clean_email text := nullif(lower(btrim(visitor_email)), '');
  clean_message text := left(nullif(btrim(message), ''), 1000);
begin
  select * into o from public.organizations where site_slug = lower(site) and site_enabled;
  if o.id is null then raise exception 'site_closed'; end if;
  if not coalesce(agreed, false) then raise exception 'consent_required'; end if;
  if clean_name is null or char_length(clean_name) not between 2 and 120 then raise exception 'name_required'; end if;
  if clean_phone is null and clean_email is null then raise exception 'contact_required'; end if;
  -- a little protection from floods
  if (select count(*) from public.clients c where c.organization_id = o.id and c.source = 'website'
      and c.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many';
  end if;

  if target_property is not null then
    select * into p from public.properties
    where id = target_property and organization_id = o.id and status in ('active', 'reserved') and operation_type in ('sale', 'rent');
  end if;
  -- the listing's broker; for a general question, the only broker when there's just one (else a free contact)
  broker := coalesce(
    p.responsible_broker_id,
    (select m.profile_id from public.organization_members m
     where m.organization_id = o.id and (select count(*) from public.organization_members x where x.organization_id = o.id) = 1
     limit 1)
  );

  if clean_phone is not null then
    select c.id, c.responsible_broker_id into found, found_broker from public.clients c
    where c.organization_id = o.id and c.phone_normalized = public.normalize_phone(clean_phone);
  end if;

  if found is null then
    insert into public.clients (organization_id, responsible_broker_id, created_by, full_name, phone, email, types, source, stage, notes)
    values (
      o.id, broker, broker, clean_name, left(clean_phone, 40), left(clean_email, 200),
      case when p.operation_type = 'rent' then array['tenant'] else array['buyer'] end,
      'website', 'new_contact',
      left(concat_ws(E'\n', 'От сайта' || coalesce(': ' || p.title, ''), clean_message), 5000)
    );
  else
    -- a client we know: tell their broker (or the listing's) what they asked
    perform public.notify(
      o.id, coalesce(found_broker, broker), null, 'site_inquiry',
      jsonb_build_object('actor', clean_name, 'title', coalesce(p.title, '')),
      '/clients/' || found
    )
    where coalesce(found_broker, broker) is not null;
    update public.clients
    set notes = left(concat_ws(E'\n', notes, 'От сайта (' || to_char(public.sofia_today(), 'DD.MM.YYYY') || ')'
      || coalesce(': ' || p.title, '') || coalesce(' — ' || clean_message, '')), 5000)
    where id = found;
  end if;
  return true;
end;
$$;

grant execute on function public.site_public(text) to anon, authenticated;
grant execute on function public.site_listing(text, uuid) to anon, authenticated;
grant execute on function public.site_inquiry(text, uuid, text, text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------
-- How the clients behave: shared-link signals and temperatures (034)
-- ---------------------------------------------------------------------
-- What the client did with a shared listing
-- ---------------------------------------------------------------------
create table public.share_events (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.property_shares (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  kind text not null check (kind in ('open', 'call', 'viber', 'whatsapp', 'email')),
  -- an opening: how long the page was looked at, how many photos were seen
  seconds int not null default 0 check (seconds between 0 and 3600),
  photos int not null default 0 check (photos between 0 and 200),
  occurred_at timestamptz not null default now()
);

create index share_events_client_idx on public.share_events (client_id, occurred_at desc);
create index share_events_share_idx on public.share_events (share_id, occurred_at desc);
create index share_events_org_idx on public.share_events (organization_id, occurred_at desc);

alter table public.share_events enable row level security;

-- the client's broker, whoever sent the link, and the managers; written only by the page's functions below
create policy "share events: read" on public.share_events
  for select to authenticated
  using (
    public.is_org_manager(organization_id)
    or (client_id is not null and public.can_view_client(client_id))
    or exists (select 1 from public.property_shares s where s.id = share_id and s.created_by = auth.uid())
  );

-- the openings counted before this log existed: one each, at the last time
insert into public.share_events (share_id, organization_id, client_id, property_id, kind, occurred_at)
select id, organization_id, client_id, property_id, 'open', last_viewed_at
from public.property_shares
where views > 0 and last_viewed_at is not null;

-- ---------------------------------------------------------------------
-- Each client's temperature (none for free contacts and closed / lost clients)
-- ---------------------------------------------------------------------
create table public.client_temperatures (
  client_id uuid primary key references public.clients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  temperature text not null check (temperature in ('hot', 'warm', 'cooling', 'cold')),
  -- for sorting: hot 4, warm 3, cooling 2, cold 1
  rank smallint generated always as (case temperature when 'hot' then 4 when 'warm' then 3 when 'cooling' then 2 else 1 end) stored,
  -- 0–100: the order inside a temperature
  score int not null default 0,
  -- why: [{ "code": "opens", "n": 3, "days": 2 }, …], the strongest first
  reasons jsonb not null default '[]',
  last_open_at timestamptz,
  last_contact_at timestamptz,
  computed_at timestamptz not null default now()
);

create index client_temperatures_org_idx on public.client_temperatures (organization_id, rank desc, score desc);

alter table public.client_temperatures enable row level security;

create policy "client temperatures: read" on public.client_temperatures
  for select to authenticated
  using (public.can_view_client(client_id));

-- The temperature, worked out from what the client did and what the broker did.
create or replace function public.compute_client_temperature(target_client uuid)
returns table (temperature text, score int, reasons jsonb, last_open_at timestamptz, last_contact_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  cadence int;
  last_contact timestamptz;
  days_quiet int;
  ratio numeric;
  opens_48h int;
  opens_7d int;
  opens_14d int;
  opens_ever int;
  last_open timestamptz;
  taps_3d int;
  taps_7d int;
  last_tap text;
  seconds_7d int;
  photos_7d int;
  pos int;
  neg int;
  unopened int;
  deal_stage text;
  s int := 50;
  strong boolean;
  r jsonb := '[]';
  temp text;
begin
  select cl.id, cl.stage, cl.client_class, cl.responsible_broker_id, cl.assigned_at, cl.created_at,
         o.follow_up_days_a, o.follow_up_days_b, o.follow_up_days_c
  into c
  from public.clients cl
  join public.organizations o on o.id = cl.organization_id
  where cl.id = target_client;
  if c.id is null or c.stage in ('deal', 'lost') or c.responsible_broker_id is null then
    return;
  end if;

  -- how long since the broker was last in touch, against the class's rhythm (A 2 / B 7 / C 30 days)
  cadence := greatest(1, case c.client_class when 'A' then c.follow_up_days_a when 'B' then c.follow_up_days_b else c.follow_up_days_c end);
  select max(a.occurred_at) into last_contact
  from public.activities a
  where a.client_id = target_client and a.type <> 'note';
  days_quiet := floor(extract(epoch from now() - coalesce(last_contact, c.assigned_at, c.created_at)) / 86400);
  ratio := days_quiet::numeric / cadence;

  -- the shared links
  select
    count(*) filter (where e.kind = 'open' and e.occurred_at > now() - interval '48 hours'),
    count(*) filter (where e.kind = 'open' and e.occurred_at > now() - interval '7 days'),
    count(*) filter (where e.kind = 'open' and e.occurred_at > now() - interval '14 days'),
    count(*) filter (where e.kind = 'open'),
    max(e.occurred_at) filter (where e.kind = 'open'),
    count(*) filter (where e.kind <> 'open' and e.occurred_at > now() - interval '3 days'),
    count(*) filter (where e.kind <> 'open' and e.occurred_at > now() - interval '7 days'),
    coalesce(sum(e.seconds) filter (where e.kind = 'open' and e.occurred_at > now() - interval '7 days'), 0),
    coalesce(max(e.photos) filter (where e.kind = 'open' and e.occurred_at > now() - interval '7 days'), 0)
  into opens_48h, opens_7d, opens_14d, opens_ever, last_open, taps_3d, taps_7d, seconds_7d, photos_7d
  from public.share_events e
  where e.client_id = target_client;
  select e.kind into last_tap
  from public.share_events e
  where e.client_id = target_client and e.kind <> 'open' and e.occurred_at > now() - interval '7 days'
  order by e.occurred_at desc
  limit 1;
  -- sent at least three days ago and never opened
  select count(*) into unopened
  from public.property_shares ps
  where ps.client_id = target_client and ps.revoked_at is null and ps.views = 0
    and ps.created_at < now() - interval '3 days' and ps.created_at > now() - interval '30 days';

  -- how the meetings went (the last 30 days)
  select count(*) filter (where a.outcome = 'positive'), count(*) filter (where a.outcome = 'negative')
  into pos, neg
  from public.activities a
  where a.client_id = target_client and a.occurred_at > now() - interval '30 days';

  -- the furthest open deal
  select d.stage into deal_stage
  from public.deals d
  where d.client_id = target_client and d.status = 'open'
  order by array_position(array['viewing', 'offer', 'deposit', 'preliminary', 'notary'], d.stage) desc
  limit 1;

  -- ---- the score, and the reasons (the strongest first)
  if taps_7d > 0 then
    s := s + 30;
    r := r || jsonb_build_object('code', 'tapped', 'kind', last_tap);
  end if;
  if opens_48h >= 2 then
    s := s + 25;
    r := r || jsonb_build_object('code', 'opens', 'n', opens_48h, 'days', 2);
  elsif opens_7d >= 3 then
    s := s + 20;
    r := r || jsonb_build_object('code', 'opens', 'n', opens_7d, 'days', 7);
  elsif opens_7d >= 1 then
    s := s + 10;
    r := r || jsonb_build_object('code', 'opened', 'at', last_open);
  end if;
  if deal_stage in ('offer', 'deposit', 'preliminary', 'notary') then
    s := s + 25;
    r := r || jsonb_build_object('code', 'deal', 'stage', deal_stage);
  end if;
  if c.stage in ('negotiation', 'deposit') then
    s := s + 20;
    r := r || jsonb_build_object('code', 'stage', 'stage', c.stage);
  elsif c.stage = 'viewing' then
    s := s + 10;
  elsif c.stage = 'presentation' then
    s := s + 5;
  end if;
  if pos > 0 then
    s := s + 10 * least(pos, 2);
    r := r || jsonb_build_object('code', 'positive', 'n', pos);
  end if;
  if seconds_7d >= 120 or photos_7d >= 8 then
    s := s + 5;
    r := r || jsonb_build_object('code', 'long_look', 'minutes', round(seconds_7d / 60.0), 'photos', photos_7d);
  end if;
  if c.client_class = 'A' then
    s := s + 5;
  elsif c.client_class = 'C' then
    s := s - 5;
  end if;
  if ratio > 1 then
    s := s - case when ratio > 4 then 40 when ratio > 2 then 25 else 10 end;
    r := r || jsonb_build_object('code', 'quiet', 'days', days_quiet, 'cadence', cadence);
  end if;
  if neg > 0 then
    s := s - 10 * least(neg, 2);
    r := r || jsonb_build_object('code', 'negative', 'n', neg);
  end if;
  if unopened > 0 then
    s := s - 5 * least(unopened, 3);
    r := r || jsonb_build_object('code', 'unopened', 'n', unopened);
  end if;
  if opens_ever > 0 and opens_14d = 0 then
    s := s - 10;
    r := r || jsonb_build_object('code', 'stopped', 'at', last_open);
  end if;
  s := greatest(0, least(100, s));

  -- ---- the temperature
  -- 🔥 the client is moving now (a deal or a negotiation counts only while the broker keeps in touch)
  strong := taps_3d > 0 or opens_48h >= 2
    or ((deal_stage in ('offer', 'deposit', 'preliminary', 'notary') or c.stage in ('negotiation', 'deposit')) and ratio <= 2);
  temp := case
    when strong or s >= 80 then 'hot'
    when ratio >= 3 and opens_14d = 0 and taps_7d = 0 then 'cold'
    when ratio > 1 or s < 40 then 'cooling'
    else 'warm'
  end;

  temperature := temp;
  score := s;
  reasons := r;
  last_open_at := greatest(last_open, (select max(ps.last_viewed_at) from public.property_shares ps where ps.client_id = target_client));
  last_contact_at := last_contact;
  return next;
end;
$$;

create or replace function public.refresh_client_temperature(target_client uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if target_client is null then
    return null;
  end if;
  select * into t from public.compute_client_temperature(target_client);
  if t.temperature is null then
    delete from public.client_temperatures where client_id = target_client;
    return null;
  end if;
  insert into public.client_temperatures as ct
    (client_id, organization_id, temperature, score, reasons, last_open_at, last_contact_at, computed_at)
  select target_client, cl.organization_id, t.temperature, t.score, t.reasons, t.last_open_at, t.last_contact_at, now()
  from public.clients cl
  where cl.id = target_client
  on conflict (client_id) do update
    set temperature = excluded.temperature,
        score = excluded.score,
        reasons = excluded.reasons,
        last_open_at = excluded.last_open_at,
        last_contact_at = excluded.last_contact_at,
        computed_at = excluded.computed_at;
  return t.temperature;
end;
$$;

-- every client (the scheduled job: time alone cools a client down)
create or replace function public.refresh_client_temperatures()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  n int := 0;
begin
  delete from public.client_temperatures ct
  using public.clients cl
  where cl.id = ct.client_id and (cl.stage in ('deal', 'lost') or cl.responsible_broker_id is null);
  for c in
    select id from public.clients where stage not in ('deal', 'lost') and responsible_broker_id is not null
  loop
    perform public.refresh_client_temperature(c.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.compute_client_temperature(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_client_temperature(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_client_temperatures() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Kept up to date: what the broker logs, the client's stage and class, the deals
-- ---------------------------------------------------------------------
create or replace function public.temperature_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'clients' then
    perform public.refresh_client_temperature(new.id);
    return null;
  end if;
  -- an activity or a deal: its client, and the one it was moved away from
  if tg_op = 'DELETE' then
    perform public.refresh_client_temperature(old.client_id);
    return null;
  end if;
  perform public.refresh_client_temperature(new.client_id);
  if tg_op = 'UPDATE' and old.client_id is distinct from new.client_id then
    perform public.refresh_client_temperature(old.client_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.temperature_on_change() from public, anon, authenticated;

create trigger activities_temperature
  after insert or update of client_id, type, outcome, occurred_at or delete on public.activities
  for each row execute function public.temperature_on_change();

create trigger clients_temperature
  after insert or update of stage, client_class, responsible_broker_id on public.clients
  for each row execute function public.temperature_on_change();

create trigger deals_temperature
  after insert or update of client_id, stage, status or delete on public.deals
  for each row execute function public.temperature_on_change();

-- ---------------------------------------------------------------------
-- The listing's page reports what the client does
-- ---------------------------------------------------------------------

-- An opening, or a tap on call / Viber / WhatsApp / e-mail. Returns the opening's id (its time is added later).
create or replace function public.record_share_event(share_token uuid, event text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sh record;
  recent int;
  ev uuid;
  opens int;
  recipient uuid;
  client_name text;
begin
  if event not in ('open', 'call', 'viber', 'whatsapp', 'email') then
    return null;
  end if;
  select s.id, s.organization_id, s.property_id, s.client_id, s.created_by into sh
  from public.property_shares s
  where s.token = share_token and s.revoked_at is null;
  if sh.id is null then
    return null;
  end if;
  -- a flood from one link is ignored
  select count(*) into recent from public.share_events where share_id = sh.id and occurred_at > now() - interval '1 hour';
  if recent >= 30 then
    return null;
  end if;

  if event = 'open' then
    -- the count on the link, and "… opened the listing" the first time
    perform public.mark_share_viewed(share_token);
  end if;
  insert into public.share_events (share_id, organization_id, client_id, property_id, kind)
  values (sh.id, sh.organization_id, sh.client_id, sh.property_id, event)
  returning id into ev;

  if sh.client_id is not null then
    perform public.refresh_client_temperature(sh.client_id);

    -- 🔥 at once: a tap, or the listing opened again within two days (once in 12 hours per client)
    select count(*) into opens
    from public.share_events
    where client_id = sh.client_id and kind = 'open' and occurred_at > now() - interval '48 hours';
    if event <> 'open' or opens >= 2 then
      select coalesce(c.responsible_broker_id, sh.created_by), c.full_name into recipient, client_name
      from public.clients c where c.id = sh.client_id;
      if recipient is not null and not exists (
        select 1 from public.notifications n
        where n.recipient_id = recipient and n.type = 'client_hot'
          and n.link = '/clients/' || sh.client_id and n.created_at > now() - interval '12 hours'
      ) then
        perform public.notify(
          sh.organization_id, recipient, null, 'client_hot',
          jsonb_build_object(
            'actor', client_name,
            'title', (select title from public.properties where id = sh.property_id),
            'kind', event,
            'count', opens
          ),
          '/clients/' || sh.client_id
        );
      end if;
    end if;
  end if;
  return ev;
end;
$$;

-- How long the page was looked at and how many photos were seen (sent when the page is left).
create or replace function public.share_event_time(share_token uuid, event_id uuid, seen_seconds int, seen_photos int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  update public.share_events e
  set seconds = greatest(e.seconds, least(greatest(coalesce(seen_seconds, 0), 0), 3600)),
      photos = greatest(e.photos, least(greatest(coalesce(seen_photos, 0), 0), 200))
  from public.property_shares s
  where e.id = event_id and e.kind = 'open' and s.id = e.share_id and s.token = share_token
    and e.occurred_at > now() - interval '6 hours'
  returning e.client_id into target;
  if target is not null then
    perform public.refresh_client_temperature(target);
  end if;
end;
$$;

grant execute on function public.record_share_event(uuid, text) to anon, authenticated;
grant execute on function public.share_event_time(uuid, uuid, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Every hour: the temperatures (quiet clients cool down with time alone)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-temperatures', '7 * * * *', 'select public.refresh_client_temperatures()');
  end if;
end;
$$;

-- the first reading for everyone
select public.refresh_client_temperatures();

-- ---------------------------------------------------------------------
-- The class follows the behaviour (035)
-- ---------------------------------------------------------------------
alter table public.clients add column class_manual_at timestamptz;

alter table public.client_temperatures
  add column auto_class_at timestamptz,
  add column auto_class_from text check (auto_class_from is null or auto_class_from in ('A', 'B', 'C')),
  add column auto_class_reason text check (auto_class_reason is null or auto_class_reason in ('hot', 'engaged', 'quiet'));

-- A class chosen by a person (not by the system) is remembered: it holds for a while.
create or replace function public.mark_manual_class()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('brixa.auto_class', true), '') = 'on' or auth.uid() is null then
    return new;
  end if;
  -- a new client: only A or B is a choice (C is where the form starts)
  if (tg_op = 'INSERT' and new.client_class <> 'C')
     or (tg_op = 'UPDATE' and new.client_class is distinct from old.client_class) then
    new.class_manual_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.mark_manual_class() from public, anon, authenticated;

create trigger clients_manual_class
  before insert or update of client_class on public.clients
  for each row execute function public.mark_manual_class();

-- The temperature (034's), with "hot" measured the same whatever the class, and two more outputs.
drop function public.compute_client_temperature(uuid);

create or replace function public.compute_client_temperature(target_client uuid)
returns table (
  temperature text, score int, reasons jsonb, last_open_at timestamptz, last_contact_at timestamptz,
  -- how quiet against the class's rhythm (2 = twice the rhythm), and a sign of interest in the last 7 days
  quiet_ratio numeric, engaged boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  cadence int;
  last_contact timestamptz;
  days_quiet int;
  ratio numeric;
  opens_48h int;
  opens_7d int;
  opens_14d int;
  opens_ever int;
  last_open timestamptz;
  taps_3d int;
  taps_7d int;
  last_tap text;
  seconds_7d int;
  photos_7d int;
  pos int;
  pos_7d int;
  neg int;
  unopened int;
  deal_stage text;
  s int := 50;
  strong boolean;
  r jsonb := '[]';
  temp text;
begin
  select cl.id, cl.stage, cl.client_class, cl.responsible_broker_id, cl.assigned_at, cl.created_at,
         o.follow_up_days_a, o.follow_up_days_b, o.follow_up_days_c
  into c
  from public.clients cl
  join public.organizations o on o.id = cl.organization_id
  where cl.id = target_client;
  if c.id is null or c.stage in ('deal', 'lost') or c.responsible_broker_id is null then
    return;
  end if;

  -- how long since the broker was last in touch, against the class's rhythm (A 2 / B 7 / C 30 days)
  cadence := greatest(1, case c.client_class when 'A' then c.follow_up_days_a when 'B' then c.follow_up_days_b else c.follow_up_days_c end);
  select max(a.occurred_at) into last_contact
  from public.activities a
  where a.client_id = target_client and a.type <> 'note';
  days_quiet := floor(extract(epoch from now() - coalesce(last_contact, c.assigned_at, c.created_at)) / 86400);
  ratio := days_quiet::numeric / cadence;

  -- the shared links
  select
    count(*) filter (where e.kind = 'open' and e.occurred_at > now() - interval '48 hours'),
    count(*) filter (where e.kind = 'open' and e.occurred_at > now() - interval '7 days'),
    count(*) filter (where e.kind = 'open' and e.occurred_at > now() - interval '14 days'),
    count(*) filter (where e.kind = 'open'),
    max(e.occurred_at) filter (where e.kind = 'open'),
    count(*) filter (where e.kind <> 'open' and e.occurred_at > now() - interval '3 days'),
    count(*) filter (where e.kind <> 'open' and e.occurred_at > now() - interval '7 days'),
    coalesce(sum(e.seconds) filter (where e.kind = 'open' and e.occurred_at > now() - interval '7 days'), 0),
    coalesce(max(e.photos) filter (where e.kind = 'open' and e.occurred_at > now() - interval '7 days'), 0)
  into opens_48h, opens_7d, opens_14d, opens_ever, last_open, taps_3d, taps_7d, seconds_7d, photos_7d
  from public.share_events e
  where e.client_id = target_client;
  select e.kind into last_tap
  from public.share_events e
  where e.client_id = target_client and e.kind <> 'open' and e.occurred_at > now() - interval '7 days'
  order by e.occurred_at desc
  limit 1;
  -- sent at least three days ago and never opened
  select count(*) into unopened
  from public.property_shares ps
  where ps.client_id = target_client and ps.revoked_at is null and ps.views = 0
    and ps.created_at < now() - interval '3 days' and ps.created_at > now() - interval '30 days';

  -- how the meetings went (the last 30 days)
  select count(*) filter (where a.outcome = 'positive'),
         count(*) filter (where a.outcome = 'positive' and a.occurred_at > now() - interval '7 days'),
         count(*) filter (where a.outcome = 'negative')
  into pos, pos_7d, neg
  from public.activities a
  where a.client_id = target_client and a.occurred_at > now() - interval '30 days';

  -- the furthest open deal
  select d.stage into deal_stage
  from public.deals d
  where d.client_id = target_client and d.status = 'open'
  order by array_position(array['viewing', 'offer', 'deposit', 'preliminary', 'notary'], d.stage) desc
  limit 1;

  -- ---- the score, and the reasons (the strongest first)
  if taps_7d > 0 then
    s := s + 30;
    r := r || jsonb_build_object('code', 'tapped', 'kind', last_tap);
  end if;
  if opens_48h >= 2 then
    s := s + 25;
    r := r || jsonb_build_object('code', 'opens', 'n', opens_48h, 'days', 2);
  elsif opens_7d >= 3 then
    s := s + 20;
    r := r || jsonb_build_object('code', 'opens', 'n', opens_7d, 'days', 7);
  elsif opens_7d >= 1 then
    s := s + 10;
    r := r || jsonb_build_object('code', 'opened', 'at', last_open);
  end if;
  if deal_stage in ('offer', 'deposit', 'preliminary', 'notary') then
    s := s + 25;
    r := r || jsonb_build_object('code', 'deal', 'stage', deal_stage);
  end if;
  if c.stage in ('negotiation', 'deposit') then
    s := s + 20;
    r := r || jsonb_build_object('code', 'stage', 'stage', c.stage);
  elsif c.stage = 'viewing' then
    s := s + 10;
  elsif c.stage = 'presentation' then
    s := s + 5;
  end if;
  if pos > 0 then
    s := s + 10 * least(pos, 2);
    r := r || jsonb_build_object('code', 'positive', 'n', pos);
  end if;
  if seconds_7d >= 120 or photos_7d >= 8 then
    s := s + 5;
    r := r || jsonb_build_object('code', 'long_look', 'minutes', round(seconds_7d / 60.0), 'photos', photos_7d);
  end if;
  if c.client_class = 'A' then
    s := s + 5;
  elsif c.client_class = 'C' then
    s := s - 5;
  end if;
  if ratio > 1 then
    s := s - case when ratio > 4 then 40 when ratio > 2 then 25 else 10 end;
    r := r || jsonb_build_object('code', 'quiet', 'days', days_quiet, 'cadence', cadence);
  end if;
  if neg > 0 then
    s := s - 10 * least(neg, 2);
    r := r || jsonb_build_object('code', 'negative', 'n', neg);
  end if;
  if unopened > 0 then
    s := s - 5 * least(unopened, 3);
    r := r || jsonb_build_object('code', 'unopened', 'n', unopened);
  end if;
  if opens_ever > 0 and opens_14d = 0 then
    s := s - 10;
    r := r || jsonb_build_object('code', 'stopped', 'at', last_open);
  end if;
  s := greatest(0, least(100, s));

  -- ---- the temperature
  -- 🔥 the client is moving now (a deal or a negotiation counts only while the broker keeps in touch —
  -- measured against A's rhythm, whatever the class, so that the class can follow without going round)
  strong := taps_3d > 0 or opens_48h >= 2
    or ((deal_stage in ('offer', 'deposit', 'preliminary', 'notary') or c.stage in ('negotiation', 'deposit'))
        and days_quiet <= 2 * greatest(1, c.follow_up_days_a));
  temp := case
    when strong or s >= 80 then 'hot'
    when ratio >= 3 and opens_14d = 0 and taps_7d = 0 then 'cold'
    when ratio > 1 or s < 40 then 'cooling'
    else 'warm'
  end;

  temperature := temp;
  score := s;
  reasons := r;
  last_open_at := greatest(last_open, (select max(ps.last_viewed_at) from public.property_shares ps where ps.client_id = target_client));
  last_contact_at := last_contact;
  quiet_ratio := ratio;
  engaged := opens_7d > 0 or taps_7d > 0 or pos_7d > 0;
  return next;
end;
$$;

revoke execute on function public.compute_client_temperature(uuid) from public, anon, authenticated;

-- The temperature — and the class follows it.
create or replace function public.refresh_client_temperature(target_client uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  cl record;
  target_class text;
  why text;
begin
  if target_client is null then
    return null;
  end if;
  select * into t from public.compute_client_temperature(target_client);
  if t.temperature is null then
    delete from public.client_temperatures where client_id = target_client;
    return null;
  end if;
  insert into public.client_temperatures as ct
    (client_id, organization_id, temperature, score, reasons, last_open_at, last_contact_at, computed_at)
  select target_client, c.organization_id, t.temperature, t.score, t.reasons, t.last_open_at, t.last_contact_at, now()
  from public.clients c
  where c.id = target_client
  on conflict (client_id) do update
    set temperature = excluded.temperature,
        score = excluded.score,
        reasons = excluded.reasons,
        last_open_at = excluded.last_open_at,
        last_contact_at = excluded.last_contact_at,
        computed_at = excluded.computed_at;

  -- ---- the class follows the behaviour (not while the system is already moving it)
  if coalesce(current_setting('brixa.auto_class', true), '') = 'on' then
    return t.temperature;
  end if;
  select c.client_class, c.class_manual_at into cl from public.clients c where c.id = target_client;
  -- set by hand: holds for 14 days, or until the client does something new
  if cl.class_manual_at is not null
     and cl.class_manual_at > now() - interval '14 days'
     and not exists (select 1 from public.share_events e where e.client_id = target_client and e.occurred_at > cl.class_manual_at) then
    return t.temperature;
  end if;

  if t.temperature = 'hot' and cl.client_class <> 'A' then
    target_class := 'A';
    why := 'hot';
  elsif cl.client_class = 'C' and t.engaged then
    target_class := 'B';
    why := 'engaged';
  elsif t.temperature in ('cooling', 'cold') and t.quiet_ratio > 2 and not t.engaged and cl.client_class <> 'C' then
    target_class := case cl.client_class when 'A' then 'B' else 'C' end;
    why := 'quiet';
  end if;
  if target_class is null then
    return t.temperature;
  end if;

  -- the follow-up rhythm moves with the class (its own trigger); the temperature is worked out again for the new class
  perform set_config('brixa.auto_class', 'on', true);
  update public.clients set client_class = target_class where id = target_client;
  perform set_config('brixa.auto_class', 'off', true);
  update public.client_temperatures
  set auto_class_at = now(), auto_class_from = cl.client_class, auto_class_reason = why
  where client_id = target_client;
  return (select temperature from public.client_temperatures where client_id = target_client);
end;
$$;

revoke execute on function public.refresh_client_temperature(uuid) from public, anon, authenticated;

-- everyone, now
select public.refresh_client_temperatures();

-- ---------------------------------------------------------------------
-- Leads from Google Forms; colleagues' searches told to everyone (036)
-- ---------------------------------------------------------------------
-- a new client source: a form (survey / ad)
alter table public.clients drop constraint if exists clients_source_check;
alter table public.clients add constraint clients_source_check check (source in (
  'personal', 'referral', 'agency', 'email', 'google', 'facebook', 'instagram', 'tiktok',
  'realistimo', 'billboard', 'flyers', 'banner', 'open_house', 'website', 'form'
));

-- ---------------------------------------------------------------------
-- The forms (the folders of the cold contacts)
-- ---------------------------------------------------------------------
create table public.lead_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  -- whose new contacts they are (no one: they go to the free contacts)
  broker_id uuid references public.profiles (id) on delete set null,
  -- what the people answering are: buyers, sellers…
  client_type text not null default 'buyer' check (client_type in ('buyer', 'seller', 'tenant', 'landlord', 'investor')),
  -- where the ad runs (the contacts' source)
  source text not null default 'form' check (source in (
    'form', 'facebook', 'instagram', 'google', 'tiktok', 'website', 'email', 'flyers', 'billboard', 'banner', 'realistimo'
  )),
  -- the form's script sends here: the token is the key
  token uuid not null unique default gen_random_uuid(),
  connected_at timestamptz,
  last_response_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index lead_forms_org_idx on public.lead_forms (organization_id, created_at desc);

alter table public.lead_forms enable row level security;

create policy "lead forms: read" on public.lead_forms
  for select to authenticated
  using (public.is_org_member(organization_id));
-- managers for anyone, a broker for themselves
create policy "lead forms: create" on public.lead_forms
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and (public.is_org_manager(organization_id) or broker_id = auth.uid())
    and (broker_id is null or exists (
      select 1 from public.organization_members m where m.organization_id = lead_forms.organization_id and m.profile_id = lead_forms.broker_id
    ))
  );
create policy "lead forms: update" on public.lead_forms
  for update to authenticated
  using (public.is_org_manager(organization_id) or broker_id = auth.uid())
  with check (
    public.is_org_member(organization_id)
    and (public.is_org_manager(organization_id) or broker_id = auth.uid())
  );
create policy "lead forms: delete" on public.lead_forms
  for delete to authenticated
  using (public.is_org_manager(organization_id) or broker_id = auth.uid());

alter table public.clients add column lead_form_id uuid references public.lead_forms (id) on delete set null;
create index clients_lead_form_idx on public.clients (lead_form_id, created_at desc) where lead_form_id is not null;

-- ---------------------------------------------------------------------
-- Every answer, kept with the contact
-- ---------------------------------------------------------------------
create table public.lead_form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.lead_forms (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  -- [{ "q": "the question", "a": "the answer" }, …]
  answers jsonb not null default '[]',
  received_at timestamptz not null default now()
);

create index lead_form_responses_client_idx on public.lead_form_responses (client_id, received_at desc);
create index lead_form_responses_form_idx on public.lead_form_responses (form_id, received_at desc);

alter table public.lead_form_responses enable row level security;

create policy "lead form responses: read" on public.lead_form_responses
  for select to authenticated
  using (
    public.is_org_manager(organization_id)
    or (client_id is not null and public.can_view_client(client_id))
  );

-- ---------------------------------------------------------------------
-- The form's script: "connected", and each answer
-- ---------------------------------------------------------------------
create or replace function public.ping_lead_form(form_token uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.lead_forms
  set connected_at = coalesce(connected_at, now())
  where token = form_token and archived_at is null
  returning true;
$$;

create or replace function public.submit_lead_form(form_token uuid, lead_name text, lead_phone text, lead_email text, answers jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.lead_forms;
  clean_name text := nullif(btrim(coalesce(lead_name, '')), '');
  clean_phone text := nullif(btrim(coalesce(lead_phone, '')), '');
  clean_email text := nullif(lower(btrim(coalesce(lead_email, ''))), '');
  clean_answers jsonb := case when jsonb_typeof(answers) = 'array' then answers else '[]'::jsonb end;
  recent int;
  found uuid;
  found_broker uuid;
  client uuid;
  summary text;
begin
  select * into f from public.lead_forms where token = form_token and archived_at is null;
  if f.id is null then
    return null;
  end if;
  -- a flood from one form is ignored
  select count(*) into recent from public.lead_form_responses where form_id = f.id and received_at > now() - interval '1 hour';
  if recent >= 200 then
    return null;
  end if;
  if clean_name is null and clean_phone is null and clean_email is null then
    return null;
  end if;
  if clean_email is not null and clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    clean_email := null;
  end if;
  -- a name is at least two letters
  if char_length(clean_name) < 2 then
    clean_name := null;
  end if;

  -- the answers, as text for the notes
  select string_agg(coalesce(x->>'q', '') || ': ' || coalesce(x->>'a', ''), E'\n')
  into summary
  from jsonb_array_elements(clean_answers) x;

  -- someone we know (by phone, else by e-mail)
  if clean_phone is not null then
    select c.id, c.responsible_broker_id into found, found_broker
    from public.clients c
    where c.organization_id = f.organization_id and c.phone_normalized = public.normalize_phone(clean_phone)
    limit 1;
  end if;
  if found is null and clean_email is not null then
    select c.id, c.responsible_broker_id into found, found_broker
    from public.clients c
    where c.organization_id = f.organization_id and lower(c.email) = clean_email
    limit 1;
  end if;

  if found is null then
    insert into public.clients (
      organization_id, responsible_broker_id, full_name, phone, email, types, client_class, source, stage, notes, lead_form_id
    )
    values (
      f.organization_id, f.broker_id,
      left(coalesce(clean_name, clean_phone, clean_email, 'Контакт от анкета'), 120),
      left(clean_phone, 40), left(clean_email, 200),
      array[f.client_type], 'C', f.source, 'new_contact',
      left(concat_ws(E'\n', 'От анкета „' || f.name || '“', summary), 5000),
      f.id
    )
    returning id into client;
    if f.broker_id is not null then
      perform public.notify(
        f.organization_id, f.broker_id, null, 'lead_new',
        jsonb_build_object('actor', left(coalesce(clean_name, clean_phone, clean_email), 120), 'title', f.name),
        '/clients/' || client
      );
    end if;
  else
    client := found;
    update public.clients
    set notes = left(concat_ws(E'\n', notes, 'От анкета „' || f.name || '“ (' || to_char(public.sofia_today(), 'DD.MM.YYYY') || ')', summary), 5000)
    where id = found;
    if coalesce(found_broker, f.broker_id) is not null then
      perform public.notify(
        f.organization_id, coalesce(found_broker, f.broker_id), null, 'lead_known',
        jsonb_build_object('actor', left(coalesce(clean_name, clean_phone, clean_email), 120), 'title', f.name),
        '/clients/' || found
      );
    end if;
  end if;

  insert into public.lead_form_responses (form_id, organization_id, client_id, answers)
  values (f.id, f.organization_id, client, clean_answers);
  update public.lead_forms
  set last_response_at = now(), connected_at = coalesce(connected_at, now())
  where id = f.id;
  return client;
end;
$$;

grant execute on function public.ping_lead_form(uuid) to anon, authenticated;
grant execute on function public.submit_lead_form(uuid, text, text, text, jsonb) to anon, authenticated;

-- A form's new contact is told to its broker as "a new contact from the form" (not also as "a client given to you").
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
      where organization_id = new.organization_id and role in ('owner', 'manager') and profile_id <> auth.uid()
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

-- ---------------------------------------------------------------------
-- A colleague's search entered: the whole agency hears of it
-- ---------------------------------------------------------------------
create or replace function public.on_partner_search_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member record;
begin
  for member in
    select profile_id from public.organization_members
    where organization_id = new.organization_id and profile_id is distinct from new.created_by
  loop
    perform public.notify(
      new.organization_id, member.profile_id, new.created_by, 'partner_search',
      jsonb_build_object(
        'actor', public.person_name(new.created_by),
        'title', new.broker_name || coalesce(' (' || new.agency || ')', ''),
        'kind', new.operation
      ),
      '/partner-searches'
    );
  end loop;
  return new;
end;
$$;

revoke execute on function public.on_partner_search_added() from public, anon, authenticated;

create trigger partner_searches_notify
  after insert on public.partner_searches
  for each row execute function public.on_partner_search_added();

-- ---------------------------------------------------------------------
-- The market, every day, from the agency's own data (037)
-- ---------------------------------------------------------------------
create table public.market_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  day date not null,
  operation text not null check (operation in ('sale', 'rent')),
  settlement_id uuid not null references public.geo_settlements (id) on delete cascade,
  -- none: the whole town
  neighborhood_id uuid references public.geo_neighborhoods (id) on delete cascade,
  -- none: every type
  subtype_id uuid references public.property_subtypes (id) on delete cascade,
  -- the listings on the market: how many, the average and the median € per m² (rent: per month)
  listings int not null default 0,
  listing_avg numeric(12, 2),
  listing_median numeric(12, 2),
  -- sold / rented in the last 90 days
  sold_count int not null default 0,
  sold_avg numeric(12, 2),
  -- the buyers (tenants) looking there now
  demand int not null default 0,
  constraint market_daily_cell unique nulls not distinct (organization_id, day, operation, settlement_id, neighborhood_id, subtype_id)
);

create index market_daily_org_day_idx on public.market_daily (organization_id, day desc, operation);

alter table public.market_daily enable row level security;

create policy "market daily: read" on public.market_daily
  for select to authenticated
  using (public.is_org_member(organization_id));

-- One agency's day: worked out again from scratch (so it can run more than once a day).
create or replace function public.snapshot_market(target_org uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.sofia_today();
  made int;
begin
  delete from public.market_daily where organization_id = target_org and day = today;

  with offers as (
    select p.operation_type as operation, p.settlement_id, p.neighborhood_id, p.subtype_id,
      public.to_eur(p.current_price, p.currency) / p.area as sqm
    from public.properties p
    where p.organization_id = target_org
      and p.status in ('active', 'reserved')
      and p.operation_type in ('sale', 'rent')
      and p.settlement_id is not null and p.subtype_id is not null
      and p.area > 0 and p.current_price > 0
  ),
  sold as (
    -- the register of closed deals (sales)…
    select 'sale'::text as operation, cd.settlement_id, cd.neighborhood_id, cd.subtype_id, cd.price / cd.area as sqm
    from public.closed_deals cd
    where cd.organization_id = target_org and cd.settlement_id is not null
      and cd.reported_on >= today - 90 and cd.price > 0
    union all
    -- …and our listings sold / rented that aren't in it
    select p.operation_type, p.settlement_id, p.neighborhood_id, p.subtype_id,
      coalesce(public.to_eur(w.price, w.currency), public.to_eur(p.current_price, p.currency)) / p.area
    from public.properties p
    left join lateral (
      select d.price, d.currency, d.closed_on from public.deals d
      where d.property_id = p.id and d.status = 'won' and d.price is not null
      order by d.closed_on desc limit 1
    ) w on true
    where p.organization_id = target_org
      and p.status in ('sold', 'rented')
      and p.operation_type in ('sale', 'rent')
      and p.settlement_id is not null and p.subtype_id is not null and p.area > 0
      and coalesce(w.closed_on, (p.updated_at at time zone 'Europe/Sofia')::date) >= today - 90
      and coalesce(public.to_eur(w.price, w.currency), public.to_eur(p.current_price, p.currency)) > 0
      and not exists (select 1 from public.closed_deals cd where cd.property_id = p.id)
  ),
  -- each place and type, each place, the town by type, the whole town
  o as (
    select operation, settlement_id,
      case when grouping(neighborhood_id) = 0 then neighborhood_id end as neighborhood_id,
      case when grouping(subtype_id) = 0 then subtype_id end as subtype_id,
      count(*)::int as listings,
      round(avg(sqm), 2) as listing_avg,
      round(percentile_cont(0.5) within group (order by sqm)::numeric, 2) as listing_median
    from offers
    group by grouping sets (
      (operation, settlement_id, neighborhood_id, subtype_id), (operation, settlement_id, neighborhood_id),
      (operation, settlement_id, subtype_id), (operation, settlement_id)
    )
    -- a listing with no neighbourhood counts for the town only
    having not (grouping(neighborhood_id) = 0 and neighborhood_id is null)
  ),
  s as (
    select operation, settlement_id,
      case when grouping(neighborhood_id) = 0 then neighborhood_id end as neighborhood_id,
      case when grouping(subtype_id) = 0 then subtype_id end as subtype_id,
      count(*)::int as sold_count,
      round(avg(sqm), 2) as sold_avg
    from sold
    group by grouping sets (
      (operation, settlement_id, neighborhood_id, subtype_id), (operation, settlement_id, neighborhood_id),
      (operation, settlement_id, subtype_id), (operation, settlement_id)
    )
    having not (grouping(neighborhood_id) = 0 and neighborhood_id is null)
  ),
  cells as (
    select operation, settlement_id, neighborhood_id, subtype_id, listings, listing_avg, listing_median, 0 as sold_count, null::numeric as sold_avg from o
    union all
    select operation, settlement_id, neighborhood_id, subtype_id, 0, null, null, sold_count, sold_avg from s
  )
  insert into public.market_daily (
    organization_id, day, operation, settlement_id, neighborhood_id, subtype_id,
    listings, listing_avg, listing_median, sold_count, sold_avg
  )
  select target_org, today, operation, settlement_id, neighborhood_id, subtype_id,
    sum(listings)::int, max(listing_avg), max(listing_median), sum(sold_count)::int, max(sold_avg)
  from cells
  group by operation, settlement_id, neighborhood_id, subtype_id;

  -- where buyers look but there's nothing on offer yet (each neighbourhood, every type)
  insert into public.market_daily (organization_id, day, operation, settlement_id, neighborhood_id, subtype_id)
  select distinct target_org, today, cs.operation, g.settlement_id, g.id, null::uuid
  from public.client_searches cs
  join public.clients c on c.id = cs.client_id
  cross join lateral unnest(cs.neighborhood_ids) as nid
  join public.geo_neighborhoods g on g.id = nid
  where c.organization_id = target_org and c.responsible_broker_id is not null and c.stage not in ('deal', 'lost')
  on conflict on constraint market_daily_cell do nothing;

  -- the buyers (tenants) looking in each place, for each type
  update public.market_daily m
  set demand = (
    select count(*)
    from public.client_searches cs
    join public.clients c on c.id = cs.client_id
    where c.organization_id = target_org and c.responsible_broker_id is not null and c.stage not in ('deal', 'lost')
      and cs.operation = m.operation
      and (m.subtype_id is null or cardinality(cs.subtype_ids) = 0 or m.subtype_id = any (cs.subtype_ids))
      and case
        when m.neighborhood_id is not null then m.neighborhood_id = any (cs.neighborhood_ids)
        else m.settlement_id = any (cs.settlement_ids)
          or exists (select 1 from public.geo_neighborhoods g where g.id = any (cs.neighborhood_ids) and g.settlement_id = m.settlement_id)
      end
  )
  where m.organization_id = target_org and m.day = today;

  select count(*) into made from public.market_daily where organization_id = target_org and day = today;
  return made;
end;
$$;

-- every agency (the morning job)
create or replace function public.snapshot_market_all()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  n int := 0;
begin
  for o in select id from public.organizations loop
    perform public.snapshot_market(o.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.snapshot_market(uuid) from public, anon, authenticated;
revoke execute on function public.snapshot_market_all() from public, anon, authenticated;

-- a manager can work today's numbers out again now (after entering many listings, say)
create or replace function public.refresh_market_today(target_org uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_manager(target_org) then
    raise exception 'not allowed';
  end if;
  return public.snapshot_market(target_org);
end;
$$;

revoke execute on function public.refresh_market_today(uuid) from public, anon;
grant execute on function public.refresh_market_today(uuid) to authenticated;

-- every morning at 6:30 (Sofia)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-market-daily', '30 3 * * *', 'select public.snapshot_market_all()');
  end if;
end;
$$;

-- the first day, now
select public.snapshot_market_all();

-- ---------------------------------------------------------------------
-- Colleagues, and each listing's marketing (038)
-- ---------------------------------------------------------------------
-- Colleagues from other agencies
-- ---------------------------------------------------------------------
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text check (phone is null or char_length(phone) <= 40),
  phone_normalized text generated always as (public.normalize_phone(phone)) stored,
  email text check (email is null or char_length(email) <= 200),
  agency text check (agency is null or char_length(agency) <= 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one colleague per phone in an agency
create unique index partners_phone_unique on public.partners (organization_id, phone_normalized) where phone_normalized is not null;
create index partners_org_idx on public.partners (organization_id, full_name);

create trigger partners_touch_updated_at
  before update on public.partners
  for each row execute function public.touch_updated_at();

alter table public.partners enable row level security;

-- the whole agency keeps the directory; whoever added one (or a manager) deletes it
create policy "partners: read" on public.partners
  for select to authenticated using (public.is_org_member(organization_id));
create policy "partners: create" on public.partners
  for insert to authenticated with check (created_by = auth.uid() and public.is_org_member(organization_id));
create policy "partners: update" on public.partners
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "partners: delete" on public.partners
  for delete to authenticated using (created_by = auth.uid() or public.is_org_manager(organization_id));

-- what they're linked to: a call, a task, a link sent, a search they gave us
alter table public.activities add column partner_id uuid references public.partners (id) on delete set null;
create index activities_partner_idx on public.activities (partner_id, occurred_at desc) where partner_id is not null;
alter table public.tasks add column partner_id uuid references public.partners (id) on delete set null;
create index tasks_partner_idx on public.tasks (partner_id) where partner_id is not null;
alter table public.property_shares add column partner_id uuid references public.partners (id) on delete set null;
create index property_shares_partner_idx on public.property_shares (partner_id) where partner_id is not null;
alter table public.partner_searches add column partner_id uuid references public.partners (id) on delete set null;

-- a colleague must be the agency's own
drop policy "activities: create" on public.activities;
create policy "activities: create" on public.activities
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.is_org_member(organization_id)
    and (client_id is null or public.can_view_client(client_id))
    and (property_id is null or public.can_view_property(property_id))
    and (partner_id is null or exists (
      select 1 from public.partners pa where pa.id = activities.partner_id and pa.organization_id = activities.organization_id
    ))
  );

drop policy "property shares: create" on public.property_shares;
create policy "property shares: create" on public.property_shares
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and exists (
      select 1 from public.properties p
      where p.id = property_shares.property_id and p.organization_id = property_shares.organization_id
    )
    and (client_id is null or public.can_view_client(client_id))
    and (partner_id is null or exists (
      select 1 from public.partners pa where pa.id = property_shares.partner_id and pa.organization_id = property_shares.organization_id
    ))
  );

-- The colleague with this phone (made if new) — for a colleague's search entered by hand.
create or replace function public.partner_for(
  target_org uuid, partner_name text, partner_phone text, partner_email text, partner_agency text, creator uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found uuid;
  clean_name text := btrim(coalesce(partner_name, ''));
begin
  if nullif(btrim(coalesce(partner_phone, '')), '') is null then
    return null;
  end if;
  select id into found from public.partners
  where organization_id = target_org and phone_normalized = public.normalize_phone(partner_phone);
  if found is null then
    insert into public.partners (organization_id, full_name, phone, email, agency, created_by)
    values (
      target_org,
      left(case when char_length(clean_name) >= 2 then clean_name else btrim(partner_phone) end, 120),
      left(btrim(partner_phone), 40), left(nullif(btrim(coalesce(partner_email, '')), ''), 200),
      left(nullif(btrim(coalesce(partner_agency, '')), ''), 120), creator
    )
    returning id into found;
  end if;
  return found;
end;
$$;

revoke execute on function public.partner_for(uuid, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.link_partner_search()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.partner_id is null then
    new.partner_id := public.partner_for(new.organization_id, new.broker_name, new.phone, new.email, new.agency, new.created_by);
  end if;
  return new;
end;
$$;

revoke execute on function public.link_partner_search() from public, anon, authenticated;

create trigger partner_searches_link_partner
  before insert or update of phone on public.partner_searches
  for each row execute function public.link_partner_search();

-- the searches already entered: to their colleagues
update public.partner_searches s
set partner_id = public.partner_for(s.organization_id, s.broker_name, s.phone, s.email, s.agency, s.created_by)
where s.partner_id is null and nullif(btrim(coalesce(s.phone, '')), '') is not null;

-- "… opened the listing": a colleague's name (and agency) when the link was theirs
create or replace function public.mark_share_viewed(share_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  share record;
begin
  update public.property_shares
  set views = views + 1,
      first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now()
  where token = share_token and revoked_at is null
  returning id, organization_id, property_id, client_id, partner_id, created_by, views into share;

  if share.id is not null and share.views = 1 and share.created_by is not null then
    perform public.notify(
      share.organization_id, share.created_by, null, 'share_viewed',
      jsonb_build_object(
        'title', (select title from public.properties where id = share.property_id),
        'actor', coalesce(
          (select full_name from public.clients where id = share.client_id),
          (select full_name || coalesce(' (' || agency || ')', '') from public.partners where id = share.partner_id)
        )
      ),
      '/properties/' || share.property_id
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Each listing's marketing plan
-- ---------------------------------------------------------------------

-- the agency's template: [{ "key": "photos" }, …, { "key": "colleagues", "weekly": true }, { "key": "c-…", "label": "…" }]
alter table public.organizations add column marketing_template jsonb not null default '[
  {"key": "photos"}, {"key": "video"}, {"key": "drone"}, {"key": "tour3d"}, {"key": "portals"},
  {"key": "social"}, {"key": "ads"}, {"key": "sign"}, {"key": "flyers"}, {"key": "open_house"},
  {"key": "colleagues", "weekly": true}, {"key": "farming"}, {"key": "buyers"}, {"key": "owner_report"}
]'::jsonb check (jsonb_typeof(marketing_template) = 'array');

-- a listing's own: the template's points left out, and its own points added
alter table public.properties
  add column marketing_hidden text[] not null default '{}',
  add column marketing_extra jsonb not null default '[]'::jsonb check (jsonb_typeof(marketing_extra) = 'array');

-- what was done, and when (a weekly point: every week)
create table public.marketing_done (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 60),
  done_on date not null default public.sofia_today(),
  done_by uuid references public.profiles (id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  -- ticked by BRIXA itself (a link shared, an open house, a report)
  auto boolean not null default false,
  created_at timestamptz not null default now()
);

create index marketing_done_property_idx on public.marketing_done (property_id, key, done_on desc);
create unique index marketing_done_auto_once on public.marketing_done (property_id, key, done_on) where auto;

alter table public.marketing_done enable row level security;

create policy "marketing done: read" on public.marketing_done
  for select to authenticated using (public.is_org_member(organization_id));
create policy "marketing done: create" on public.marketing_done
  for insert to authenticated
  with check (
    done_by = auth.uid() and not auto
    and public.can_edit_property(property_id)
    and exists (select 1 from public.properties p where p.id = property_id and p.organization_id = marketing_done.organization_id)
  );
create policy "marketing done: delete" on public.marketing_done
  for delete to authenticated using (public.can_edit_property(property_id));

-- BRIXA ticks what it sees: a link to a colleague / to a client, an open house, a report to the owner
create or replace function public.tick_marketing(target_property uuid, point text, on_day date, who uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.marketing_done (organization_id, property_id, key, done_on, done_by, auto)
  select p.organization_id, p.id, point, on_day, who, true
  from public.properties p
  where p.id = target_property
  on conflict (property_id, key, done_on) where auto do nothing;
$$;

revoke execute on function public.tick_marketing(uuid, text, date, uuid) from public, anon, authenticated;

create or replace function public.marketing_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'property_shares' then
    if new.partner_id is not null then
      perform public.tick_marketing(new.property_id, 'colleagues', public.sofia_today(), new.created_by);
    elsif new.client_id is not null then
      perform public.tick_marketing(new.property_id, 'buyers', public.sofia_today(), new.created_by);
    end if;
  elsif tg_table_name = 'open_houses' then
    perform public.tick_marketing(new.property_id, 'open_house', new.day, new.host_id);
  elsif tg_table_name = 'owner_reports' then
    perform public.tick_marketing(new.property_id, 'owner_report', public.sofia_today(), new.created_by);
  end if;
  return null;
end;
$$;

revoke execute on function public.marketing_on_event() from public, anon, authenticated;

create trigger property_shares_marketing after insert on public.property_shares
  for each row execute function public.marketing_on_event();
create trigger open_houses_marketing after insert on public.open_houses
  for each row execute function public.marketing_on_event();
create trigger owner_reports_marketing after insert on public.owner_reports
  for each row execute function public.marketing_on_event();

-- A manager saves the agency's template (the points, in order; custom ones with their words).
create or replace function public.set_marketing_template(target_org uuid, items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_manager(target_org) then
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

revoke execute on function public.set_marketing_template(uuid, jsonb) from public, anon;
grant execute on function public.set_marketing_template(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Every Monday: one task per broker — this week's marketing
-- ---------------------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_occasion_check;
alter table public.tasks add constraint tasks_occasion_check check (occasion is null or occasion in ('birthday', 'anniversary', 'marketing'));

-- the words of the template's own points (the tasks are written in Bulgarian)
create or replace function public.marketing_label(point jsonb)
returns text
language sql
immutable
as $$
  select coalesce(nullif(point->>'label', ''), case point->>'key'
    when 'photos' then 'Професионални снимки'
    when 'video' then 'Видео'
    when 'drone' then 'Видео с дрон'
    when 'tour3d' then '3D тур'
    when 'portals' then 'Обява в порталите'
    when 'social' then 'Социални мрежи'
    when 'ads' then 'Платена реклама'
    when 'sign' then 'Табела „Продава се“'
    when 'flyers' then 'Флаери'
    when 'open_house' then 'Отворени врати'
    when 'colleagues' then 'Споделяне с колеги'
    when 'farming' then 'Фарминг в квартала'
    when 'buyers' then 'Предложен на купувачи от базата'
    when 'owner_report' then 'Отчет към собственика'
    else point->>'key' end);
$$;

create or replace function public.create_marketing_tasks()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.sofia_today();
  week_start date := public.sofia_today() - (extract(isodow from public.sofia_today())::int - 1);
  b record;
  made int := 0;
begin
  for b in
    with plan as (
      select p.organization_id, p.responsible_broker_id as broker, p.id as property_id, p.title, x.point
      from public.properties p
      join public.organizations o on o.id = p.organization_id
      cross join lateral (
        select t.point from jsonb_array_elements(o.marketing_template) as t(point)
        union all
        select e.point from jsonb_array_elements(p.marketing_extra) as e(point)
      ) x
      where p.status in ('active', 'reserved')
        and p.responsible_broker_id is not null
        and coalesce((x.point->>'weekly')::boolean, false)
        and not ((x.point->>'key') = any (p.marketing_hidden))
        -- not done yet this week
        and not exists (
          select 1 from public.marketing_done d
          where d.property_id = p.id and d.key = x.point->>'key' and d.done_on >= week_start
        )
    )
    select organization_id, broker,
      count(distinct property_id) as listings,
      string_agg('• ' || title || ' — ' || public.marketing_label(point), E'\n' order by title) as lines
    from plan
    group by organization_id, broker
  loop
    if not exists (
      select 1 from public.tasks
      where assigned_to = b.broker and occasion = 'marketing' and due_date = today
    ) then
      insert into public.tasks (organization_id, assigned_to, title, description, type, due_date, occasion)
      values (
        b.organization_id, b.broker,
        'Седмичен маркетинг: ' || b.listings || case when b.listings = 1 then ' имот' else ' имота' end,
        left(b.lines, 2000), 'other', today, 'marketing'
      );
      made := made + 1;
    end if;
  end loop;
  return made;
end;
$$;

revoke execute on function public.create_marketing_tasks() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Mondays, 8:00 Sofia (summer time)
    perform cron.schedule('brixa-marketing-monday', '0 5 * * 1', 'select public.create_marketing_tasks()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- The owner's report: what we did, and the funnel
-- ---------------------------------------------------------------------
create or replace function public.owner_report_marketing(report_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select r.property_id, r.period_start, r.period_end
    from public.owner_reports r
    where r.token = report_token and r.revoked_at is null
  ),
  plan as (
    select x.point, x.n
    from r
    join public.properties p on p.id = r.property_id
    join public.organizations o on o.id = p.organization_id
    cross join lateral (
      select t.point, t.n from jsonb_array_elements(o.marketing_template) with ordinality as t(point, n)
      union all
      select e.point, 1000 + e.n from jsonb_array_elements(p.marketing_extra) with ordinality as e(point, n)
    ) x
    where not ((x.point->>'key') = any (p.marketing_hidden))
  )
  select jsonb_build_object(
    'plan', coalesce((
      select jsonb_agg(jsonb_build_object(
          'key', pl.point->>'key',
          'label', pl.point->>'label',
          'weekly', coalesce((pl.point->>'weekly')::boolean, false),
          'times', (select count(*) from public.marketing_done d, r
                    where d.property_id = r.property_id and d.key = pl.point->>'key'
                      and d.done_on between r.period_start and r.period_end),
          'last', (select max(d.done_on) from public.marketing_done d, r
                   where d.property_id = r.property_id and d.key = pl.point->>'key' and d.done_on <= r.period_end)
        ) order by pl.n)
      from plan pl), '[]'::jsonb),
    'funnel', (
      select jsonb_build_object(
        'colleagues_shared', count(*) filter (where s.partner_id is not null),
        'colleagues_opened', count(*) filter (where s.partner_id is not null and s.views > 0),
        'buyers_shared', count(*) filter (where s.client_id is not null),
        'buyers_opened', count(*) filter (where s.client_id is not null and s.views > 0),
        'colleague_calls', (select count(*) from public.activities a, r
                            where a.property_id = r.property_id and a.partner_id is not null
                              and (a.occurred_at at time zone 'Europe/Sofia')::date between r.period_start and r.period_end)
      )
      from r
      left join public.property_shares s
        on s.property_id = r.property_id
       and (s.created_at at time zone 'Europe/Sofia')::date between r.period_start and r.period_end
    )
  )
  from r;
$$;

grant execute on function public.owner_report_marketing(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Listings from the sleeve: not advertised, off the website (039)
-- ---------------------------------------------------------------------
alter table public.properties add column off_market boolean not null default false;
create index properties_off_market_idx on public.properties (organization_id, status) where off_market;

-- the website leaves them out (its list, a listing's page and photos, "call me back")
create or replace function public.photo_is_shared(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.property_shares sh
    where sh.revoked_at is null
      and sh.property_id::text = split_part(object_name, '/', 2)
      and sh.organization_id::text = split_part(object_name, '/', 1)
  ) or exists (
    select 1 from public.owner_reports r
    where r.revoked_at is null
      and r.property_id::text = split_part(object_name, '/', 2)
      and r.organization_id::text = split_part(object_name, '/', 1)
  ) or exists (
    select 1 from public.properties p
    join public.organizations o on o.id = p.organization_id
    where o.site_enabled
      and p.id::text = split_part(object_name, '/', 2)
      and o.id::text = split_part(object_name, '/', 1)
      and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
      and not p.off_market
  );
$$;

-- ---------------------------------------------------------------------
-- The website's data (anyone): the agency and its active listings
-- ---------------------------------------------------------------------
create or replace function public.site_public(site text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website,
      'address', o.address, 'logo_path', o.logo_path, 'headline', o.site_headline, 'about', o.site_about),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
          'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms,
          'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
          'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
          'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
          'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1))
        order by p.created_at desc)
      from public.properties p
      where p.organization_id = o.id and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
        and not p.off_market), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'phone', pr.phone, 'email', pr.email,
          'job_title', pr.job_title, 'avatar_path', pr.avatar_path) order by m.created_at)
      from public.organization_members m join public.profiles pr on pr.id = m.profile_id
      where m.organization_id = o.id), '[]'::jsonb)
  )
  from public.organizations o
  where o.site_slug = lower(site) and o.site_enabled;
$$;

-- One listing of the website: its details, its photos, its broker.
create or replace function public.site_listing(site text, target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
      'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms, 'bedrooms', p.bedrooms,
      'floor', p.floor, 'total_floors', p.total_floors, 'construction', p.construction_type, 'condition', p.condition,
      'furnishing', p.furnishing, 'heating', p.heating, 'exposures', p.exposures, 'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position) from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = p.responsible_broker_id
    ),
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
  )
  from public.properties p
  join public.organizations o on o.id = p.organization_id
  where o.site_slug = lower(site) and o.site_enabled and p.id = target_property
    and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
    and not p.off_market;
$$;

-- "Call me back": the visitor becomes a client — of the listing's broker, or (a general question)
-- a free contact for the agency (the only broker, when there's just one).
create or replace function public.site_inquiry(
  site text,
  target_property uuid,
  visitor_name text,
  visitor_phone text,
  visitor_email text,
  message text,
  agreed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.organizations;
  p public.properties;
  broker uuid;
  found uuid;
  found_broker uuid;
  clean_name text := nullif(btrim(visitor_name), '');
  clean_phone text := nullif(btrim(visitor_phone), '');
  clean_email text := nullif(lower(btrim(visitor_email)), '');
  clean_message text := left(nullif(btrim(message), ''), 1000);
begin
  select * into o from public.organizations where site_slug = lower(site) and site_enabled;
  if o.id is null then raise exception 'site_closed'; end if;
  if not coalesce(agreed, false) then raise exception 'consent_required'; end if;
  if clean_name is null or char_length(clean_name) not between 2 and 120 then raise exception 'name_required'; end if;
  if clean_phone is null and clean_email is null then raise exception 'contact_required'; end if;
  -- a little protection from floods
  if (select count(*) from public.clients c where c.organization_id = o.id and c.source = 'website'
      and c.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many';
  end if;

  if target_property is not null then
    select * into p from public.properties
    where id = target_property and organization_id = o.id and status in ('active', 'reserved') and operation_type in ('sale', 'rent')
      and not off_market;
  end if;
  -- the listing's broker; for a general question, the only broker when there's just one (else a free contact)
  broker := coalesce(
    p.responsible_broker_id,
    (select m.profile_id from public.organization_members m
     where m.organization_id = o.id and (select count(*) from public.organization_members x where x.organization_id = o.id) = 1
     limit 1)
  );

  if clean_phone is not null then
    select c.id, c.responsible_broker_id into found, found_broker from public.clients c
    where c.organization_id = o.id and c.phone_normalized = public.normalize_phone(clean_phone);
  end if;

  if found is null then
    insert into public.clients (organization_id, responsible_broker_id, created_by, full_name, phone, email, types, source, stage, notes)
    values (
      o.id, broker, broker, clean_name, left(clean_phone, 40), left(clean_email, 200),
      case when p.operation_type = 'rent' then array['tenant'] else array['buyer'] end,
      'website', 'new_contact',
      left(concat_ws(E'\n', 'От сайта' || coalesce(': ' || p.title, ''), clean_message), 5000)
    );
  else
    -- a client we know: tell their broker (or the listing's) what they asked
    perform public.notify(
      o.id, coalesce(found_broker, broker), null, 'site_inquiry',
      jsonb_build_object('actor', clean_name, 'title', coalesce(p.title, '')),
      '/clients/' || found
    )
    where coalesce(found_broker, broker) is not null;
    update public.clients
    set notes = left(concat_ws(E'\n', notes, 'От сайта (' || to_char(public.sofia_today(), 'DD.MM.YYYY') || ')'
      || coalesce(': ' || p.title, '') || coalesce(' — ' || clean_message, '')), 5000)
    where id = found;
  end if;
  return true;
end;
$$;


-- =====================================================================
-- Offices, teams and who leads whom (040)
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

-- ---------------------------------------------------------------------
-- What a listing would rent for, and its yield (041)
-- ---------------------------------------------------------------------
alter table public.properties
  add column expected_rent numeric(12, 2) check (expected_rent is null or (expected_rent > 0 and expected_rent < 1000000));

-- The monthly rent in euro a listing would bring, from the agency's own market (null: not enough to go on).
-- From the most exact place with at least 3 examples: the same type in the neighbourhood; the
-- neighbourhood's price typed in by hand; the same type in the town — and for homes also every home
-- in the neighbourhood, the town's price typed in by hand, every home in the town.
create or replace function public.rent_estimate(target_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p record;
  homes boolean;
  last_day date;
  best_rank int;
  best_sqm numeric;
  best_samples int;
begin
  select pr.organization_id, pr.settlement_id, pr.neighborhood_id, pr.subtype_id, pr.area, c.code as category
  into p
  from public.properties pr
  left join public.property_subtypes st on st.id = pr.subtype_id
  left join public.property_categories c on c.id = st.category_id
  where pr.id = target_property;
  if not found or p.area is null or p.area <= 0 or p.settlement_id is null then
    return null;
  end if;
  homes := p.category = 'residential';

  select max(day) into last_day from public.market_daily where organization_id = p.organization_id and operation = 'rent';

  select rank, per_sqm, samples into best_rank, best_sqm, best_samples
  from (
    select
      case
        when m.neighborhood_id is not null and m.subtype_id is not null then 1
        when m.subtype_id is not null then 3
        when m.neighborhood_id is not null then 4
        else 6
      end as rank,
      -- rented deals when there are a couple, else what the listings ask
      case when m.sold_count >= 2 then m.sold_avg else coalesce(m.listing_median, m.listing_avg) end as per_sqm,
      m.listings + m.sold_count as samples
    from public.market_daily m
    where m.organization_id = p.organization_id and m.operation = 'rent' and m.day = last_day
      and m.settlement_id = p.settlement_id
      and (m.neighborhood_id = p.neighborhood_id or m.neighborhood_id is null)
      and (m.subtype_id = p.subtype_id or (homes and m.subtype_id is null))
      and m.listings + m.sold_count >= 3
    union all
    select case when mp.neighborhood_id is null then 5 else 2 end, mp.price_per_sqm, null
    from public.market_prices mp
    where homes and mp.organization_id = p.organization_id and mp.operation = 'rent'
      and mp.settlement_id = p.settlement_id
      and (mp.neighborhood_id = p.neighborhood_id or mp.neighborhood_id is null)
  ) found_prices
  where per_sqm > 0
  order by rank
  limit 1;

  if best_sqm is null then
    return null;
  end if;

  return jsonb_build_object(
    'per_sqm', round(best_sqm, 2),
    -- to the nearest 10 €
    'rent', greatest(10, round(best_sqm * p.area / 10) * 10),
    'basis', case best_rank
      when 1 then 'hood_type' when 2 then 'manual_hood' when 3 then 'town_type'
      when 4 then 'hood' when 5 then 'manual_town' else 'town' end,
    'samples', best_samples
  );
end;
$$;

revoke execute on function public.rent_estimate(uuid) from public, anon, authenticated;

-- For the agency's own people: the estimate for one of its listings.
create or replace function public.property_rent_estimate(target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.rent_estimate(p.id)
  from public.properties p
  where p.id = target_property and public.is_org_member(p.organization_id);
$$;

revoke execute on function public.property_rent_estimate(uuid) from public, anon;
grant execute on function public.property_rent_estimate(uuid) to authenticated;

-- The link sent to a client and the agency's website: the rent and its estimate too
create or replace function public.shared_property(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'operation', p.operation_type,
      'status', p.status,
      'price', p.current_price,
      'currency', p.currency,
      'area', p.area,
      'rooms', p.rooms,
      'bedrooms', p.bedrooms,
      'floor', p.floor,
      'total_floors', p.total_floors,
      'construction', p.construction_type,
      'condition', p.condition,
      'furnishing', p.furnishing,
      'heating', p.heating,
      'exposures', p.exposures,
      'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((
        select jsonb_agg(ph.storage_path order by ph.position)
        from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb),
      -- for a listing for sale: the rent the broker expects, or BRIXA's estimate from the agency's market
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = coalesce(sh.created_by, p.responsible_broker_id)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  )
  from public.property_shares sh
  join public.properties p on p.id = sh.property_id
  where sh.token = share_token and sh.revoked_at is null;
$$;

create or replace function public.site_listing(site text, target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
      'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms, 'bedrooms', p.bedrooms,
      'floor', p.floor, 'total_floors', p.total_floors, 'construction', p.construction_type, 'condition', p.condition,
      'furnishing', p.furnishing, 'heating', p.heating, 'exposures', p.exposures, 'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position) from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb),
      -- for a listing for sale: the rent the broker expects, or BRIXA's estimate from the agency's market
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = p.responsible_broker_id
    ),
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
  )
  from public.properties p
  join public.organizations o on o.id = p.organization_id
  where o.site_slug = lower(site) and o.site_enabled and p.id = target_property
    and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
    and not p.off_market;
$$;

-- ---------------------------------------------------------------------
-- How a listing stands on the market: the stars and the analysis (042)
-- ---------------------------------------------------------------------
create table public.property_comparables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  url text check (url is null or (url ~* '^https?://' and char_length(url) <= 500)),
  -- the portal, from the link (imot.bg, homes.bg…)
  source text check (source is null or char_length(source) <= 60),
  title text check (title is null or char_length(title) <= 160),
  price numeric(12, 2) not null check (price > 0 and price < 100000000),
  currency text not null default 'EUR' check (currency in ('EUR', 'BGN')),
  area numeric(10, 2) not null check (area > 0 and area < 100000),
  floor int check (floor is null or floor between -5 and 200),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index property_comparables_property_idx on public.property_comparables (property_id, created_at);

alter table public.property_comparables enable row level security;

-- the agency reads them; whoever may change the listing adds and removes them
create policy "comparables: read" on public.property_comparables
  for select to authenticated using (public.is_org_member(organization_id));
create policy "comparables: add" on public.property_comparables
  for insert to authenticated
  with check (
    public.can_edit_property(property_id)
    and exists (select 1 from public.properties p where p.id = property_comparables.property_id and p.organization_id = property_comparables.organization_id)
  );
create policy "comparables: change" on public.property_comparables
  for update to authenticated
  using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
create policy "comparables: remove" on public.property_comparables
  for delete to authenticated using (public.can_edit_property(property_id));

-- How a listing's price stands: the market facts plus the stars (null: no market to compare with).
create or replace function public.price_rating(target_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.properties;
  facts jsonb;
  own numeric;
  added int;
  pool int;
  pool_median numeric;
  bench numeric;
  basis text;
  diff numeric;
  stars int;
begin
  select * into p from public.properties where id = target_property;
  if p.id is null or p.operation_type not in ('sale', 'rent') then
    return null;
  end if;
  facts := public.market_facts(p.id);
  if facts is null then
    return null;
  end if;
  own := (facts ->> 'own_sqm')::numeric;

  -- the comparables: the ones the broker added and the agency's own similar listings nearby
  select count(*) into added from public.property_comparables c where c.property_id = p.id;
  select count(*), percentile_cont(0.5) within group (order by sqm)
    into pool, pool_median
  from (
    select public.to_eur(c.price, c.currency) / c.area as sqm
    from public.property_comparables c
    where c.property_id = p.id
    union all
    select x.price_eur / x.area
    from public.market_pool(p.id) x
    where (facts ->> 'scope' = 'city' or x.same_neighborhood)
      and x.status in ('active', 'reserved') and x.price_eur > 0
  ) found_comparables
  where sqm > 0;

  if added > 0 and pool >= 3 then
    bench := round(pool_median, 2);
    basis := 'comparables';
  else
    bench := (facts -> 'benchmark' ->> 'sqm')::numeric;
    basis := facts -> 'benchmark' ->> 'basis';
  end if;

  if bench > 0 and own > 0 then
    diff := own / bench - 1;
    stars := case
      when diff <= -0.10 then 5
      when diff <= -0.03 then 4
      when diff < 0.03 then 3
      when diff < 0.10 then 2
      else 1
    end;
  end if;

  return facts || jsonb_build_object(
    'rating', case when stars is not null then jsonb_build_object(
      'stars', stars,
      'diff', round(diff, 4),
      'bench_sqm', bench,
      'basis', basis,
      'added', added,
      'pool', pool,
      'estimate', case when p.area > 0 then jsonb_build_object(
        'low', round(bench * p.area * 0.95, -2),
        'mid', round(bench * p.area, -2),
        'high', round(bench * p.area * 1.05, -2)) end
    ) end
  );
end;
$$;

revoke execute on function public.price_rating(uuid) from public, anon, authenticated;

-- For the client's eyes: the stars only when they're 4 or 5.
create or replace function public.public_rating(target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when (r -> 'rating' ->> 'stars')::int >= 4
    then jsonb_build_object('stars', (r -> 'rating' ->> 'stars')::int) end
  from (select public.price_rating(target_property) as r) x;
$$;

revoke execute on function public.public_rating(uuid) from public, anon, authenticated;

-- The stars of several listings at once (the cards in Properties).
create or replace function public.listing_ratings(ids uuid[])
returns table (property_id uuid, stars int)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, (public.price_rating(p.id) -> 'rating' ->> 'stars')::int
  from public.properties p
  where p.id = any (ids[1:300])
    and p.operation_type in ('sale', 'rent')
    and public.is_org_member(p.organization_id);
$$;

revoke execute on function public.listing_ratings(uuid[]) from public, anon;
grant execute on function public.listing_ratings(uuid[]) to authenticated;

-- The analysis of one listing for the agency's people: the rating, the comparables and the sales around.
create or replace function public.property_analysis(target_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.properties;
  r jsonb;
begin
  select * into p from public.properties where id = target_property;
  if p.id is null or not public.is_org_member(p.organization_id) then
    return null;
  end if;
  r := public.price_rating(p.id);
  if r is null then
    return null;
  end if;

  return r || jsonb_build_object(
    -- what the broker found on the portals
    'added', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'url', c.url, 'source', c.source, 'title', c.title, 'area', c.area, 'floor', c.floor,
        'price_eur', round(public.to_eur(c.price, c.currency), 2),
        'sqm', round(public.to_eur(c.price, c.currency) / c.area, 2)) order by c.created_at)
      from public.property_comparables c where c.property_id = p.id), '[]'::jsonb),
    -- the agency's own similar listings nearby, the closest in size first
    'listings', coalesce((
      select jsonb_agg(row_to_json(l)::jsonb)
      from (
        select c.title, n.name as neighborhood, x.area, c.floor, round(x.price_eur, 2) as price_eur,
          round(x.price_eur / x.area, 2) as sqm, x.status
        from public.market_pool(p.id) x
        join public.properties c on c.id = x.property_id
        left join public.geo_neighborhoods n on n.id = c.neighborhood_id
        where (r ->> 'scope' = 'city' or x.same_neighborhood)
          and x.status in ('active', 'reserved') and x.price_eur > 0
        order by abs(x.area - coalesce(p.area, x.area))
        limit 10
      ) l), '[]'::jsonb),
    -- sold in the last year (the agency's deals and the register)
    'sales', coalesce((
      select jsonb_agg(row_to_json(s)::jsonb)
      from (
        select x.area, round(x.sold_eur, 2) as price_eur, round(x.sold_eur / x.area, 2) as sqm, x.sold_on, x.same_neighborhood
        from public.market_sold(p.id) x
        where x.sold_on >= public.sofia_today() - 365
          and (r -> 'sold' ->> 'scope' = 'city' or x.same_neighborhood)
        order by x.sold_on desc
        limit 10
      ) s), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.property_analysis(uuid) from public, anon;
grant execute on function public.property_analysis(uuid) to authenticated;

-- The link sent to a client and the agency's website: the stars when they're good
create or replace function public.shared_property(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'operation', p.operation_type,
      'status', p.status,
      'price', p.current_price,
      'currency', p.currency,
      'area', p.area,
      'rooms', p.rooms,
      'bedrooms', p.bedrooms,
      'floor', p.floor,
      'total_floors', p.total_floors,
      'construction', p.construction_type,
      'condition', p.condition,
      'furnishing', p.furnishing,
      'heating', p.heating,
      'exposures', p.exposures,
      'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((
        select jsonb_agg(ph.storage_path order by ph.position)
        from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb),
      -- for a listing for sale: the rent the broker expects, or BRIXA's estimate from the agency's market
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end,
      -- the stars against the market, only when the price is good
      'rating', public.public_rating(p.id)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = coalesce(sh.created_by, p.responsible_broker_id)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  )
  from public.property_shares sh
  join public.properties p on p.id = sh.property_id
  where sh.token = share_token and sh.revoked_at is null;
$$;

create or replace function public.site_listing(site text, target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
      'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms, 'bedrooms', p.bedrooms,
      'floor', p.floor, 'total_floors', p.total_floors, 'construction', p.construction_type, 'condition', p.condition,
      'furnishing', p.furnishing, 'heating', p.heating, 'exposures', p.exposures, 'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position) from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb),
      -- for a listing for sale: the rent the broker expects, or BRIXA's estimate from the agency's market
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end,
      -- the stars against the market, only when the price is good
      'rating', public.public_rating(p.id)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = p.responsible_broker_id
    ),
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
  )
  from public.properties p
  join public.organizations o on o.id = p.organization_id
  where o.site_slug = lower(site) and o.site_enabled and p.id = target_property
    and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
    and not p.off_market;
$$;

-- ---------------------------------------------------------------------
-- Neighbourhoods added from a pasted price table (043)
-- ---------------------------------------------------------------------
create or replace function public.add_neighborhoods(target_settlement uuid, names text[])
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  raw text;
  clean text;
begin
  if not exists (
    select 1 from public.organization_members m
    where m.profile_id = auth.uid() and m.role in ('owner', 'office_manager')
  ) then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.geo_settlements s where s.id = target_settlement) then
    raise exception 'unknown_settlement';
  end if;

  foreach raw in array coalesce(names[1:80], '{}') loop
    clean := regexp_replace(btrim(coalesce(raw, '')), '\s+', ' ', 'g');
    continue when char_length(clean) not between 2 and 80
      or clean ~* '^(с\.|село |гр\.|град )'
      or clean !~ '[A-Za-zА-Яа-яЁё]';
    if not exists (
      select 1 from public.geo_neighborhoods n
      where n.settlement_id = target_settlement and lower(n.name) = lower(clean)
    ) then
      insert into public.geo_neighborhoods (settlement_id, name) values (target_settlement, clean);
    end if;
    return query
      select n.id, n.name from public.geo_neighborhoods n
      where n.settlement_id = target_settlement and lower(n.name) = lower(clean)
      limit 1;
  end loop;
end;
$$;

revoke execute on function public.add_neighborhoods(uuid, text[]) from public, anon;
grant execute on function public.add_neighborhoods(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- The stars kept on the listing (044)
-- ---------------------------------------------------------------------
alter table public.properties add column market_stars smallint check (market_stars between 1 and 5);

-- the stars changing is not the listing being changed: "updated" stays as it was
create or replace function public.touch_property_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'market_stars' - 'updated_at') is distinct from (to_jsonb(old) - 'market_stars' - 'updated_at') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists properties_touch_updated_at on public.properties;
create trigger properties_touch_updated_at
  before update on public.properties
  for each row execute function public.touch_property_updated_at();

-- One listing's stars again (none when it isn't on the market).
create or replace function public.refresh_listing_stars(target_property uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stars smallint;
begin
  if exists (
    select 1 from public.properties p
    where p.id = target_property and p.operation_type in ('sale', 'rent') and p.status in ('active', 'reserved')
  ) then
    stars := (public.price_rating(target_property) -> 'rating' ->> 'stars')::smallint;
  end if;
  update public.properties set market_stars = stars
  where id = target_property and market_stars is distinct from stars;
end;
$$;

-- Every listing of an agency (after its prices in Market change, and at night).
create or replace function public.refresh_org_stars(target_org uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  n int := 0;
begin
  for p in
    select id from public.properties
    where organization_id = target_org and (market_stars is not null or (operation_type in ('sale', 'rent') and status in ('active', 'reserved')))
  loop
    perform public.refresh_listing_stars(p.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.refresh_all_stars()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  n int := 0;
begin
  for o in select id from public.organizations loop
    n := n + public.refresh_org_stars(o.id);
  end loop;
  return n;
end;
$$;

revoke execute on function public.refresh_listing_stars(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_org_stars(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_all_stars() from public, anon, authenticated;

-- when what the stars rest on changes
create or replace function public.stars_on_property_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_listing_stars(new.id);
  return null;
end;
$$;

create trigger properties_stars_on_insert
  after insert on public.properties
  for each row execute function public.stars_on_property_change();
create trigger properties_stars_on_change
  after update of current_price, currency, area, status, operation_type, subtype_id, settlement_id, neighborhood_id on public.properties
  for each row execute function public.stars_on_property_change();

create or replace function public.stars_on_comparable_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_listing_stars(coalesce(new.property_id, old.property_id));
  return null;
end;
$$;

create trigger property_comparables_stars
  after insert or update or delete on public.property_comparables
  for each row execute function public.stars_on_comparable_change();

-- the cards: the kept stars (no working out)
create or replace function public.listing_ratings(ids uuid[])
returns table (property_id uuid, stars int)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.market_stars::int
  from public.properties p
  where p.id = any (ids[1:300])
    and public.is_org_member(p.organization_id);
$$;

-- saving the prices in Market: the stars follow
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
  -- the agency's listings get their stars against the new prices
  perform public.refresh_org_stars(target_org);
  return saved;
end;
$$;

-- every night after the market's numbers (Sofia 6:45)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-stars', '45 3 * * *', 'select public.refresh_all_stars()');
  end if;
end;
$$;

-- the first time, now
select public.refresh_all_stars();

-- ---------------------------------------------------------------------
-- Bringing clients and listings in from a table (045)
-- ---------------------------------------------------------------------
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
  -- an import tells each broker once, at the end — not client by client
  if current_setting('brixa.importing', true) = 'on' then
    return new;
  end if;
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

-- Whose a row is: the one asked for, when the one importing may give them work; else the one importing.
create or replace function public.import_broker(target_org uuid, wanted uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when wanted is not null
      and exists (select 1 from public.organization_members m where m.organization_id = target_org and m.profile_id = wanted)
      and (wanted = auth.uid() or public.oversees_as(auth.uid(), wanted))
    then wanted
    else auth.uid()
  end;
$$;

-- The next contact for an imported client: by its class (A 2 days, B 7, C 30 — the agency's own).
create or replace function public.import_follow_up(target_org uuid, client_class text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now() + make_interval(days => case client_class
    when 'A' then o.follow_up_days_a when 'B' then o.follow_up_days_b else o.follow_up_days_c end)
  from public.organizations o where o.id = target_org;
$$;

-- Each broker who got something: one notification.
create or replace function public.import_tell(target_org uuid, counts jsonb, what text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  broker text;
begin
  for broker in select jsonb_object_keys(coalesce(counts, '{}'::jsonb)) loop
    continue when broker::uuid = auth.uid();
    perform public.notify(
      target_org, broker::uuid, auth.uid(), 'imported',
      jsonb_build_object('count', (counts ->> broker)::int, 'what', what),
      case when what = 'properties' then '/properties?view=mine' else '/clients' end
    );
  end loop;
end;
$$;

-- Clients: rows of {line, full_name, phone, email, types[], client_class, notes, broker_id}.
create or replace function public.import_clients(target_org uuid, rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  new_id uuid;
  broker uuid;
  name text;
  kinds text[];
  cls text;
  imported int := 0;
  skipped jsonb := '[]'::jsonb;
  errors jsonb := '[]'::jsonb;
  per_broker jsonb := '{}'::jsonb;
begin
  if not public.is_org_member(target_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('brixa.importing', 'on', true);

  for r in select value from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) limit 500 loop
    name := left(btrim(coalesce(r ->> 'full_name', '')), 120);
    kinds := array(
      select distinct k from jsonb_array_elements_text(coalesce(r -> 'types', '[]'::jsonb)) k
      where k in ('buyer', 'seller', 'tenant', 'landlord', 'investor')
    );
    cls := case when r ->> 'client_class' in ('A', 'B', 'C') then r ->> 'client_class' else 'C' end;
    if char_length(name) < 2 then
      errors := errors || jsonb_build_object('line', r -> 'line', 'reason', 'name');
      continue;
    end if;
    if cardinality(kinds) = 0 then
      errors := errors || jsonb_build_object('line', r -> 'line', 'reason', 'type');
      continue;
    end if;
    broker := public.import_broker(target_org, nullif(r ->> 'broker_id', '')::uuid);
    begin
      insert into public.clients (organization_id, responsible_broker_id, created_by, full_name, phone, email, types, client_class, stage, notes)
      values (
        target_org, broker, auth.uid(), name,
        left(nullif(btrim(coalesce(r ->> 'phone', '')), ''), 40),
        left(nullif(btrim(coalesce(r ->> 'email', '')), ''), 200),
        kinds, cls, 'called',
        left(nullif(btrim(coalesce(r ->> 'notes', '')), ''), 5000)
      )
      returning id into new_id;
      update public.clients set follow_up_at = public.import_follow_up(target_org, cls) where id = new_id;
      imported := imported + 1;
      per_broker := jsonb_set(per_broker, array[broker::text], to_jsonb(coalesce((per_broker ->> broker::text)::int, 0) + 1));
    exception
      when unique_violation then
        skipped := skipped || jsonb_build_object('line', r -> 'line', 'name', name, 'phone', r ->> 'phone');
      when others then
        errors := errors || jsonb_build_object('line', r -> 'line', 'reason', sqlerrm);
    end;
  end loop;

  perform public.import_tell(target_org, per_broker, 'clients');
  return jsonb_build_object('imported', imported, 'skipped', skipped, 'errors', errors);
end;
$$;

-- Listings: rows of {line, subtype_code, operation, title, price, currency, area, rooms, floor, total_floors,
-- town, neighborhood, address, description, exclusive, owner_name, owner_phone, broker_id}.
create or replace function public.import_properties(target_org uuid, rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  broker uuid;
  sub record;
  op text;
  town_id uuid;
  town_region uuid;
  town_label text;
  hood_id uuid;
  hood_label text;
  town_name text;
  hood_name text;
  owner_id uuid;
  owner_phone text;
  new_title text;
  num numeric;
  imported int := 0;
  errors jsonb := '[]'::jsonb;
  per_broker jsonb := '{}'::jsonb;
begin
  if not public.is_org_member(target_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('brixa.importing', 'on', true);

  for r in select value from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) limit 500 loop
    select st.id, st.category_id, st.name into sub from public.property_subtypes st where st.code = r ->> 'subtype_code';
    if sub.id is null then
      errors := errors || jsonb_build_object('line', r -> 'line', 'reason', 'type');
      continue;
    end if;
    op := case when r ->> 'operation' = 'rent' then 'rent' else 'sale' end;
    broker := public.import_broker(target_org, nullif(r ->> 'broker_id', '')::uuid);

    -- the town and the neighbourhood, by name
    town_id := null;
    town_region := null;
    town_label := null;
    hood_id := null;
    hood_label := null;
    town_name := btrim(regexp_replace(coalesce(r ->> 'town', ''), '^\s*(гр\.|град|с\.|село)\s*', '', 'i'));
    if town_name <> '' then
      select s.id, s.region_id, s.name into town_id, town_region, town_label from public.geo_settlements s
      where lower(s.name) = lower(town_name)
      order by (s.settlement_type = 'гр.') desc
      limit 1;
    end if;
    hood_name := btrim(regexp_replace(coalesce(r ->> 'neighborhood', ''), '^\s*(кв\.|ж\.\s?к\.|жк|м-т)\s*', '', 'i'));
    if town_id is not null and hood_name <> '' then
      select n.id, n.name into hood_id, hood_label from public.geo_neighborhoods n
      where n.settlement_id = town_id
        and (lower(n.name) = lower(hood_name) or lower(regexp_replace(n.name, '^(кв\.|ж\.к\.|м-т|к\.к\.)\s*', '', 'i')) = lower(hood_name))
      limit 1;
      if hood_id is null then
        select n.id, n.name into hood_id, hood_label from public.geo_neighborhoods n
        where n.settlement_id = town_id and lower(n.name) like '%' || lower(hood_name) || '%'
        order by char_length(n.name)
        limit 1;
      end if;
    end if;

    begin
      -- the owner: found by phone, else a new seller (landlord) client
      owner_id := null;
      owner_phone := nullif(btrim(coalesce(r ->> 'owner_phone', '')), '');
      if owner_phone is not null then
        select c.id into owner_id from public.clients c
        where c.organization_id = target_org and c.phone_normalized = public.normalize_phone(owner_phone);
      end if;
      if owner_id is null and (owner_phone is not null or char_length(btrim(coalesce(r ->> 'owner_name', ''))) >= 2) then
        insert into public.clients (organization_id, responsible_broker_id, created_by, full_name, phone, types, stage)
        values (
          target_org, broker, auth.uid(),
          left(coalesce(nullif(btrim(r ->> 'owner_name'), ''), 'Собственик ' || owner_phone), 120),
          left(owner_phone, 40),
          array[case when op = 'rent' then 'landlord' else 'seller' end], 'called'
        )
        returning id into owner_id;
        update public.clients set follow_up_at = public.import_follow_up(target_org, 'C') where id = owner_id;
      end if;

      new_title := left(coalesce(
        nullif(btrim(r ->> 'title'), ''),
        sub.name || coalesce(', ' || coalesce(hood_label, town_label), '')
      ), 200);
      num := nullif(r ->> 'price', '')::numeric;

      insert into public.properties (
        organization_id, category_id, subtype_id, operation_type, status, title,
        region_id, settlement_id, neighborhood_id, address,
        area, rooms, floor, total_floors,
        asking_price, current_price, currency, exclusive_contract, description,
        owner_client_id, responsible_broker_id, created_by
      )
      values (
        target_org, sub.category_id, sub.id, op, 'active', new_title,
        town_region, town_id, hood_id,
        left(nullif(btrim(concat_ws(', ',
          nullif(btrim(r ->> 'address'), ''),
          case when hood_id is null and hood_name <> '' then hood_name end,
          case when town_id is null and town_name <> '' then town_name end
        )), ''), 300),
        nullif(r ->> 'area', '')::numeric, nullif(r ->> 'rooms', '')::int,
        nullif(r ->> 'floor', '')::int, nullif(r ->> 'total_floors', '')::int,
        num, num,
        case when r ->> 'currency' in ('EUR', 'BGN', 'USD') then r ->> 'currency' else 'EUR' end,
        coalesce((r ->> 'exclusive')::boolean, false),
        left(nullif(btrim(coalesce(r ->> 'description', '')), ''), 10000),
        owner_id, broker, auth.uid()
      );
      imported := imported + 1;
      per_broker := jsonb_set(per_broker, array[broker::text], to_jsonb(coalesce((per_broker ->> broker::text)::int, 0) + 1));
    exception
      when others then
        errors := errors || jsonb_build_object('line', r -> 'line', 'reason', sqlerrm);
    end;
  end loop;

  perform public.import_tell(target_org, per_broker, 'properties');
  return jsonb_build_object('imported', imported, 'skipped', '[]'::jsonb, 'errors', errors);
end;
$$;

revoke execute on function public.import_broker(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.import_follow_up(uuid, text) from public, anon, authenticated;
revoke execute on function public.import_tell(uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.import_clients(uuid, jsonb) from public, anon;
revoke execute on function public.import_properties(uuid, jsonb) from public, anon;
grant execute on function public.import_clients(uuid, jsonb) to authenticated;
grant execute on function public.import_properties(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Tools for leading a team (046)
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- The numbers of each person between two days (Sofia time)
-- ---------------------------------------------------------------------
create or replace function public.people_numbers(target_org uuid, from_day date, to_day date)
returns table (
  profile_id uuid,
  calls int,
  meetings int,
  viewings int,
  new_clients int,
  listings int,
  deals int,
  commission numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select from_day::timestamp at time zone 'Europe/Sofia' as f, to_day::timestamp at time zone 'Europe/Sofia' as t
  ),
  acts as (
    select a.profile_id as pid,
      (count(*) filter (where a.type = 'call'))::int as c,
      (count(*) filter (where a.type = 'meeting'))::int as m,
      (count(*) filter (where a.type = 'viewing'))::int as v
    from public.activities a, b
    where a.organization_id = target_org and a.occurred_at >= b.f and a.occurred_at < b.t
    group by a.profile_id
  ),
  signed as (
    select c.responsible_broker_id as pid, count(*)::int as n
    from public.clients c, b
    where c.organization_id = target_org and c.created_at >= b.f and c.created_at < b.t
    group by c.responsible_broker_id
  ),
  listed as (
    select p.responsible_broker_id as pid, count(*)::int as n
    from public.properties p, b
    where p.organization_id = target_org and p.operation_type in ('sale', 'rent') and p.created_at >= b.f and p.created_at < b.t
    group by p.responsible_broker_id
  ),
  won as (
    select d.broker_id as pid, count(*)::int as n, sum(d.net_commission) as total
    from public.deals d
    where d.organization_id = target_org and d.status = 'won' and d.confirmed_at is not null
      and d.closed_on >= from_day and d.closed_on < to_day
    group by d.broker_id
  )
  select m.profile_id,
    coalesce(acts.c, 0), coalesce(acts.m, 0), coalesce(acts.v, 0),
    coalesce(signed.n, 0), coalesce(listed.n, 0), coalesce(won.n, 0), coalesce(won.total, 0)
  from public.organization_members m
  left join acts on acts.pid = m.profile_id
  left join signed on signed.pid = m.profile_id
  left join listed on listed.pid = m.profile_id
  left join won on won.pid = m.profile_id
  where m.organization_id = target_org;
$$;

revoke execute on function public.people_numbers(uuid, date, date) from public, anon, authenticated;

-- The week (from its Monday) of the people the viewer leads — and the viewer — against the week before.
create or replace function public.team_week(target_org uuid, week_start date)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  avatar_path text,
  role text,
  office_id uuid,
  team_id uuid,
  calls int, meetings int, viewings int, new_clients int, listings int, deals int, commission numeric,
  prev_calls int, prev_meetings int, prev_viewings int, prev_new_clients int, prev_listings int, prev_deals int, prev_commission numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select date_trunc('week', coalesce(week_start, public.sofia_today())::timestamp)::date as d)
  select m.profile_id, pr.full_name, pr.email, pr.avatar_path, m.role,
    coalesce((select tm.office_id from public.teams tm where tm.id = m.team_id), m.office_id), m.team_id,
    cur.calls, cur.meetings, cur.viewings, cur.new_clients, cur.listings, cur.deals, cur.commission,
    prev.calls, prev.meetings, prev.viewings, prev.new_clients, prev.listings, prev.deals, prev.commission
  from w,
    public.organization_members m
    join public.profiles pr on pr.id = m.profile_id
    join public.people_numbers(target_org, (select d from w), (select d + 7 from w)) cur on cur.profile_id = m.profile_id
    join public.people_numbers(target_org, (select d - 7 from w), (select d from w)) prev on prev.profile_id = m.profile_id
  where m.organization_id = target_org
    and public.is_org_member(target_org)
    and (m.profile_id = auth.uid() or public.oversees_as(auth.uid(), m.profile_id))
  order by cur.commission desc, cur.deals desc, (cur.calls + cur.meetings + cur.viewings) desc, pr.full_name;
$$;

revoke execute on function public.team_week(uuid, date) from public, anon;
grant execute on function public.team_week(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- Commission goals of the agency, an office, a team — by month
-- ---------------------------------------------------------------------
create table public.group_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scope text not null check (scope in ('agency', 'office', 'team')),
  scope_id uuid,
  month date not null check (extract(day from month) = 1),
  target numeric(14, 2) not null check (target > 0 and target < 1000000000),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint group_goals_one unique nulls not distinct (organization_id, scope, scope_id, month),
  constraint group_goals_scope check ((scope = 'agency') = (scope_id is null))
);

alter table public.group_goals enable row level security;

-- who may set a goal: the owner any; an office manager their office and its teams; a team manager their team
create or replace function public.can_set_group_goal(target_org uuid, goal_scope text, goal_scope_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members me
    where me.organization_id = target_org and me.profile_id = auth.uid()
      and (
        me.role = 'owner'
        or (me.role = 'office_manager' and me.office_id is not null and (
          (goal_scope = 'office' and goal_scope_id = me.office_id)
          or (goal_scope = 'team' and exists (
            select 1 from public.teams tm where tm.id = goal_scope_id and tm.organization_id = target_org and tm.office_id = me.office_id))
        ))
        or (me.role = 'manager' and goal_scope = 'team' and exists (
          select 1 from public.teams tm where tm.id = goal_scope_id and tm.organization_id = target_org and tm.manager_id = auth.uid()))
      )
  );
$$;

create policy "group goals: read" on public.group_goals
  for select to authenticated using (public.is_org_member(organization_id));
create policy "group goals: set" on public.group_goals
  for insert to authenticated with check (public.can_set_group_goal(organization_id, scope, scope_id));
create policy "group goals: change" on public.group_goals
  for update to authenticated
  using (public.can_set_group_goal(organization_id, scope, scope_id))
  with check (public.can_set_group_goal(organization_id, scope, scope_id));
create policy "group goals: remove" on public.group_goals
  for delete to authenticated using (public.can_set_group_goal(organization_id, scope, scope_id));

-- A month's goals and what has been reached (the confirmed deals of the people in each).
create or replace function public.group_goal_progress(target_org uuid, goal_month date)
returns table (scope text, scope_id uuid, name text, target numeric, reached numeric, people int)
language sql
stable
security definer
set search_path = public
as $$
  with mo as (select date_trunc('month', coalesce(goal_month, public.sofia_today())::timestamp)::date as d),
  people as (
    select m.profile_id, m.team_id, coalesce((select tm.office_id from public.teams tm where tm.id = m.team_id), m.office_id) as office_id
    from public.organization_members m where m.organization_id = target_org
  ),
  won as (
    select d.broker_id, sum(d.net_commission) as total
    from public.deals d, mo
    where d.organization_id = target_org and d.status = 'won' and d.confirmed_at is not null
      and d.closed_on >= mo.d and d.closed_on < (mo.d + interval '1 month')::date
    group by d.broker_id
  )
  select g.scope, g.scope_id,
    case g.scope
      when 'agency' then (select o.name from public.organizations o where o.id = target_org)
      when 'office' then (select f.name from public.offices f where f.id = g.scope_id)
      else (select tm.name from public.teams tm where tm.id = g.scope_id)
    end,
    g.target,
    coalesce((
      select sum(won.total) from people p join won on won.broker_id = p.profile_id
      where g.scope = 'agency' or (g.scope = 'office' and p.office_id = g.scope_id) or (g.scope = 'team' and p.team_id = g.scope_id)
    ), 0),
    (select count(*)::int from people p
      where g.scope = 'agency' or (g.scope = 'office' and p.office_id = g.scope_id) or (g.scope = 'team' and p.team_id = g.scope_id))
  from public.group_goals g, mo
  where g.organization_id = target_org and g.month = mo.d and public.is_org_member(target_org)
  order by case g.scope when 'agency' then 0 when 'office' then 1 else 2 end, 3;
$$;

revoke execute on function public.group_goal_progress(uuid, date) from public, anon;
grant execute on function public.group_goal_progress(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- Handing a broker's work to a colleague
-- ---------------------------------------------------------------------
create or replace function public.hand_over_work(target_org uuid, from_profile uuid, to_profile uuid, what text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  claim_sub text;
  claims text;
  c record;
  n_clients int := 0;
  n_properties int := 0;
  n_deals int := 0;
  n_tasks int := 0;
begin
  if from_profile is null or to_profile is null or from_profile = to_profile
     or not exists (select 1 from public.organization_members m where m.organization_id = target_org and m.profile_id = from_profile)
     or not exists (select 1 from public.organization_members m where m.organization_id = target_org and m.profile_id = to_profile) then
    raise exception 'invalid';
  end if;
  -- the one handing over leads the broker; the work goes to themself or to someone they lead
  if not (public.oversees_as(me, from_profile) and (to_profile = me or public.oversees_as(me, to_profile))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- one notice at the end, not one per client
  perform set_config('brixa.importing', 'on', true);

  if 'clients' = any (what) then
    for c in select id, follow_up_at, client_class from public.clients
             where organization_id = target_org and responsible_broker_id = from_profile loop
      update public.clients set responsible_broker_id = to_profile where id = c.id;
      -- the next contact stays as it was (or follows the class) — not "within 24 hours" for every one
      update public.clients
      set follow_up_at = case when c.follow_up_at > now() then c.follow_up_at else public.import_follow_up(target_org, c.client_class) end
      where id = c.id;
      n_clients := n_clients + 1;
    end loop;
  end if;

  if 'properties' = any (what) then
    update public.properties set responsible_broker_id = to_profile
    where organization_id = target_org and responsible_broker_id = from_profile and status in ('active', 'reserved', 'withdrawn');
    get diagnostics n_properties = row_count;
  end if;

  if 'deals' = any (what) then
    -- the authority was checked above; the deal guard sees no caller for this move
    claim_sub := current_setting('request.jwt.claim.sub', true);
    claims := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    update public.deals set broker_id = to_profile
    where organization_id = target_org and broker_id = from_profile and status = 'open';
    get diagnostics n_deals = row_count;
    perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  end if;

  if 'tasks' = any (what) then
    update public.tasks set assigned_to = to_profile
    where organization_id = target_org and assigned_to = from_profile and status = 'open';
    get diagnostics n_tasks = row_count;
  end if;

  if n_clients + n_properties + n_deals + n_tasks > 0 and to_profile <> me then
    perform public.notify(
      target_org, to_profile, me, 'work_handed',
      jsonb_build_object('title', public.person_name(from_profile), 'clients', n_clients, 'properties', n_properties, 'deals', n_deals, 'tasks', n_tasks),
      '/'
    );
  end if;
  return jsonb_build_object('clients', n_clients, 'properties', n_properties, 'deals', n_deals, 'tasks', n_tasks);
end;
$$;

revoke execute on function public.hand_over_work(uuid, uuid, uuid, text[]) from public, anon;
grant execute on function public.hand_over_work(uuid, uuid, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Monday morning: the leaders hear the last week's report is ready
-- ---------------------------------------------------------------------
create or replace function public.notify_team_week()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  leader record;
  last_monday date := date_trunc('week', public.sofia_today()::timestamp)::date - 7;
  n int := 0;
begin
  for leader in
    select m.organization_id, m.profile_id from public.organization_members m
    where m.role in ('owner', 'office_manager', 'manager')
      and exists (
        select 1 from public.organization_members o
        where o.organization_id = m.organization_id and o.profile_id <> m.profile_id and public.oversees_as(m.profile_id, o.profile_id)
      )
  loop
    perform public.notify(
      leader.organization_id, leader.profile_id, null, 'team_week',
      jsonb_build_object('title', to_char(last_monday, 'DD.MM')),
      '/team/report?week=' || last_monday
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.notify_team_week() from public, anon, authenticated;

-- Mondays 9:00 (Sofia, summer time)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-team-week', '0 6 * * 1', 'select public.notify_team_week()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- The neighbourhoods of more towns (047)
-- ---------------------------------------------------------------------
insert into public.geo_neighborhoods (settlement_id, name)
select s.id, v.name
from (values
  ('RSE','Русе','Център'),('RSE','Русе','Широк център'),('RSE','Русе','Възраждане'),('RSE','Русе','Здравец'),
  ('RSE','Русе','Здравец Изток'),('RSE','Русе','Здравец Север'),('RSE','Русе','Дружба 1'),('RSE','Русе','Дружба 2'),
  ('RSE','Русе','Дружба 3'),('RSE','Русе','Чародейка Юг'),('RSE','Русе','Чародейка Север'),('RSE','Русе','Родина 1'),
  ('RSE','Русе','Родина 2'),('RSE','Русе','Родина 3'),('RSE','Русе','Родина 4'),('RSE','Русе','Ялта'),
  ('RSE','Русе','Хъшове'),('RSE','Русе','Изток'),('RSE','Русе','Мидия Енос'),('RSE','Русе','Тракцията'),
  ('RSE','Русе','Сарая'),('RSE','Русе','Средна кула'),('RSE','Русе','Долапите'),('RSE','Русе','Цветница'),
  ('RSE','Русе','Ален мак'),('RSE','Русе','Дълъг път'),

  ('SZR','Стара Загора','Център'),('SZR','Стара Загора','Казански'),('SZR','Стара Загора','Три чучура Север'),
  ('SZR','Стара Загора','Три чучура Център'),('SZR','Стара Загора','Три чучура Юг'),('SZR','Стара Загора','Железник Център'),
  ('SZR','Стара Загора','Железник Изток'),('SZR','Стара Загора','Самара 1'),('SZR','Стара Загора','Самара 2'),
  ('SZR','Стара Загора','Самара 3'),('SZR','Стара Загора','Аязмото'),('SZR','Стара Загора','Опълченски'),
  ('SZR','Стара Загора','Зора'),('SZR','Стара Загора','Студентски'),('SZR','Стара Загора','Кольо Ганчев'),
  ('SZR','Стара Загора','Митрополит Методий Кусев'),('SZR','Стара Загора','Македонски'),('SZR','Стара Загора','Дъбрава'),
  ('SZR','Стара Загора','Лозенец'),('SZR','Стара Загора','Била'),('SZR','Стара Загора','Голеш'),
  ('SZR','Стара Загора','Градински'),('SZR','Стара Загора','Индустриален'),

  ('PVN','Плевен','Център'),('PVN','Плевен','Широк център'),('PVN','Плевен','Идеален център'),('PVN','Плевен','Сторгозия'),
  ('PVN','Плевен','Дружба 1'),('PVN','Плевен','Дружба 2'),('PVN','Плевен','Дружба 3'),('PVN','Плевен','Мара Денчева'),
  ('PVN','Плевен','Кайлъка'),('PVN','Плевен','Девети квартал'),('PVN','Плевен','Пети квартал'),('PVN','Плевен','Чаира'),

  ('VTR','Велико Търново','Център'),('VTR','Велико Търново','Акация'),('VTR','Велико Търново','Бузлуджа'),
  ('VTR','Велико Търново','Картала'),('VTR','Велико Търново','Колю Фичето'),('VTR','Велико Търново','Асенов'),
  ('VTR','Велико Търново','Варуша'),('VTR','Велико Търново','Зона Б'),('VTR','Велико Търново','Света Гора'),
  ('VTR','Велико Търново','Чолаковци'),('VTR','Велико Търново','Стария град'),

  ('SHU','Шумен','Център'),('SHU','Шумен','Тракия'),('SHU','Шумен','Добруджански'),('SHU','Шумен','Боян Българанов 1'),
  ('SHU','Шумен','Боян Българанов 2'),('SHU','Шумен','Херсон'),('SHU','Шумен','Пазара'),('SHU','Шумен','Дивдядово'),
  ('SHU','Шумен','Еверест'),('SHU','Шумен','Гривица'),

  ('DOB','Добрич','Център'),('DOB','Добрич','Дружба 1'),('DOB','Добрич','Дружба 2'),('DOB','Добрич','Дружба 3'),
  ('DOB','Добрич','Дружба 4'),('DOB','Добрич','Балик'),('DOB','Добрич','Изгрев'),('DOB','Добрич','Добротица'),
  ('DOB','Добрич','Строител'),('DOB','Добрич','Македонски'),('DOB','Добрич','Русия 1'),('DOB','Добрич','Русия 2'),
  ('DOB','Добрич','Христо Ботев'),('DOB','Добрич','Иглика'),('DOB','Добрич','Хаджи Димитър'),('DOB','Добрич','Запад'),

  ('BLG','Благоевград','Център'),('BLG','Благоевград','Широк център'),('BLG','Благоевград','Еленово 1'),
  ('BLG','Благоевград','Еленово 2'),('BLG','Благоевград','Струмско'),('BLG','Благоевград','Освобождение'),
  ('BLG','Благоевград','Грамада'),('BLG','Благоевград','Вароша'),('BLG','Благоевград','Ален мак'),
  ('BLG','Благоевград','Запад'),('BLG','Благоевград','Баларбаши'),('BLG','Благоевград','Дъбрава'),

  ('SOF','София','Люлин 1'),('SOF','София','Люлин 2'),('SOF','София','Люлин 3'),('SOF','София','Люлин 4'),
  ('SOF','София','Люлин 5'),('SOF','София','Люлин 6'),('SOF','София','Люлин 7'),('SOF','София','Люлин 8'),
  ('SOF','София','Люлин 9'),('SOF','София','Люлин 10'),('SOF','София','Надежда 1'),('SOF','София','Надежда 2'),
  ('SOF','София','Надежда 3'),('SOF','София','Надежда 4'),('SOF','София','Овча купел 1'),('SOF','София','Овча купел 2'),
  ('SOF','София','Красна поляна 1'),('SOF','София','Красна поляна 2'),('SOF','София','Красна поляна 3')
) as v(region_code, city, name)
join public.geo_regions r on r.code = v.region_code
join public.geo_settlements s on s.region_id = r.id and s.name = v.city and s.settlement_type = 'гр.'
where not exists (
    select 1 from public.geo_neighborhoods n where n.settlement_id = s.id and lower(n.name) = lower(v.name)
  );

-- ---------------------------------------------------------------------
-- The market analysis sent to a client as a link (048)
-- ---------------------------------------------------------------------
create table public.analysis_shares (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  audience text not null check (audience in ('owner', 'buyer')),
  client_id uuid references public.clients (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  views int not null default 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  last_notified_on date,
  revoked_at timestamptz
);
create index analysis_shares_property_idx on public.analysis_shares (property_id, created_at desc);

alter table public.analysis_shares enable row level security;

-- the agency sees them; a buyer's link anyone in the agency may send, the owner's one who may change the listing
create policy "analysis shares: read" on public.analysis_shares
  for select to authenticated using (public.is_org_member(organization_id));
create policy "analysis shares: send" on public.analysis_shares
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.properties p where p.id = analysis_shares.property_id and p.organization_id = analysis_shares.organization_id)
    and public.is_org_member(organization_id)
    and (audience = 'buyer' or public.can_edit_property(property_id))
    and (client_id is null or exists (select 1 from public.clients c where c.id = analysis_shares.client_id and c.organization_id = analysis_shares.organization_id))
  );
create policy "analysis shares: stop" on public.analysis_shares
  for update to authenticated
  using (created_by = auth.uid() or public.can_edit_property(property_id))
  with check (created_by = auth.uid() or public.can_edit_property(property_id));

-- The analysis of a listing: the rating, the comparables and the sales around
-- (for a client's eyes: without the agency's off-market listings).
create or replace function public.analysis_of(target_property uuid, for_client boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.properties;
  r jsonb;
begin
  select * into p from public.properties where id = target_property;
  r := public.price_rating(p.id);
  if r is null then
    return null;
  end if;

  return r || jsonb_build_object(
    'added', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'url', c.url, 'source', c.source, 'title', c.title, 'area', c.area, 'floor', c.floor,
        'price_eur', round(public.to_eur(c.price, c.currency), 2),
        'sqm', round(public.to_eur(c.price, c.currency) / c.area, 2)) order by c.created_at)
      from public.property_comparables c where c.property_id = p.id), '[]'::jsonb),
    'listings', coalesce((
      select jsonb_agg(row_to_json(l)::jsonb)
      from (
        select c.title, n.name as neighborhood, x.area, c.floor, round(x.price_eur, 2) as price_eur,
          round(x.price_eur / x.area, 2) as sqm, x.status
        from public.market_pool(p.id) x
        join public.properties c on c.id = x.property_id
        left join public.geo_neighborhoods n on n.id = c.neighborhood_id
        where (r ->> 'scope' = 'city' or x.same_neighborhood)
          and x.status in ('active', 'reserved') and x.price_eur > 0
          and not (for_client and c.off_market)
        order by abs(x.area - coalesce(p.area, x.area))
        limit 10
      ) l), '[]'::jsonb),
    'sales', coalesce((
      select jsonb_agg(row_to_json(s)::jsonb)
      from (
        select x.area, round(x.sold_eur, 2) as price_eur, round(x.sold_eur / x.area, 2) as sqm, x.sold_on, x.same_neighborhood
        from public.market_sold(p.id) x
        where x.sold_on >= public.sofia_today() - 365
          and (r -> 'sold' ->> 'scope' = 'city' or x.same_neighborhood)
        order by x.sold_on desc
        limit 10
      ) s), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.analysis_of(uuid, boolean) from public, anon, authenticated;

-- the agency's own people (as before, now through analysis_of)
create or replace function public.property_analysis(target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.analysis_of(p.id)
  from public.properties p
  where p.id = target_property and public.is_org_member(p.organization_id);
$$;

-- What a link shows: the listing, the analysis, the broker and the agency
-- (a buyer's link only while the price is a good one — 4 or 5 stars).
create or replace function public.shared_analysis(share_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sh public.analysis_shares;
  p public.properties;
  a jsonb;
begin
  select * into sh from public.analysis_shares where token = share_token and revoked_at is null;
  if sh.id is null then
    return null;
  end if;
  select * into p from public.properties where id = sh.property_id;
  a := public.analysis_of(p.id, true);
  if a is null or a -> 'rating' is null or jsonb_typeof(a -> 'rating') = 'null' then
    return jsonb_build_object('unavailable', true);
  end if;
  if sh.audience = 'buyer' and (a -> 'rating' ->> 'stars')::int < 4 then
    return jsonb_build_object('unavailable', true);
  end if;

  return jsonb_build_object(
    'audience', sh.audience,
    'analysis', a,
    'property', jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'operation', p.operation_type,
      'price', p.current_price,
      'currency', p.currency,
      'area', p.area,
      'rooms', p.rooms,
      'floor', p.floor,
      'total_floors', p.total_floors,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = coalesce(sh.created_by, p.responsible_broker_id)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  );
end;
$$;

revoke execute on function public.shared_analysis(uuid) from public;
grant execute on function public.shared_analysis(uuid) to anon, authenticated;

-- The link was opened: counted; the one who sent it hears — the first time, and on a later day again (once a day).
create or replace function public.record_analysis_view(share_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sh public.analysis_shares;
  previous timestamptz;
  today date := public.sofia_today();
begin
  select * into sh from public.analysis_shares where token = share_token and revoked_at is null;
  if sh.id is null then
    return;
  end if;
  previous := sh.last_viewed_at;
  update public.analysis_shares
  set views = views + 1,
      first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now()
  where id = sh.id;

  if sh.created_by is not null
     and (previous is null or (previous at time zone 'Europe/Sofia')::date < today)
     and sh.last_notified_on is distinct from today then
    perform public.notify(
      sh.organization_id, sh.created_by, null, 'analysis_viewed',
      jsonb_build_object(
        'title', (select title from public.properties where id = sh.property_id),
        'actor', (select full_name from public.clients where id = sh.client_id),
        'again', previous is not null
      ),
      '/properties/' || sh.property_id || '#analysis'
    );
    update public.analysis_shares set last_notified_on = today where id = sh.id;
  end if;
end;
$$;

revoke execute on function public.record_analysis_view(uuid) from public;
grant execute on function public.record_analysis_view(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- The stars on the website's listing cards (049)
-- ---------------------------------------------------------------------
create or replace function public.site_public(site text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website,
      'address', o.address, 'logo_path', o.logo_path, 'headline', o.site_headline, 'about', o.site_about),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
          'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms,
          'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
          'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
          'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
          'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
          -- for the visitor's eyes: the stars only when they're 4 or 5
          'stars', case when p.market_stars >= 4 then p.market_stars end)
        order by p.created_at desc)
      from public.properties p
      where p.organization_id = o.id and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
        and not p.off_market), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'phone', pr.phone, 'email', pr.email,
          'job_title', pr.job_title, 'avatar_path', pr.avatar_path) order by m.created_at)
      from public.organization_members m join public.profiles pr on pr.id = m.profile_id
      where m.organization_id = o.id), '[]'::jsonb)
  )
  from public.organizations o
  where o.site_slug = lower(site) and o.site_enabled;
$$;

-- =====================================================================
-- BRIXA for other agencies: packages, the trial, BRIXA's panel (050)
-- =====================================================================
-- ---------------------------------------------------------------------
-- Who runs BRIXA itself: sees every agency in the panel
-- ---------------------------------------------------------------------
create table public.platform_admins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
-- (no policies: read only through is_platform_admin())

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where profile_id = auth.uid());
$$;

revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- the first agency's owner runs BRIXA
insert into public.platform_admins (profile_id)
select m.profile_id
from public.organization_members m
where m.role = 'owner'
order by m.created_at
limit 1
on conflict do nothing;

-- ---------------------------------------------------------------------
-- BRIXA's own details (on the landing page, the terms and the "time to pay" page)
-- ---------------------------------------------------------------------
create table public.platform_settings (
  id boolean primary key default true check (id),
  company_name text check (company_name is null or char_length(company_name) <= 200),
  eik text check (eik is null or eik ~ '^[0-9]{9}([0-9]{4})?$'),
  address text check (address is null or char_length(address) <= 300),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  website text check (website is null or char_length(website) <= 200),
  -- how long a new agency tries BRIXA for free
  trial_days int not null default 30 check (trial_days between 0 and 365),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (true) on conflict do nothing;

alter table public.platform_settings enable row level security;

create policy "platform settings: anyone reads" on public.platform_settings
  for select to anon, authenticated using (true);

create policy "platform settings: BRIXA updates" on public.platform_settings
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select on public.platform_settings to anon;

-- ---------------------------------------------------------------------
-- The packages: up to how many people, for how much a month
-- ---------------------------------------------------------------------
create table public.plans (
  code text primary key check (code ~ '^[a-z0-9_]{2,20}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- null: no limit
  max_people int check (max_people is null or max_people between 1 and 10000),
  price_month numeric(10, 2) not null check (price_month >= 0 and price_month < 100000),
  position int not null default 0,
  active boolean not null default true
);

insert into public.plans (code, name, max_people, price_month, position) values
  ('solo', 'Соло', 1, 19, 1),
  ('start', 'Старт', 5, 59, 2),
  ('team', 'Екип', 15, 129, 3),
  ('agency', 'Агенция', null, 249, 4)
on conflict do nothing;

alter table public.plans enable row level security;

create policy "plans: anyone reads" on public.plans
  for select to anon, authenticated using (true);

create policy "plans: BRIXA adds" on public.plans
  for insert to authenticated with check (public.is_platform_admin());

create policy "plans: BRIXA changes" on public.plans
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select on public.plans to anon;

-- ---------------------------------------------------------------------
-- An agency's subscription
-- ---------------------------------------------------------------------
alter table public.organizations
  add column trial_ends_at timestamptz,
  add column plan_code text references public.plans (code) on update cascade,
  -- paid up to and including this day (set by BRIXA by hand for now)
  add column paid_until date,
  -- free for good (Явлена; a partner)
  add column comped boolean not null default false,
  add column terms_accepted_at timestamptz;

-- a new agency tries BRIXA for the days BRIXA gives
create or replace function public.start_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.trial_ends_at is null then
    new.trial_ends_at := now() + make_interval(days => coalesce((select trial_days from public.platform_settings), 30));
  end if;
  return new;
end;
$$;

revoke execute on function public.start_trial() from public, anon, authenticated;

create trigger organizations_start_trial
  before insert on public.organizations
  for each row execute function public.start_trial();

-- only BRIXA changes what an agency pays (the agency's owner may change the rest of the row)
create or replace function public.guard_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.trial_ends_at, new.plan_code, new.paid_until, new.comped, new.terms_accepted_at)
     is distinct from (old.trial_ends_at, old.plan_code, old.paid_until, old.comped, old.terms_accepted_at)
     and auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_subscription() from public, anon, authenticated;

create trigger organizations_guard_subscription
  before update on public.organizations
  for each row execute function public.guard_subscription();

-- the agencies already here: 30 days from today; the first one (Явлена) is free for good
update public.organizations set trial_ends_at = now() + interval '30 days' where trial_ends_at is null;
update public.organizations set comped = true
where id = (select organization_id from public.organization_members order by created_at limit 1);

-- a package's limit: no inviting more people than it has room for (the trial has no limit)
create or replace function public.check_plan_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room int;
  taken int;
begin
  select p.max_people into room
  from public.organizations o join public.plans p on p.code = o.plan_code
  where o.id = new.organization_id and not o.comped;
  if room is null then return new; end if;
  select (select count(*) from public.organization_members where organization_id = new.organization_id)
       + (select count(*) from public.organization_invitations where organization_id = new.organization_id and accepted_at is null)
  into taken;
  if taken >= room then
    raise exception 'plan_limit' using errcode = 'P0001', hint = room::text;
  end if;
  return new;
end;
$$;

revoke execute on function public.check_plan_room() from public, anon, authenticated;

create trigger organization_invitations_plan_room
  before insert on public.organization_invitations
  for each row execute function public.check_plan_room();

-- ---------------------------------------------------------------------
-- Sign-up: the agency's yes to the terms; the very first person to sign up runs BRIXA
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

  insert into public.organizations (name, kind, eik, legal_name, city, address, phone, email, website, terms_accepted_at)
  values (
    agency_name, account,
    case when clean_eik ~ '^[0-9]{9}([0-9]{4})?$' then clean_eik end,
    left(nullif(btrim(coalesce(meta ->> 'legal_name', '')), ''), 200),
    left(nullif(btrim(coalesce(meta ->> 'city', '')), ''), 80),
    left(nullif(btrim(coalesce(meta ->> 'address', '')), ''), 300),
    left(nullif(btrim(coalesce(meta ->> 'agency_phone', '')), ''), 40),
    left(new.email, 200),
    left(nullif(btrim(coalesce(meta ->> 'website', '')), ''), 200),
    case when meta ->> 'accepted_terms' = 'yes' then now() end
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

  -- a brand-new BRIXA: whoever signs up first runs it (and their agency is free)
  if not exists (select 1 from public.platform_admins) then
    insert into public.platform_admins (profile_id) values (new.id);
    update public.organizations set comped = true where id = new_org_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- BRIXA's panel: every agency, how it uses BRIXA, and what it pays
-- ---------------------------------------------------------------------
create or replace function public.platform_agencies()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'kind', o.kind, 'city', o.city, 'eik', o.eik,
        'phone', o.phone, 'email', o.email, 'created_at', o.created_at,
        'trial_ends_at', o.trial_ends_at, 'plan_code', o.plan_code, 'paid_until', o.paid_until,
        'comped', o.comped, 'terms_accepted_at', o.terms_accepted_at,
        'owner', (
          select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone)
          from public.organization_members m join public.profiles pr on pr.id = m.profile_id
          where m.organization_id = o.id and m.role = 'owner'
          order by m.created_at limit 1),
        'people', (select count(*) from public.organization_members m where m.organization_id = o.id),
        'invited', (select count(*) from public.organization_invitations i where i.organization_id = o.id and i.accepted_at is null),
        'listings', (select count(*) from public.properties p where p.organization_id = o.id),
        'clients', (select count(*) from public.clients c where c.organization_id = o.id),
        'deals', (select count(*) from public.deals d where d.organization_id = o.id),
        'last_sign_in', (
          select max(u.last_sign_in_at)
          from public.organization_members m join auth.users u on u.id = m.profile_id
          where m.organization_id = o.id),
        'last_activity', greatest(
          (select max(a.created_at) from public.activities a where a.organization_id = o.id),
          (select max(p.created_at) from public.properties p where p.organization_id = o.id),
          (select max(c.created_at) from public.clients c where c.organization_id = o.id))
      ) order by o.created_at desc)
    from public.organizations o
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.platform_agencies() from public, anon;
grant execute on function public.platform_agencies() to authenticated;

-- BRIXA sets an agency's package, the day it has paid until, free for good, or a longer trial.
create or replace function public.platform_set_agency(
  target_org uuid,
  new_plan text,
  new_paid_until date,
  new_comped boolean,
  new_trial_ends date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.organizations
  set plan_code = nullif(new_plan, ''),
      paid_until = new_paid_until,
      comped = coalesce(new_comped, false),
      -- the trial ends at the end of that day (Sofia)
      trial_ends_at = case when new_trial_ends is null then trial_ends_at
        else ((new_trial_ends + 1)::timestamp at time zone 'Europe/Sofia') end
  where id = target_org;
end;
$$;

revoke execute on function public.platform_set_agency(uuid, text, date, boolean, date) from public, anon;
grant execute on function public.platform_set_agency(uuid, text, date, boolean, date) to authenticated;

-- ---------------------------------------------------------------------
-- BRIXA hears: a new agency signed up; an agency wants a package
-- ---------------------------------------------------------------------
create or replace function public.tell_platform(kind text, payload jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  select public.notify(
    (select m.organization_id from public.organization_members m where m.profile_id = a.profile_id order by m.created_at limit 1),
    a.profile_id, null, kind, payload, '/admin')
  from public.platform_admins a
  where exists (select 1 from public.organization_members m where m.profile_id = a.profile_id);
$$;

revoke execute on function public.tell_platform(text, jsonb) from public, anon, authenticated;

create or replace function public.platform_on_new_agency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- the owner of a new agency (not someone joining by invitation, not BRIXA's own first agency)
  if new.role = 'owner'
     and not exists (select 1 from public.platform_admins where profile_id = new.profile_id)
     and not exists (select 1 from public.organization_members m where m.organization_id = new.organization_id and m.profile_id <> new.profile_id) then
    perform public.tell_platform('agency_signed_up', jsonb_build_object(
      'title', (select name from public.organizations where id = new.organization_id),
      'kind', (select kind from public.organizations where id = new.organization_id),
      'actor', public.person_name(new.profile_id)));
  end if;
  return new;
end;
$$;

revoke execute on function public.platform_on_new_agency() from public, anon, authenticated;

create trigger organization_members_tell_platform
  after insert on public.organization_members
  for each row execute function public.platform_on_new_agency();

-- The agency's owner asks for a package: BRIXA hears and gets in touch.
create or replace function public.request_plan(wanted text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
  plan record;
begin
  select m.organization_id into target_org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at limit 1;
  if target_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into plan from public.plans where code = wanted and active;
  if plan.code is null then
    raise exception 'no_plan';
  end if;
  perform public.tell_platform('plan_requested', jsonb_build_object(
    'title', (select name from public.organizations where id = target_org),
    'plan', plan.name,
    'actor', public.person_name(auth.uid()),
    'phone', (select coalesce(pr.phone, o.phone) from public.profiles pr, public.organizations o where pr.id = auth.uid() and o.id = target_org)));
end;
$$;

revoke execute on function public.request_plan(text) from public, anon;
grant execute on function public.request_plan(text) to authenticated;

-- =====================================================================
-- Sample data to look around with (051)
-- =====================================================================
alter table public.properties add column sample boolean not null default false;
alter table public.clients add column sample boolean not null default false;
alter table public.deals add column sample boolean not null default false;
alter table public.tasks add column sample boolean not null default false;
alter table public.activities add column sample boolean not null default false;
-- the day the samples came in (null: none)
alter table public.organizations add column sample_since date;

-- ---------------------------------------------------------------------
-- In: six listings, eight clients (with what they look for), three deals, four tasks, three calls
-- ---------------------------------------------------------------------
create or replace function public.load_sample_data()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  org uuid;
  town uuid;
  hoods uuid[];
  hood_names text[];
  res uuid;
  sub_studio uuid;
  sub_two uuid;
  sub_three uuid;
  sub_house uuid;
  sub_maisonette uuid;
  today date := public.sofia_today();
  p uuid[] := '{}';
  c uuid[] := '{}';
  new_id uuid;
  made int := 0;
  item record;
begin
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = me and m.role = 'owner'
  order by m.created_at limit 1;
  if org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if (select sample_since from public.organizations where id = org) is not null then
    raise exception 'already_loaded';
  end if;

  -- made-up people: no "new client" notices
  perform set_config('brixa.importing', 'on', true);

  -- the agency's town (else Sofia) and a few of its neighbourhoods
  select s.id into town
  from public.geo_settlements s, public.organizations o
  where o.id = org and s.settlement_type = 'гр.' and lower(s.name) = lower(btrim(coalesce(o.city, '')))
  limit 1;
  if town is null then
    select id into town from public.geo_settlements where settlement_type = 'гр.' and name = 'София' limit 1;
  end if;
  select coalesce(array_agg(id order by name), '{}'), coalesce(array_agg(name order by name), '{}')
  into hoods, hood_names
  from (select id, name from public.geo_neighborhoods where settlement_id = town order by name limit 5) h;

  select id into res from public.property_categories where code = 'residential';
  select id into sub_studio from public.property_subtypes where code = 'studio';
  select id into sub_two from public.property_subtypes where code = 'two_room';
  select id into sub_three from public.property_subtypes where code = 'three_room';
  select id into sub_house from public.property_subtypes where code = 'house';
  select id into sub_maisonette from public.property_subtypes where code = 'maisonette';

  -- the clients first (the owners of the listings among them)
  for item in
    select * from (values
      (1, 'Мария Иванова (пример)', array['buyer'], 'A', 'viewing', 'Търси двустаен или тристаен, иска да се нанесе до лятото.'),
      (2, 'Георги Петров (пример)', array['buyer'], 'B', 'called', 'Семейство с две деца, търсят тристаен близо до училище.'),
      (3, 'Елена Димитрова (пример)', array['tenant'], 'A', 'presentation', 'Търси жилище под наем, работи наблизо.'),
      (4, 'Николай Стоянов (пример)', array['investor'], 'B', 'new_contact', 'Инвеститор — търси малко жилище за отдаване под наем.'),
      (5, 'Иван Колев (пример)', array['seller'], 'A', 'presentation', 'Продава двустаен апартамент, иска бърза продажба.'),
      (6, 'Десислава Тодорова (пример)', array['landlord'], 'B', 'presentation', 'Отдава два апартамента под наем.'),
      (7, 'Петър Василев (пример)', array['seller'], 'B', 'negotiation', 'Продава къща, мисли за цената.'),
      (8, 'Анна Георгиева (пример)', array['buyer'], 'C', 'new_contact', 'Запитване от сайта, още не е ясно какво търси.')
    ) as v(n, full_name, types, klass, stage, notes)
    order by n
  loop
    insert into public.clients (organization_id, responsible_broker_id, created_by, full_name, types, client_class, stage, notes, source, assigned_at, sample)
    values (org, me, me, item.full_name, item.types, item.klass, item.stage, item.notes,
      case when item.n = 8 then 'agency' else 'personal' end, now(), true)
    returning id into new_id;
    c := c || new_id;
    made := made + 1;
  end loop;

  -- the listings
  for item in
    select * from (values
      (1, sub_two, 'sale', 'двустаен', 72, 2, 1, 3, 6, 'brick', 'renovated', 'furnished', 'air_conditioning', 145000, true, 5, hoods[1], hood_names[1],
        'Светъл двустаен апартамент след ремонт, с обзавеждане и голяма тераса. Тих квартал, близо до парк и спирка.'),
      (2, sub_three, 'sale', 'тристаен', 98, 3, 2, 5, 8, 'epk', 'good', 'partly', 'central', 189000, false, null, coalesce(hoods[2], hoods[1]), coalesce(hood_names[2], hood_names[1]),
        'Просторен тристаен апартамент с две спални, южно изложение и асансьор. Подходящ за семейство.'),
      (3, sub_studio, 'rent', 'едностаен', 42, 1, 1, 2, 5, 'brick', 'renovated', 'furnished', 'air_conditioning', 450, false, 6, coalesce(hoods[3], hoods[1]), coalesce(hood_names[3], hood_names[1]),
        'Уютен едностаен апартамент под наем, напълно обзаведен, свободен веднага.'),
      (4, sub_house, 'sale', 'къща', 160, 4, 3, null, 2, 'brick', 'good', 'unfurnished', 'heat_pump', 265000, true, 7, coalesce(hoods[4], hoods[1]), coalesce(hood_names[4], hood_names[1]),
        'Двуетажна къща с двор от 400 м², гараж и термопомпа. Спокойно място, лесен достъп до центъра.'),
      (5, sub_two, 'rent', 'двустаен', 65, 2, 1, 4, 7, 'panel', 'renovated', 'furnished', 'central', 650, false, 6, hoods[1], hood_names[1],
        'Двустаен апартамент под наем след ремонт, с нова кухня и пералня.'),
      (6, sub_maisonette, 'sale', 'мезонет', 130, 4, 2, 6, 7, 'monolithic', 'new', 'unfurnished', 'gas', 239000, false, null, coalesce(hoods[5], hoods[2], hoods[1]), coalesce(hood_names[5], hood_names[2], hood_names[1]),
        'Мезонет в нова сграда с Акт 16, два етажа и панорамна гледка. Възможност за паркомясто.')
    ) as v(n, subtype, op, word, area, rooms, bedrooms, floor, floors, construction, condition, furnishing, heating, price, exclusive, owner_n, hood, hood_name, description)
    order by n
  loop
    insert into public.properties (
      organization_id, category_id, subtype_id, operation_type, status, title, settlement_id, neighborhood_id,
      area, rooms, bedrooms, floor, total_floors, construction_type, condition, furnishing, heating,
      asking_price, current_price, currency, exclusive_contract, description,
      responsible_broker_id, created_by, owner_client_id, sample)
    values (
      org, res, item.subtype, item.op, 'active',
      'Пример: ' || item.word || coalesce(', ' || item.hood_name, ''),
      town, item.hood,
      item.area, item.rooms, item.bedrooms, item.floor, item.floors, item.construction, item.condition, item.furnishing, item.heating,
      item.price, item.price, 'EUR', item.exclusive, item.description,
      me, me, case when item.owner_n is not null then c[item.owner_n] end, true)
    returning id into new_id;
    p := p || new_id;
    made := made + 1;
  end loop;

  -- what the buyers look for
  insert into public.client_searches (client_id, operation, subtype_ids, settlement_ids, neighborhood_ids, budget_min, budget_max, rooms_min, rooms_max)
  values
    (c[1], 'sale', array[sub_two, sub_three], array[town], hoods[1:2], 120000, 160000, 2, 3),
    (c[2], 'sale', array[sub_three], array[town], '{}', 170000, 200000, 3, 4),
    (c[3], 'rent', array[sub_studio, sub_two], array[town], '{}', null, 700, 1, 2),
    (c[4], 'sale', array[sub_studio, sub_two], array[town], '{}', null, 120000, 1, 2),
    (c[8], 'sale', array[sub_two], array[town], '{}', null, 150000, null, null);

  -- the deals on the way
  insert into public.deals (organization_id, broker_id, created_by, property_id, client_id, kind, stage, status, price, currency, commission, viewing_on, offer_on, deposit_on, sample)
  values
    (org, me, me, p[1], c[1], 'sale', 'offer', 'open', 140000, 'EUR', 4200, today - 3, today - 1, null, true),
    (org, me, me, p[2], c[2], 'sale', 'deposit', 'open', 185000, 'EUR', 5550, today - 9, today - 5, today - 2, true),
    (org, me, me, p[5], c[3], 'rent', 'viewing', 'open', 650, 'EUR', 650, today + 1, null, null, true);
  made := made + 3;

  -- the day's work
  insert into public.tasks (organization_id, assigned_to, created_by, title, type, client_id, property_id, due_date, due_time, sample)
  values
    (org, me, me, 'Обади се на Георги Петров (пример) — има нов тристаен', 'call', c[2], p[2], today, '10:00', true),
    (org, me, me, 'Оглед с Мария Иванова (пример)', 'viewing', c[1], p[1], today, '17:30', true),
    (org, me, me, 'Договор за посредничество с Иван Колев (пример)', 'meeting', c[5], p[1], today, '12:00', true),
    (org, me, me, 'Изпрати оферти на Елена Димитрова (пример)', 'message', c[3], null, today + 1, null, true);
  made := made + 4;

  -- yesterday's calls and the viewing
  insert into public.activities (organization_id, profile_id, type, client_id, property_id, note, outcome, occurred_at, sample)
  values
    (org, me, 'call', c[1], null, 'Харесва квартала, иска оглед още тази седмица.', 'positive', now() - interval '1 day', true),
    (org, me, 'viewing', c[1], p[1], 'Огледът мина добре — мисли за цената.', 'positive', now() - interval '1 day' + interval '3 hours', true),
    (org, me, 'call', c[4], null, 'Иска да види доходността на малките жилища.', 'neutral', now() - interval '1 day' + interval '5 hours', true);
  made := made + 3;

  update public.organizations set sample_since = today where id = org;
  return made;
end;
$$;

revoke execute on function public.load_sample_data() from public, anon;
grant execute on function public.load_sample_data() to authenticated;

-- ---------------------------------------------------------------------
-- Out: every sample, the work BRIXA made around them, and the market's days while they were in
-- ---------------------------------------------------------------------
create or replace function public.remove_sample_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  since date;
begin
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at limit 1;
  if org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select sample_since into since from public.organizations where id = org;

  perform set_config('brixa.importing', 'on', true);
  -- the tasks and calls about a sample (BRIXA's own too, like a listing's marketing)
  delete from public.tasks t
  where t.organization_id = org
    and (t.sample
      or t.property_id in (select id from public.properties where organization_id = org and sample)
      or t.client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.activities a
  where a.organization_id = org
    and (a.sample
      or a.property_id in (select id from public.properties where organization_id = org and sample)
      or a.client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.deals
  where organization_id = org
    and (sample
      or property_id in (select id from public.properties where organization_id = org and sample)
      or client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.notifications n
  where n.organization_id = org
    and (n.link ~ any (array(select '/(properties|clients)/' || id::text from public.properties where organization_id = org and sample
                             union all select '/(properties|clients)/' || id::text from public.clients where organization_id = org and sample)));
  delete from public.properties where organization_id = org and sample;
  delete from public.clients where organization_id = org and sample;

  -- the market's days counted with the samples in
  if since is not null then
    delete from public.market_daily where organization_id = org and day >= since;
  end if;
  update public.organizations set sample_since = null where id = org;
  -- the real listings' stars without the samples around them
  perform public.refresh_org_stars(org);
end;
$$;

revoke execute on function public.remove_sample_data() from public, anon;
grant execute on function public.remove_sample_data() to authenticated;

-- ---------------------------------------------------------------------
-- The samples never reach the agency's website
-- ---------------------------------------------------------------------
create or replace function public.site_public(site text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website,
      'address', o.address, 'logo_path', o.logo_path, 'headline', o.site_headline, 'about', o.site_about),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
          'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms,
          'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
          'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
          'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
          'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
          -- for the visitor's eyes: the stars only when they're 4 or 5
          'stars', case when p.market_stars >= 4 then p.market_stars end)
        order by p.created_at desc)
      from public.properties p
      where p.organization_id = o.id and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
        and not p.off_market and not p.sample), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'phone', pr.phone, 'email', pr.email,
          'job_title', pr.job_title, 'avatar_path', pr.avatar_path) order by m.created_at)
      from public.organization_members m join public.profiles pr on pr.id = m.profile_id
      where m.organization_id = o.id), '[]'::jsonb)
  )
  from public.organizations o
  where o.site_slug = lower(site) and o.site_enabled;
$$;

create or replace function public.site_listing(site text, target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
      'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms, 'bedrooms', p.bedrooms,
      'floor', p.floor, 'total_floors', p.total_floors, 'construction', p.construction_type, 'condition', p.condition,
      'furnishing', p.furnishing, 'heating', p.heating, 'exposures', p.exposures, 'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position) from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb),
      -- for a listing for sale: the rent the broker expects, or BRIXA's estimate from the agency's market
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end,
      'rating', public.public_rating(p.id)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
      from public.profiles pr where pr.id = p.responsible_broker_id
    ),
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
  )
  from public.properties p
  join public.organizations o on o.id = p.organization_id
  where o.site_slug = lower(site) and o.site_enabled and p.id = target_property
    and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
    and not p.off_market and not p.sample;
$$;

-- ---------------------------------------------------------------------
-- BRIXA's panel counts only an agency's real work
-- ---------------------------------------------------------------------
create or replace function public.platform_agencies()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'kind', o.kind, 'city', o.city, 'eik', o.eik,
        'phone', o.phone, 'email', o.email, 'created_at', o.created_at,
        'trial_ends_at', o.trial_ends_at, 'plan_code', o.plan_code, 'paid_until', o.paid_until,
        'comped', o.comped, 'terms_accepted_at', o.terms_accepted_at, 'sample_since', o.sample_since,
        'owner', (
          select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone)
          from public.organization_members m join public.profiles pr on pr.id = m.profile_id
          where m.organization_id = o.id and m.role = 'owner'
          order by m.created_at limit 1),
        'people', (select count(*) from public.organization_members m where m.organization_id = o.id),
        'invited', (select count(*) from public.organization_invitations i where i.organization_id = o.id and i.accepted_at is null),
        'listings', (select count(*) from public.properties p where p.organization_id = o.id and not p.sample),
        'clients', (select count(*) from public.clients c where c.organization_id = o.id and not c.sample),
        'deals', (select count(*) from public.deals d where d.organization_id = o.id and not d.sample),
        'last_sign_in', (
          select max(u.last_sign_in_at)
          from public.organization_members m join auth.users u on u.id = m.profile_id
          where m.organization_id = o.id),
        'last_activity', greatest(
          (select max(a.created_at) from public.activities a where a.organization_id = o.id and not a.sample),
          (select max(p.created_at) from public.properties p where p.organization_id = o.id and not p.sample),
          (select max(c.created_at) from public.clients c where c.organization_id = o.id and not c.sample))
      ) order by o.created_at desc)
    from public.organizations o
  ), '[]'::jsonb);
end;
$$;

-- =====================================================================
-- The chat (052)
-- =====================================================================
create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  -- the agency it belongs to (whoever made it)
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('agency', 'group')),
  title text check (title is null or char_length(btrim(title)) between 1 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  -- has people from another agency
  shared boolean not null default false,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index chat_rooms_one_per_agency on public.chat_rooms (organization_id) where kind = 'agency';

create table public.chat_members (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- the member's own agency
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- invited: from another agency, not accepted yet
  status text not null default 'active' check (status in ('active', 'invited', 'left')),
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (room_id, profile_id)
);

create index chat_members_profile_idx on public.chat_members (profile_id, status);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  -- the sender's agency (a client or a deal shows only to their agency)
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null default 'text'
    check (kind in ('text', 'property', 'client', 'deal', 'image', 'file', 'voice', 'system')),
  body text check (body is null or char_length(body) <= 4000),
  -- a listing, client or deal, and what its card shows (as it was when sent)
  ref_id uuid,
  card jsonb,
  -- chat-files/<room>/<file>
  file_path text check (file_path is null or char_length(file_path) <= 300),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_type text check (file_type is null or char_length(file_type) <= 100),
  file_size int check (file_size is null or file_size between 0 and 30000000),
  duration_s int check (duration_s is null or duration_s between 0 and 3600),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind <> 'text' or char_length(btrim(coalesce(body, ''))) >= 1 or deleted_at is not null),
  check (kind not in ('image', 'file', 'voice') or file_path is not null or deleted_at is not null)
);

create index chat_messages_room_idx on public.chat_messages (room_id, created_at desc);

alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

-- ---------------------------------------------------------------------
-- Who is in a conversation
-- ---------------------------------------------------------------------
create or replace function public.is_chat_member(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where room_id = target_room and profile_id = auth.uid() and status = 'active'
  );
$$;

revoke execute on function public.is_chat_member(uuid) from public, anon;
grant execute on function public.is_chat_member(uuid) to authenticated;

-- (any status: an invited person sees the conversation's name and who is in it)
create or replace function public.is_in_chat(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where room_id = target_room and profile_id = auth.uid() and status in ('active', 'invited')
  );
$$;

revoke execute on function public.is_in_chat(uuid) from public, anon;
grant execute on function public.is_in_chat(uuid) to authenticated;

-- Can I read this message: I'm in the conversation; someone from another agency only since they
-- joined; a client or a deal only within the sender's agency.
create or replace function public.can_read_chat_message(target_room uuid, sent_at timestamptz, message_kind text, sender_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members m
    join public.chat_rooms r on r.id = m.room_id
    where m.room_id = target_room and m.profile_id = auth.uid() and m.status = 'active'
      and (m.organization_id = r.organization_id or sent_at >= m.joined_at)
      and (message_kind not in ('client', 'deal') or sender_org = m.organization_id)
  );
$$;

revoke execute on function public.can_read_chat_message(uuid, timestamptz, text, uuid) from public, anon;
grant execute on function public.can_read_chat_message(uuid, timestamptz, text, uuid) to authenticated;

create policy "chat rooms: those in it" on public.chat_rooms
  for select to authenticated using (public.is_in_chat(id));

create policy "chat members: those in the conversation" on public.chat_members
  for select to authenticated using (public.is_in_chat(room_id));

create policy "chat messages: read" on public.chat_messages
  for select to authenticated using (public.can_read_chat_message(room_id, created_at, kind, organization_id));

-- text, photos, files and voice straight in; cards and the rest through the functions below
create policy "chat messages: write" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and kind in ('text', 'image', 'file', 'voice')
    and ref_id is null and card is null
    and public.is_chat_member(room_id)
    and organization_id = (select m.organization_id from public.chat_members m where m.room_id = chat_messages.room_id and m.profile_id = auth.uid())
    and (file_path is null or file_path like room_id::text || '/%')
  );

-- ---------------------------------------------------------------------
-- The agency's own chat: made with the agency, everyone in it
-- ---------------------------------------------------------------------
create or replace function public.chat_on_new_agency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_rooms (organization_id, kind) values (new.id, 'agency') on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.chat_on_new_agency() from public, anon, authenticated;

create trigger organizations_chat_room
  after insert on public.organizations
  for each row execute function public.chat_on_new_agency();

create or replace function public.chat_on_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.chat_members (room_id, profile_id, organization_id)
    select r.id, new.profile_id, new.organization_id
    from public.chat_rooms r
    where r.organization_id = new.organization_id and r.kind = 'agency'
    on conflict (room_id, profile_id) do update set status = 'active', organization_id = excluded.organization_id;
    return new;
  end if;
  -- leaving the agency: out of its conversations (the messages stay)
  delete from public.chat_members where profile_id = old.profile_id and organization_id = old.organization_id;
  return old;
end;
$$;

revoke execute on function public.chat_on_member_change() from public, anon, authenticated;

create trigger organization_members_chat
  after insert or delete on public.organization_members
  for each row execute function public.chat_on_member_change();

-- the agencies already here
insert into public.chat_rooms (organization_id, kind)
select o.id, 'agency' from public.organizations o
on conflict do nothing;

insert into public.chat_members (room_id, profile_id, organization_id, joined_at, last_read_at)
select r.id, m.profile_id, m.organization_id, m.created_at, now()
from public.organization_members m
join public.chat_rooms r on r.organization_id = m.organization_id and r.kind = 'agency'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- A new message: the conversation moves up, and the people in it hear (unless they muted it)
-- ---------------------------------------------------------------------
create or replace function public.chat_preview(message_kind text, message_body text, message_card jsonb, message_file text)
returns text
language sql
immutable
as $$
  select case message_kind
    when 'text' then left(message_body, 140)
    when 'image' then '📷'
    when 'voice' then '🎤'
    when 'file' then '📎 ' || coalesce(message_file, '')
    when 'property' then '🏠 ' || coalesce(message_card ->> 'title', '')
    when 'client' then '👤 ' || coalesce(message_card ->> 'name', '')
    when 'deal' then '🤝 ' || coalesce(message_card ->> 'title', '')
    else coalesce(message_body, '')
  end;
$$;

create or replace function public.chat_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room record;
  member record;
  people int;
begin
  update public.chat_rooms set last_message_at = new.created_at where id = new.room_id
  returning * into room;
  if new.kind = 'system' then return new; end if;

  select count(*) into people from public.chat_members where room_id = new.room_id and status = 'active';
  for member in
    select * from public.chat_members
    where room_id = new.room_id and status = 'active' and not muted and profile_id is distinct from new.sender_id
      and (new.kind not in ('client', 'deal') or organization_id = new.organization_id)
  loop
    perform public.notify(member.organization_id, member.profile_id, new.sender_id, 'chat_message',
      jsonb_build_object(
        'title', case when room.kind = 'agency' then (select name from public.organizations where id = room.organization_id) else room.title end,
        'kind', case when room.kind = 'agency' then 'agency' when people <= 2 and room.title is null then 'direct' else 'group' end,
        'actor', public.person_name(new.sender_id),
        'text', public.chat_preview(new.kind, new.body, new.card, new.file_name)),
      '/chat/' || new.room_id);
  end loop;
  return new;
end;
$$;

revoke execute on function public.chat_on_message() from public, anon, authenticated;

create trigger chat_messages_on_insert
  after insert on public.chat_messages
  for each row execute function public.chat_on_message();

-- ---------------------------------------------------------------------
-- Groups: made with colleagues (two people: a personal chat, found again rather than made twice)
-- ---------------------------------------------------------------------
create or replace function public.my_chat_org(target_room uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.chat_members where room_id = target_room and profile_id = auth.uid();
$$;

revoke execute on function public.my_chat_org(uuid) from public, anon, authenticated;

create or replace function public.create_chat_group(group_title text, people uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  org uuid;
  everyone uuid[];
  clean_title text := nullif(btrim(coalesce(group_title, '')), '');
  found_room uuid;
  new_room uuid;
begin
  select organization_id into org from public.organization_members where profile_id = me order by created_at limit 1;
  if org is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  -- only colleagues of the same agency (another agency's broker is invited by e-mail)
  select array_agg(distinct m.profile_id) into everyone
  from public.organization_members m
  where m.organization_id = org and (m.profile_id = any (coalesce(people, '{}')) or m.profile_id = me);
  if cardinality(everyone) < 2 then raise exception 'no_people'; end if;

  -- a personal chat already there
  if clean_title is null and cardinality(everyone) = 2 then
    select r.id into found_room
    from public.chat_rooms r
    where r.kind = 'group' and r.title is null and r.organization_id = org
      and (select array_agg(c.profile_id order by c.profile_id) from public.chat_members c where c.room_id = r.id and c.status = 'active')
          = (select array_agg(x order by x) from unnest(everyone) x)
    limit 1;
    if found_room is not null then return found_room; end if;
  end if;

  insert into public.chat_rooms (organization_id, kind, title, created_by)
  values (org, 'group', left(clean_title, 80), me)
  returning id into new_room;
  insert into public.chat_members (room_id, profile_id, organization_id, invited_by)
  select new_room, p, org, case when p = me then null else me end from unnest(everyone) p;
  return new_room;
end;
$$;

revoke execute on function public.create_chat_group(text, uuid[]) from public, anon;
grant execute on function public.create_chat_group(text, uuid[]) to authenticated;

-- More colleagues into a group.
create or replace function public.add_chat_people(target_room uuid, people uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid := public.my_chat_org(target_room);
begin
  if not public.is_chat_member(target_room) or (select kind from public.chat_rooms where id = target_room) <> 'group' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.chat_members (room_id, profile_id, organization_id, invited_by)
  select target_room, m.profile_id, org, auth.uid()
  from public.organization_members m
  where m.organization_id = org and m.profile_id = any (coalesce(people, '{}'))
  on conflict (room_id, profile_id) do update
    set status = 'active', joined_at = case when chat_members.status = 'active' then chat_members.joined_at else now() end;
  insert into public.chat_messages (room_id, sender_id, organization_id, kind, body)
  select target_room, auth.uid(), org, 'system', 'added:' || public.person_name(p)
  from unnest(people) p
  where exists (select 1 from public.organization_members m where m.organization_id = org and m.profile_id = p);
end;
$$;

revoke execute on function public.add_chat_people(uuid, uuid[]) from public, anon;
grant execute on function public.add_chat_people(uuid, uuid[]) to authenticated;

-- A broker of another agency in BRIXA, by e-mail: invited, and in once they accept.
create or replace function public.invite_to_chat(target_room uuid, invite_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_org uuid := public.my_chat_org(target_room);
  room record;
  guest uuid;
  guest_org uuid;
  existing text;
begin
  select * into room from public.chat_rooms where id = target_room;
  if not public.is_chat_member(target_room) or room.kind <> 'group' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select p.id into guest from public.profiles p where lower(p.email) = lower(btrim(coalesce(invite_email, ''))) limit 1;
  if guest is null then return 'not_found'; end if;
  select status into existing from public.chat_members where room_id = target_room and profile_id = guest;
  if existing in ('active', 'invited') then return 'already'; end if;
  select organization_id into guest_org from public.organization_members where profile_id = guest order by created_at limit 1;
  if guest_org is null then return 'not_found'; end if;

  if guest_org = my_org then
    perform public.add_chat_people(target_room, array[guest]);
    return 'added';
  end if;

  insert into public.chat_members (room_id, profile_id, organization_id, status, invited_by)
  values (target_room, guest, guest_org, 'invited', me)
  on conflict (room_id, profile_id) do update set status = 'invited', organization_id = excluded.organization_id, invited_by = me;
  update public.chat_rooms set shared = true where id = target_room;
  perform public.notify(guest_org, guest, me, 'chat_invite',
    jsonb_build_object(
      'room', target_room,
      'title', coalesce(room.title, public.person_name(me)),
      'actor', public.person_name(me),
      'agency', (select name from public.organizations where id = my_org)),
    '/chat');
  return 'invited';
end;
$$;

revoke execute on function public.invite_to_chat(uuid, text) from public, anon;
grant execute on function public.invite_to_chat(uuid, text) to authenticated;

create or replace function public.answer_chat_invite(target_room uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.chat_members where room_id = target_room and profile_id = me and status = 'invited') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if accept then
    update public.chat_members set status = 'active', joined_at = now(), last_read_at = now()
    where room_id = target_room and profile_id = me;
    insert into public.chat_messages (room_id, sender_id, organization_id, kind, body)
    values (target_room, me, public.my_chat_org(target_room), 'system',
      'joined:' || public.person_name(me) || ' (' || (select name from public.organizations where id = public.my_chat_org(target_room)) || ')');
  else
    delete from public.chat_members where room_id = target_room and profile_id = me;
  end if;
  delete from public.notifications where recipient_id = me and type = 'chat_invite' and data ->> 'room' = target_room::text;
end;
$$;

revoke execute on function public.answer_chat_invite(uuid, boolean) from public, anon;
grant execute on function public.answer_chat_invite(uuid, boolean) to authenticated;

create or replace function public.rename_chat(target_room uuid, new_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_chat_member(target_room) or (select kind from public.chat_rooms where id = target_room) <> 'group' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.chat_rooms set title = left(nullif(btrim(coalesce(new_title, '')), ''), 80) where id = target_room;
end;
$$;

revoke execute on function public.rename_chat(uuid, text) from public, anon;
grant execute on function public.rename_chat(uuid, text) to authenticated;

create or replace function public.leave_chat(target_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_chat_member(target_room) or (select kind from public.chat_rooms where id = target_room) <> 'group' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.chat_messages (room_id, sender_id, organization_id, kind, body)
  values (target_room, auth.uid(), public.my_chat_org(target_room), 'system', 'left:' || public.person_name(auth.uid()));
  update public.chat_members set status = 'left' where room_id = target_room and profile_id = auth.uid();
end;
$$;

revoke execute on function public.leave_chat(uuid) from public, anon;
grant execute on function public.leave_chat(uuid) to authenticated;

create or replace function public.set_chat_muted(target_room uuid, mute boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_members set muted = coalesce(mute, false)
  where room_id = target_room and profile_id = auth.uid();
$$;

revoke execute on function public.set_chat_muted(uuid, boolean) from public, anon;
grant execute on function public.set_chat_muted(uuid, boolean) to authenticated;

-- Read up to now: the conversation's pushes go from the notifications too.
create or replace function public.mark_chat_read(target_room uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_members set last_read_at = now()
  where room_id = target_room and profile_id = auth.uid() and status = 'active';
  delete from public.notifications
  where recipient_id = auth.uid() and type = 'chat_message' and link = '/chat/' || target_room::text;
$$;

revoke execute on function public.mark_chat_read(uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- A listing, client or deal of BRIXA into the conversation, as a card
-- ---------------------------------------------------------------------
create or replace function public.send_chat_card(target_room uuid, card_kind text, target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid := public.my_chat_org(target_room);
  shared_room boolean;
  card_data jsonb;
  new_id uuid;
begin
  if not public.is_chat_member(target_room) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select shared into shared_room from public.chat_rooms where id = target_room;
  -- a client or a deal never goes to another agency
  if card_kind in ('client', 'deal') and shared_room then
    raise exception 'not_with_other_agencies';
  end if;

  if card_kind = 'property' then
    if not public.can_view_property(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'title', p.title, 'operation', p.operation_type, 'status', p.status,
        'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms,
        'place', concat_ws(', ', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
                                 (select s.name from public.geo_settlements s where s.id = p.settlement_id)),
        'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
        'org', p.organization_id)
    into card_data
    from public.properties p where p.id = target and p.organization_id = org;
  elsif card_kind = 'client' then
    if not public.can_view_client(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'name', c.full_name, 'types', c.types, 'class', c.client_class,
        'operation', s.operation, 'budget_max', s.budget_max, 'currency', s.currency)
    into card_data
    from public.clients c left join public.client_searches s on s.client_id = c.id
    where c.id = target and c.organization_id = org;
  elsif card_kind = 'deal' then
    if not public.can_view_deal(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'title', coalesce(p.title, c.full_name, '—'), 'client', c.full_name,
        'stage', d.stage, 'status', d.status, 'kind', d.kind, 'price', d.price, 'currency', d.currency)
    into card_data
    from public.deals d
    left join public.properties p on p.id = d.property_id
    left join public.clients c on c.id = d.client_id
    where d.id = target and d.organization_id = org;
  else
    raise exception 'bad_kind';
  end if;
  if card_data is null then raise exception 'not_allowed' using errcode = '42501'; end if;

  insert into public.chat_messages (room_id, sender_id, organization_id, kind, ref_id, card)
  values (target_room, auth.uid(), org, card_kind, target, card_data)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.send_chat_card(uuid, text, uuid) from public, anon;
grant execute on function public.send_chat_card(uuid, text, uuid) to authenticated;

-- One's own message, taken back.
create or replace function public.delete_chat_message(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  path text;
begin
  update public.chat_messages
  set deleted_at = now(), body = null, card = null, file_path = null
  where id = target and sender_id = auth.uid() and deleted_at is null and kind <> 'system'
  returning id into path;
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
  return path;
end;
$$;

revoke execute on function public.delete_chat_message(uuid) from public, anon;
grant execute on function public.delete_chat_message(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- My conversations: the agency's first, then by the last message; what's unread
-- ---------------------------------------------------------------------
create or replace function public.my_chats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by (row ->> 'kind') <> 'agency', row ->> 'status' <> 'invited', (row ->> 'last_at') desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'title', r.title, 'shared', r.shared,
      'status', me.status, 'muted', me.muted,
      'agency', case when r.kind = 'agency' then (select name from public.organizations where id = r.organization_id) end,
      'home_agency', (select name from public.organizations where id = r.organization_id),
      'people', coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', pr.id, 'name', coalesce(pr.full_name, pr.email), 'avatar_path', pr.avatar_path,
            'agency', case when m.organization_id <> me.organization_id then (select name from public.organizations where id = m.organization_id) end,
            'invited', m.status = 'invited')
          order by m.joined_at)
        from public.chat_members m join public.profiles pr on pr.id = m.profile_id
        where m.room_id = r.id and m.profile_id <> me.profile_id and m.status in ('active', 'invited')), '[]'::jsonb),
      'last_at', coalesce(r.last_message_at, r.created_at),
      'last', case when me.status = 'active' then (
        select jsonb_build_object('kind', x.kind, 'text', public.chat_preview(x.kind, x.body, x.card, x.file_name),
          'sender', public.person_name(x.sender_id), 'mine', x.sender_id = me.profile_id, 'deleted', x.deleted_at is not null)
        from public.chat_messages x
        where x.room_id = r.id and x.kind <> 'system'
          and (me.organization_id = r.organization_id or x.created_at >= me.joined_at)
          and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id)
        order by x.created_at desc limit 1) end,
      'unread', case when me.status = 'active' then (
        select count(*) from public.chat_messages x
        where x.room_id = r.id and x.kind <> 'system' and x.deleted_at is null
          and x.created_at > me.last_read_at and x.sender_id is distinct from me.profile_id
          and (me.organization_id = r.organization_id or x.created_at >= me.joined_at)
          and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id)) else 0 end
    ) as row
    from public.chat_members me
    join public.chat_rooms r on r.id = me.room_id
    where me.profile_id = auth.uid() and me.status in ('active', 'invited')
  ) rows;
$$;

revoke execute on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;

-- Everyone a conversation has had (to put a name on each message), with their agency when it's another.
create or replace function public.chat_people(target_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_org uuid := public.my_chat_org(target_room);
begin
  if not public.is_in_chat(target_room) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', coalesce(pr.full_name, pr.email), 'avatar_path', pr.avatar_path,
        'agency', case when m.organization_id <> my_org then (select name from public.organizations where id = m.organization_id) end,
        'status', m.status)
      order by m.joined_at)
    from public.chat_members m join public.profiles pr on pr.id = m.profile_id
    where m.room_id = target_room), '[]'::jsonb);
end;
$$;

revoke execute on function public.chat_people(uuid) from public, anon;
grant execute on function public.chat_people(uuid) to authenticated;

-- The number on the chat's icon: unread messages in the conversations not muted.
create or replace function public.chat_unread()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*) from public.chat_members me
      join public.chat_rooms r on r.id = me.room_id
      join public.chat_messages x on x.room_id = me.room_id
      where me.profile_id = auth.uid() and me.status = 'active' and not me.muted
        and x.kind <> 'system' and x.deleted_at is null
        and x.created_at > me.last_read_at and x.sender_id is distinct from me.profile_id
        and (me.organization_id = r.organization_id or x.created_at >= me.joined_at)
        and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id))
    + (select count(*) from public.chat_members where profile_id = auth.uid() and status = 'invited')
  )::int;
$$;

revoke execute on function public.chat_unread() from public, anon;
grant execute on function public.chat_unread() to authenticated;

-- ---------------------------------------------------------------------
-- Photos, files and voice messages: chat-files/<conversation>/<file>, for those in it
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 26214400, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
  'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/wav'
])
on conflict (id) do nothing;

create or replace function public.can_use_chat_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_chat_member(split_part(object_name, '/', 1)::uuid);
$$;

revoke execute on function public.can_use_chat_file(text) from public, anon;
grant execute on function public.can_use_chat_file(text) to authenticated;

create policy "chat files: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-files' and public.can_use_chat_file(name));

create policy "chat files: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-files' and public.can_use_chat_file(name));

-- ---------------------------------------------------------------------
-- New messages reach an open conversation at once
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;

-- =====================================================================
-- The chat like Messenger (053)
-- =====================================================================
alter table public.chat_rooms drop constraint if exists chat_rooms_kind_check;
alter table public.chat_rooms
  add constraint chat_rooms_kind_check check (kind in ('agency', 'office', 'team', 'group', 'direct', 'brixa'));
alter table public.chat_rooms alter column organization_id drop not null;
alter table public.chat_rooms
  add constraint chat_rooms_org_check check (organization_id is not null or kind = 'brixa'),
  add column office_id uuid references public.offices (id) on delete cascade,
  add column team_id uuid references public.teams (id) on delete cascade;

create unique index chat_rooms_one_brixa on public.chat_rooms (kind) where kind = 'brixa';
create unique index chat_rooms_one_per_office on public.chat_rooms (office_id) where office_id is not null;
create unique index chat_rooms_one_per_team on public.chat_rooms (team_id) where team_id is not null;

-- the personal chats made so far (two people, no name)
update public.chat_rooms r set kind = 'direct'
where r.kind = 'group' and r.title is null
  and (select count(*) from public.chat_members m where m.room_id = r.id) = 2;

alter table public.chat_messages
  add column reply_to uuid references public.chat_messages (id) on delete set null;

-- ---------------------------------------------------------------------
-- Reading: everyone in BRIXA's own conversation reads all of it
-- ---------------------------------------------------------------------
create or replace function public.can_read_chat_message(target_room uuid, sent_at timestamptz, message_kind text, sender_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members m
    join public.chat_rooms r on r.id = m.room_id
    where m.room_id = target_room and m.profile_id = auth.uid() and m.status = 'active'
      and (r.kind = 'brixa' or m.organization_id = r.organization_id or sent_at >= m.joined_at)
      and (message_kind not in ('client', 'deal') or sender_org = m.organization_id)
  );
$$;

-- a reply points within its own conversation
drop policy if exists "chat messages: write" on public.chat_messages;
create policy "chat messages: write" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and kind in ('text', 'image', 'file', 'voice')
    and ref_id is null and card is null
    and public.is_chat_member(room_id)
    and organization_id = (select m.organization_id from public.chat_members m where m.room_id = chat_messages.room_id and m.profile_id = auth.uid())
    and (file_path is null or file_path like room_id::text || '/%')
    and (chat_messages.reply_to is null or exists (select 1 from public.chat_messages x where x.id = chat_messages.reply_to and x.room_id = chat_messages.room_id))
  );

-- ---------------------------------------------------------------------
-- Offices and teams: a conversation each, with their people
-- ---------------------------------------------------------------------
create or replace function public.sync_unit_chats(target_profile uuid, target_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.chat_members c
  using public.chat_rooms r
  where r.id = c.room_id and c.profile_id = target_profile
    and r.organization_id = target_org and r.kind in ('office', 'team')
    and not exists (
      select 1 from public.organization_members m
      where m.organization_id = target_org and m.profile_id = target_profile
        and ((r.kind = 'office' and r.office_id = m.office_id)
          or (r.kind = 'team' and (r.team_id = m.team_id or exists (select 1 from public.teams t where t.id = r.team_id and t.manager_id = target_profile)))));

  insert into public.chat_members (room_id, profile_id, organization_id)
  select r.id, target_profile, target_org
  from public.chat_rooms r
  join public.organization_members m on m.organization_id = r.organization_id and m.profile_id = target_profile
  where r.organization_id = target_org and r.kind in ('office', 'team')
    and ((r.kind = 'office' and r.office_id = m.office_id)
      or (r.kind = 'team' and (r.team_id = m.team_id or exists (select 1 from public.teams t where t.id = r.team_id and t.manager_id = target_profile))))
  on conflict (room_id, profile_id) do update set status = 'active';
end;
$$;

revoke execute on function public.sync_unit_chats(uuid, uuid) from public, anon, authenticated;

create or replace function public.chat_on_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'offices' then
    insert into public.chat_rooms (organization_id, kind, office_id) values (new.organization_id, 'office', new.id) on conflict do nothing;
  else
    if tg_op = 'INSERT' then
      insert into public.chat_rooms (organization_id, kind, team_id) values (new.organization_id, 'team', new.id) on conflict do nothing;
    elsif old.manager_id is not null and old.manager_id is distinct from new.manager_id then
      perform public.sync_unit_chats(old.manager_id, new.organization_id);
    end if;
    if new.manager_id is not null then
      perform public.sync_unit_chats(new.manager_id, new.organization_id);
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.chat_on_unit() from public, anon, authenticated;

create trigger offices_chat_room
  after insert on public.offices
  for each row execute function public.chat_on_unit();

create trigger teams_chat_room
  after insert or update of manager_id on public.teams
  for each row execute function public.chat_on_unit();

-- ---------------------------------------------------------------------
-- Everyone in BRIXA: one conversation (no pushes unless one turns them on)
-- ---------------------------------------------------------------------
insert into public.chat_rooms (organization_id, kind, title, shared) values (null, 'brixa', null, true)
on conflict do nothing;

create or replace function public.chat_on_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- leaving the agency: out of its conversations (the messages stay)
    delete from public.chat_members where profile_id = old.profile_id and organization_id = old.organization_id;
    return old;
  end if;
  if tg_op = 'INSERT' then
    insert into public.chat_members (room_id, profile_id, organization_id)
    select r.id, new.profile_id, new.organization_id
    from public.chat_rooms r
    where r.organization_id = new.organization_id and r.kind = 'agency'
    on conflict (room_id, profile_id) do update set status = 'active', organization_id = excluded.organization_id;
    insert into public.chat_members (room_id, profile_id, organization_id, muted)
    select r.id, new.profile_id, new.organization_id, true
    from public.chat_rooms r where r.kind = 'brixa'
    on conflict (room_id, profile_id) do nothing;
  end if;
  perform public.sync_unit_chats(new.profile_id, new.organization_id);
  return new;
end;
$$;

drop trigger if exists organization_members_chat on public.organization_members;
create trigger organization_members_chat
  after insert or delete or update of office_id, team_id on public.organization_members
  for each row execute function public.chat_on_member_change();

-- what's here already
insert into public.chat_rooms (organization_id, kind, office_id)
select organization_id, 'office', id from public.offices
on conflict do nothing;
insert into public.chat_rooms (organization_id, kind, team_id)
select organization_id, 'team', id from public.teams
on conflict do nothing;
do $$
declare
  m record;
begin
  for m in select profile_id, organization_id from public.organization_members loop
    perform public.sync_unit_chats(m.profile_id, m.organization_id);
  end loop;
end;
$$;
insert into public.chat_members (room_id, profile_id, organization_id, muted, last_read_at)
select (select id from public.chat_rooms where kind = 'brixa'), m.profile_id, m.organization_id, true, now()
from (select distinct on (profile_id) profile_id, organization_id from public.organization_members order by profile_id, created_at) m
on conflict do nothing;

-- ---------------------------------------------------------------------
-- A new message: the office's or team's name on the push; nothing for the muted
-- ---------------------------------------------------------------------
create or replace function public.chat_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room record;
  member record;
  room_name text;
begin
  update public.chat_rooms set last_message_at = new.created_at where id = new.room_id
  returning * into room;
  if new.kind = 'system' then return new; end if;

  room_name := case room.kind
    when 'agency' then (select name from public.organizations where id = room.organization_id)
    when 'office' then (select name from public.offices where id = room.office_id)
    when 'team' then (select name from public.teams where id = room.team_id)
    when 'brixa' then 'BRIXA'
    else room.title end;
  for member in
    select * from public.chat_members
    where room_id = new.room_id and status = 'active' and not muted and profile_id is distinct from new.sender_id
      and (new.kind not in ('client', 'deal') or organization_id = new.organization_id)
  loop
    perform public.notify(member.organization_id, member.profile_id, new.sender_id, 'chat_message',
      jsonb_build_object(
        'title', room_name,
        'kind', case when room.kind = 'direct' then 'direct' else 'group' end,
        'actor', public.person_name(new.sender_id),
        'text', public.chat_preview(new.kind, new.body, new.card, new.file_name)),
      '/chat/' || new.room_id);
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Personal chats: with a colleague at once; with someone of another agency, a request they accept
-- ---------------------------------------------------------------------
create or replace function public.start_direct_chat(person uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_org uuid;
  their_org uuid;
  found_room uuid;
  new_room uuid;
begin
  select organization_id into my_org from public.organization_members where profile_id = me order by created_at limit 1;
  select organization_id into their_org from public.organization_members where profile_id = person order by created_at limit 1;
  if my_org is null or their_org is null or person = me then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select r.id into found_room
  from public.chat_rooms r
  where r.kind = 'direct'
    and exists (select 1 from public.chat_members a where a.room_id = r.id and a.profile_id = me and a.status <> 'left')
    and exists (select 1 from public.chat_members b where b.room_id = r.id and b.profile_id = person and b.status <> 'left')
  limit 1;
  if found_room is not null then return found_room; end if;

  insert into public.chat_rooms (organization_id, kind, created_by, shared)
  values (my_org, 'direct', me, their_org <> my_org)
  returning id into new_room;
  insert into public.chat_members (room_id, profile_id, organization_id) values (new_room, me, my_org);
  if their_org = my_org then
    insert into public.chat_members (room_id, profile_id, organization_id, invited_by) values (new_room, person, their_org, me);
  else
    insert into public.chat_members (room_id, profile_id, organization_id, status, invited_by) values (new_room, person, their_org, 'invited', me);
    perform public.notify(their_org, person, me, 'chat_invite',
      jsonb_build_object('room', new_room, 'title', public.person_name(me), 'actor', public.person_name(me),
        'agency', (select name from public.organizations where id = my_org), 'direct', true),
      '/chat');
  end if;
  return new_room;
end;
$$;

revoke execute on function public.start_direct_chat(uuid) from public, anon;
grant execute on function public.start_direct_chat(uuid) to authenticated;

-- A group with one colleague and no name is a personal chat.
create or replace function public.create_chat_group(group_title text, people uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  org uuid;
  everyone uuid[];
  clean_title text := nullif(btrim(coalesce(group_title, '')), '');
  new_room uuid;
begin
  select organization_id into org from public.organization_members where profile_id = me order by created_at limit 1;
  if org is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  select array_agg(distinct m.profile_id) into everyone
  from public.organization_members m
  where m.organization_id = org and (m.profile_id = any (coalesce(people, '{}')) or m.profile_id = me);
  if cardinality(everyone) < 2 then raise exception 'no_people'; end if;
  if clean_title is null and cardinality(everyone) = 2 then
    return public.start_direct_chat((select p from unnest(everyone) p where p <> me));
  end if;

  insert into public.chat_rooms (organization_id, kind, title, created_by)
  values (org, 'group', left(clean_title, 80), me)
  returning id into new_room;
  insert into public.chat_members (room_id, profile_id, organization_id, invited_by)
  select new_room, p, org, case when p = me then null else me end from unnest(everyone) p;
  return new_room;
end;
$$;

-- An invitation accepted: one sees what was written since one was invited (a message request too).
create or replace function public.answer_chat_invite(target_room uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.chat_members where room_id = target_room and profile_id = me and status = 'invited') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if accept then
    update public.chat_members set status = 'active', last_read_at = now()
    where room_id = target_room and profile_id = me;
    if (select kind from public.chat_rooms where id = target_room) <> 'direct' then
      insert into public.chat_messages (room_id, sender_id, organization_id, kind, body)
      values (target_room, me, public.my_chat_org(target_room), 'system',
        'joined:' || public.person_name(me) || ' (' || (select name from public.organizations where id = public.my_chat_org(target_room)) || ')');
    end if;
  else
    delete from public.chat_members where room_id = target_room and profile_id = me;
  end if;
  delete from public.notifications where recipient_id = me and type = 'chat_invite' and data ->> 'room' = target_room::text;
end;
$$;

-- BRIXA may take a message down in everyone's conversation.
create or replace function public.delete_chat_message(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  done uuid;
begin
  update public.chat_messages x
  set deleted_at = now(), body = null, card = null, file_path = null
  where x.id = target and x.deleted_at is null and x.kind <> 'system'
    and (x.sender_id = auth.uid()
      or (public.is_platform_admin() and exists (select 1 from public.chat_rooms r where r.id = x.room_id and r.kind = 'brixa')))
  returning x.id into done;
  if done is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  return done;
end;
$$;

-- ---------------------------------------------------------------------
-- Reactions: one per person per message
-- ---------------------------------------------------------------------
create table public.chat_reactions (
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '👍', '😂', '😮', '😢', '🙏')),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);

create index chat_reactions_room_idx on public.chat_reactions (room_id);

alter table public.chat_reactions enable row level security;

create or replace function public.can_react(target_message uuid, target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_messages x
    where x.id = target_message and x.room_id = target_room and x.deleted_at is null and x.kind <> 'system'
      and public.can_read_chat_message(x.room_id, x.created_at, x.kind, x.organization_id)
  );
$$;

revoke execute on function public.can_react(uuid, uuid) from public, anon;
grant execute on function public.can_react(uuid, uuid) to authenticated;

create policy "chat reactions: read" on public.chat_reactions
  for select to authenticated using (public.can_react(message_id, room_id));
create policy "chat reactions: add own" on public.chat_reactions
  for insert to authenticated with check (profile_id = auth.uid() and public.can_react(message_id, room_id));
create policy "chat reactions: change own" on public.chat_reactions
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid() and public.can_react(message_id, room_id));
create policy "chat reactions: take back own" on public.chat_reactions
  for delete to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- Anyone in BRIXA by name (to write to them): name, photo, agency
-- ---------------------------------------------------------------------
create or replace function public.search_brixa_people(q text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by same desc, name), '[]'::jsonb)
  from (
    select distinct on (pr.id)
      jsonb_build_object('id', pr.id, 'name', coalesce(pr.full_name, split_part(pr.email, '@', 1)), 'avatar_path', pr.avatar_path,
        'job_title', pr.job_title, 'agency', o.name,
        'same', o.id = (select organization_id from public.organization_members where profile_id = auth.uid() order by created_at limit 1)) as row,
      o.id = (select organization_id from public.organization_members where profile_id = auth.uid() order by created_at limit 1) as same,
      coalesce(pr.full_name, pr.email) as name
    from public.profiles pr
    join public.organization_members m on m.profile_id = pr.id
    join public.organizations o on o.id = m.organization_id
    where auth.uid() is not null and pr.id <> auth.uid()
      and char_length(btrim(coalesce(q, ''))) >= 2
      and (pr.full_name ilike '%' || btrim(q) || '%' or o.name ilike '%' || btrim(q) || '%')
      and pr.email not like '%@demo.brixa.invalid'
    order by pr.id, m.created_at
    limit 30
  ) found;
$$;

revoke execute on function public.search_brixa_people(text) from public, anon;
grant execute on function public.search_brixa_people(text) to authenticated;

-- ---------------------------------------------------------------------
-- The people of a conversation (in everyone's: those who wrote), with when they last read
-- ---------------------------------------------------------------------
create or replace function public.chat_people(target_room uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  my_org uuid := public.my_chat_org(target_room);
  everyone boolean := (select kind = 'brixa' from public.chat_rooms where id = target_room);
begin
  if not public.is_in_chat(target_room) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', coalesce(pr.full_name, pr.email), 'avatar_path', pr.avatar_path,
        'agency', case when m.organization_id <> my_org then (select name from public.organizations where id = m.organization_id) end,
        'status', m.status, 'last_read_at', m.last_read_at)
      order by m.joined_at)
    from public.chat_members m join public.profiles pr on pr.id = m.profile_id
    where m.room_id = target_room
      and (not everyone or m.profile_id = auth.uid()
        or exists (select 1 from public.chat_messages x where x.room_id = target_room and x.sender_id = m.profile_id))), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- My conversations, newest first (invitations on top), with the unread
-- ---------------------------------------------------------------------
create or replace function public.my_chats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by row ->> 'status' <> 'invited', (row ->> 'last_at') desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'title', r.title, 'shared', r.shared,
      'status', me.status, 'muted', me.muted,
      'agency', case when r.kind = 'agency' then (select name from public.organizations where id = r.organization_id) end,
      'unit', case r.kind when 'office' then (select name from public.offices where id = r.office_id)
                          when 'team' then (select name from public.teams where id = r.team_id) end,
      'home_agency', (select name from public.organizations where id = r.organization_id),
      'count', (select count(*) from public.chat_members c where c.room_id = r.id and c.status = 'active'),
      'people', case when r.kind in ('group', 'direct') then coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', pr.id, 'name', coalesce(pr.full_name, pr.email), 'avatar_path', pr.avatar_path,
            'agency', case when m.organization_id <> me.organization_id then (select name from public.organizations where id = m.organization_id) end,
            'invited', m.status = 'invited')
          order by m.joined_at)
        from public.chat_members m join public.profiles pr on pr.id = m.profile_id
        where m.room_id = r.id and m.profile_id <> me.profile_id and m.status in ('active', 'invited')), '[]'::jsonb) else '[]'::jsonb end,
      'last_at', coalesce(r.last_message_at, r.created_at),
      'last', case when me.status = 'active' or r.kind = 'direct' then (
        select jsonb_build_object('kind', x.kind, 'text', public.chat_preview(x.kind, x.body, x.card, x.file_name),
          'sender', public.person_name(x.sender_id), 'mine', x.sender_id = me.profile_id, 'deleted', x.deleted_at is not null)
        from public.chat_messages x
        where x.room_id = r.id and x.kind <> 'system'
          and (r.kind = 'brixa' or me.organization_id = r.organization_id or x.created_at >= me.joined_at)
          and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id)
        order by x.created_at desc limit 1) end,
      'unread', case when me.status = 'active' then (
        select count(*) from public.chat_messages x
        where x.room_id = r.id and x.kind <> 'system' and x.deleted_at is null
          and x.created_at > me.last_read_at and x.sender_id is distinct from me.profile_id
          and (r.kind = 'brixa' or me.organization_id = r.organization_id or x.created_at >= me.joined_at)
          and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id)) else 0 end
    ) as row
    from public.chat_members me
    join public.chat_rooms r on r.id = me.room_id
    where me.profile_id = auth.uid() and me.status in ('active', 'invited')
      -- one office only: its conversation would be the agency's again
      and not (r.kind = 'office' and (select count(*) from public.offices o where o.organization_id = r.organization_id) < 2)
  ) rows;
$$;

create or replace function public.chat_unread()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*) from public.chat_members me
      join public.chat_rooms r on r.id = me.room_id
      join public.chat_messages x on x.room_id = me.room_id
      where me.profile_id = auth.uid() and me.status = 'active' and not me.muted
        and not (r.kind = 'office' and (select count(*) from public.offices o where o.organization_id = r.organization_id) < 2)
        and x.kind <> 'system' and x.deleted_at is null
        and x.created_at > me.last_read_at and x.sender_id is distinct from me.profile_id
        and (r.kind = 'brixa' or me.organization_id = r.organization_id or x.created_at >= me.joined_at)
        and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id))
    + (select count(*) from public.chat_members where profile_id = auth.uid() and status = 'invited')
  )::int;
$$;

-- ---------------------------------------------------------------------
-- "Seen" and the reactions reach an open conversation at once
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_reactions') then
      alter publication supabase_realtime add table public.chat_reactions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_members') then
      alter publication supabase_realtime add table public.chat_members;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- A listing sent to another agency opens (054)
-- ---------------------------------------------------------------------
create or replace function public.send_chat_card(target_room uuid, card_kind text, target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid := public.my_chat_org(target_room);
  shared_room boolean;
  card_data jsonb;
  new_id uuid;
  share_token uuid;
begin
  if not public.is_chat_member(target_room) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select shared into shared_room from public.chat_rooms where id = target_room;
  -- a client or a deal never goes to another agency
  if card_kind in ('client', 'deal') and shared_room then
    raise exception 'not_with_other_agencies';
  end if;

  if card_kind = 'property' then
    if not public.can_view_property(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'title', p.title, 'operation', p.operation_type, 'status', p.status,
        'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms,
        'place', concat_ws(', ', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
                                 (select s.name from public.geo_settlements s where s.id = p.settlement_id)),
        'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
        'org', p.organization_id)
    into card_data
    from public.properties p where p.id = target and p.organization_id = org;
  elsif card_kind = 'client' then
    if not public.can_view_client(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'name', c.full_name, 'types', c.types, 'class', c.client_class,
        'operation', s.operation, 'budget_max', s.budget_max, 'currency', s.currency)
    into card_data
    from public.clients c left join public.client_searches s on s.client_id = c.id
    where c.id = target and c.organization_id = org;
  elsif card_kind = 'deal' then
    if not public.can_view_deal(target) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select jsonb_build_object(
        'title', coalesce(p.title, c.full_name, '—'), 'client', c.full_name,
        'stage', d.stage, 'status', d.status, 'kind', d.kind, 'price', d.price, 'currency', d.currency)
    into card_data
    from public.deals d
    left join public.properties p on p.id = d.property_id
    left join public.clients c on c.id = d.client_id
    where d.id = target and d.organization_id = org;
  else
    raise exception 'bad_kind';
  end if;
  if card_data is null then raise exception 'not_allowed' using errcode = '42501'; end if;

  -- for another agency: the listing's public page (photos, the broker), as a shared link — the
  -- broker hears when it's opened
  if card_kind = 'property' and shared_room then
    select token into share_token
    from public.property_shares
    where property_id = target and created_by = auth.uid() and client_id is null and revoked_at is null
    order by created_at desc limit 1;
    if share_token is null then
      insert into public.property_shares (property_id, organization_id, created_by)
      values (target, org, auth.uid())
      returning token into share_token;
    end if;
    card_data := card_data || jsonb_build_object('share', share_token);
  end if;

  insert into public.chat_messages (room_id, sender_id, organization_id, kind, ref_id, card)
  values (target_room, auth.uid(), org, card_kind, target, card_data)
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Message requests like Messenger's (055)
-- ---------------------------------------------------------------------
create or replace function public.can_read_chat_message(target_room uuid, sent_at timestamptz, message_kind text, sender_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members m
    join public.chat_rooms r on r.id = m.room_id
    where m.room_id = target_room and m.profile_id = auth.uid()
      -- a message request: read before accepting
      and (m.status = 'active' or (m.status = 'invited' and r.kind = 'direct'))
      and (r.kind = 'brixa' or m.organization_id = r.organization_id or sent_at >= m.joined_at)
      and (message_kind not in ('client', 'deal') or sender_org = m.organization_id)
  );
$$;

-- read up to now (a request too: its count goes)
create or replace function public.mark_chat_read(target_room uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chat_members set last_read_at = now()
  where room_id = target_room and profile_id = auth.uid() and status in ('active', 'invited');
  delete from public.notifications
  where recipient_id = auth.uid() and type = 'chat_message' and link = '/chat/' || target_room::text;
$$;

-- a request shows its unread like any conversation
create or replace function public.my_chats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by (row ->> 'status' <> 'invited' or row ->> 'kind' = 'direct'), (row ->> 'last_at') desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'title', r.title, 'shared', r.shared,
      'status', me.status, 'muted', me.muted,
      'agency', case when r.kind = 'agency' then (select name from public.organizations where id = r.organization_id) end,
      'unit', case r.kind when 'office' then (select name from public.offices where id = r.office_id)
                          when 'team' then (select name from public.teams where id = r.team_id) end,
      'home_agency', (select name from public.organizations where id = r.organization_id),
      'count', (select count(*) from public.chat_members c where c.room_id = r.id and c.status = 'active'),
      'people', case when r.kind in ('group', 'direct') then coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', pr.id, 'name', coalesce(pr.full_name, pr.email), 'avatar_path', pr.avatar_path,
            'agency', case when m.organization_id <> me.organization_id then (select name from public.organizations where id = m.organization_id) end,
            'invited', m.status = 'invited')
          order by m.joined_at)
        from public.chat_members m join public.profiles pr on pr.id = m.profile_id
        where m.room_id = r.id and m.profile_id <> me.profile_id and m.status in ('active', 'invited')), '[]'::jsonb) else '[]'::jsonb end,
      'last_at', coalesce(r.last_message_at, r.created_at),
      'last', case when me.status = 'active' or r.kind = 'direct' then (
        select jsonb_build_object('kind', x.kind, 'text', public.chat_preview(x.kind, x.body, x.card, x.file_name),
          'sender', public.person_name(x.sender_id), 'mine', x.sender_id = me.profile_id, 'deleted', x.deleted_at is not null)
        from public.chat_messages x
        where x.room_id = r.id and x.kind <> 'system'
          and (r.kind = 'brixa' or me.organization_id = r.organization_id or x.created_at >= me.joined_at)
          and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id)
        order by x.created_at desc limit 1) end,
      'unread', case when me.status = 'active' or r.kind = 'direct' then (
        select count(*) from public.chat_messages x
        where x.room_id = r.id and x.kind <> 'system' and x.deleted_at is null
          and x.created_at > me.last_read_at and x.sender_id is distinct from me.profile_id
          and (r.kind = 'brixa' or me.organization_id = r.organization_id or x.created_at >= me.joined_at)
          and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id)) else 0 end
    ) as row
    from public.chat_members me
    join public.chat_rooms r on r.id = me.room_id
    where me.profile_id = auth.uid() and me.status in ('active', 'invited')
      -- one office only: its conversation would be the agency's again
      and not (r.kind = 'office' and (select count(*) from public.offices o where o.organization_id = r.organization_id) < 2)
  ) rows;
$$;

-- the invited person's "since" is when they were asked: a request accepted keeps what came before
update public.chat_members m set joined_at = least(m.joined_at, r.created_at)
from public.chat_rooms r
where r.id = m.room_id and r.kind = 'direct' and m.status = 'invited';

-- ---------------------------------------------------------------------
-- A number on the app's icon (056)
-- ---------------------------------------------------------------------
create or replace function public.waiting_for(target uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*) from public.chat_members me
      join public.chat_rooms r on r.id = me.room_id
      join public.chat_messages x on x.room_id = me.room_id
      where me.profile_id = target and me.status = 'active' and not me.muted
        and not (r.kind = 'office' and (select count(*) from public.offices o where o.organization_id = r.organization_id) < 2)
        and x.kind <> 'system' and x.deleted_at is null
        and x.created_at > me.last_read_at and x.sender_id is distinct from me.profile_id
        and (r.kind = 'brixa' or me.organization_id = r.organization_id or x.created_at >= me.joined_at)
        and (x.kind not in ('client', 'deal') or x.organization_id = me.organization_id))
    + (select count(*) from public.chat_members where profile_id = target and status = 'invited')
    + (select count(*) from public.notifications
        where recipient_id = target and read_at is null and type not in ('chat_message', 'chat_invite'))
  )::int;
$$;

revoke execute on function public.waiting_for(uuid) from public, anon, authenticated;

drop function if exists public.claim_push(uuid, uuid);

create function public.claim_push(target uuid, token uuid)
returns table (
  type text, data jsonb, link text, endpoint text, p256dh text, auth_key text, lang text,
  phone text, email text, waiting int
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
    contact_phone, contact_email, public.waiting_for(claimed.recipient_id)
  from public.push_subscriptions s
  where s.profile_id = claimed.recipient_id;
end;
$$;

grant execute on function public.claim_push(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- BRIXA's own check of someone's notifications: their devices, the last notifications (made,
-- sent to the phone, read) and their conversations
-- ---------------------------------------------------------------------
create or replace function public.platform_push_check(target_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  who uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select id into who from public.profiles where lower(email) = lower(btrim(coalesce(target_email, '')));
  if who is null then return null; end if;
  return jsonb_build_object(
    'name', (select coalesce(full_name, email) from public.profiles where id = who),
    'agency', (select o.name from public.organization_members m join public.organizations o on o.id = m.organization_id
               where m.profile_id = who order by m.created_at limit 1),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('agent', user_agent, 'since', created_at) order by created_at desc)
      from public.push_subscriptions where profile_id = who), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object('type', n.type, 'made', n.created_at, 'pushed', n.pushed_at, 'read', n.read_at,
          'text', coalesce(n.data ->> 'text', n.data ->> 'title')) order by n.created_at desc)
      from (select * from public.notifications where recipient_id = who order by created_at desc limit 15) n), '[]'::jsonb),
    'chats', coalesce((
      select jsonb_agg(jsonb_build_object('kind', r.kind, 'title', r.title, 'status', m.status, 'muted', m.muted,
          'joined', m.joined_at, 'read', m.last_read_at,
          'with', (select string_agg(coalesce(p.full_name, p.email), ', ') from public.chat_members o join public.profiles p on p.id = o.profile_id
                   where o.room_id = r.id and o.profile_id <> who and o.status <> 'left')) order by r.kind)
      from public.chat_members m join public.chat_rooms r on r.id = m.room_id
      where m.profile_id = who and r.kind in ('direct', 'group')), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.platform_push_check(text) from public, anon;
grant execute on function public.platform_push_check(text) to authenticated;

-- ---------------------------------------------------------------------
-- Someone working alone keeps their clients (057)
-- ---------------------------------------------------------------------

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
      -- only when someone else could take the client (alone, "free" would just hide it)
      and exists (
        select 1 from public.organization_members m
        where m.organization_id = c.organization_id and m.profile_id <> c.responsible_broker_id
      )
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

revoke execute on function public.notify_follow_ups(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- A buyer's financing, the mortgage rates and market news for clients (058)
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- A buyer's financing
-- ---------------------------------------------------------------------
create table public.client_financing (
  client_id uuid primary key references public.clients (id) on delete cascade,
  -- null: not known yet
  loan text check (loan in ('approved', 'applying', 'none')),
  own_funds numeric(14, 2) check (own_funds is null or own_funds >= 0),
  bank_amount numeric(14, 2) check (bank_amount is null or bank_amount >= 0),
  -- we took them to the bank
  bank_referred boolean not null default false,
  bank_name text check (bank_name is null or char_length(bank_name) <= 80),
  -- what the bank pays us for them, and the day it came
  bank_fee numeric(14, 2) check (bank_fee is null or bank_fee >= 0),
  bank_fee_received_on date,
  updated_at timestamptz not null default now()
);

create trigger client_financing_touch_updated_at
  before update on public.client_financing
  for each row execute function public.touch_updated_at();

alter table public.client_financing enable row level security;

create policy "client financing: read" on public.client_financing
  for select to authenticated using (public.can_view_client(client_id));
create policy "client financing: insert" on public.client_financing
  for insert to authenticated with check (public.can_view_client(client_id));
create policy "client financing: update" on public.client_financing
  for update to authenticated
  using (public.can_view_client(client_id))
  with check (public.can_view_client(client_id));
create policy "client financing: delete" on public.client_financing
  for delete to authenticated using (public.can_view_client(client_id));

-- the clients who get a short market note every month (the broker chooses them)
alter table public.clients add column monthly_news boolean not null default false;

-- ---------------------------------------------------------------------
-- The average interest rate on new mortgages (BNB, through the ECB's data service)
-- ---------------------------------------------------------------------
create table public.mortgage_rates (
  -- the first day of the month
  month date primary key check (extract(day from month) = 1),
  -- % a year: new loans to households for house purchase, in euro
  rate numeric(5, 2) not null check (rate > 0 and rate < 30),
  fetched_at timestamptz not null default now()
);

alter table public.mortgage_rates enable row level security;

-- public statistics
create policy "mortgage rates: read" on public.mortgage_rates
  for select to anon, authenticated using (true);

-- the questions asked to the data service (pg_net brings the answer a moment later)
create table public.mortgage_rate_fetches (
  request_id bigint primary key,
  asked_at timestamptz not null default now(),
  status int,
  saved_at timestamptz
);

alter table public.mortgage_rate_fetches enable row level security;

-- The data service's answer (CSV: a header line, then one line a month) into the table.
create or replace function public.read_mortgage_rates(content text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  lines text[] := string_to_array(replace(coalesce(content, ''), E'\r', ''), E'\n');
  head text[] := string_to_array(lines[1], ',');
  at_month int := array_position(head, 'TIME_PERIOD');
  at_value int := array_position(head, 'OBS_VALUE');
  cells text[];
  i int;
  saved int := 0;
begin
  if at_month is null or at_value is null then
    return 0;
  end if;
  for i in 2 .. coalesce(array_length(lines, 1), 1) loop
    cells := string_to_array(lines[i], ',');
    if cells[at_month] ~ '^\d{4}-\d{2}$' and cells[at_value] ~ '^\d+(\.\d+)?$'
       and cells[at_value]::numeric > 0 and cells[at_value]::numeric < 30 then
      insert into public.mortgage_rates (month, rate)
      values ((cells[at_month] || '-01')::date, round(cells[at_value]::numeric, 2))
      on conflict (month) do update
        set rate = excluded.rate, fetched_at = now()
        where public.mortgage_rates.rate is distinct from excluded.rate;
      saved := saved + 1;
    end if;
  end loop;
  return saved;
end;
$$;

-- The answers that came back.
create or replace function public.save_mortgage_rates()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  answer record;
  saved int := 0;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return 0;
  end if;
  for answer in
    select f.request_id, r.status_code, r.content
    from public.mortgage_rate_fetches f
    join net._http_response r on r.id = f.request_id
    where f.saved_at is null
  loop
    if answer.status_code = 200 then
      saved := saved + public.read_mortgage_rates(answer.content);
    end if;
    update public.mortgage_rate_fetches
    set saved_at = now(), status = answer.status_code
    where request_id = answer.request_id;
  end loop;
  -- pg_net keeps its answers for six hours: older questions never get one
  delete from public.mortgage_rate_fetches
  where (saved_at is null and asked_at < now() - interval '1 day') or saved_at < now() - interval '60 days';
  return saved;
end;
$$;

-- Ask the data service for the last two years (the answer is read by save_mortgage_rates).
create or replace function public.fetch_mortgage_rates()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  request bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return null;
  end if;
  request := net.http_get(
    url := 'https://data-api.ecb.europa.eu/service/data/MIR/M.BG.B.A2C.A.R.A.2250.EUR.N?lastNObservations=24&format=csvdata&detail=dataonly',
    timeout_milliseconds := 30000
  );
  insert into public.mortgage_rate_fetches (request_id) values (request);
  return request;
end;
$$;

-- ---------------------------------------------------------------------
-- The market's history: the reference prices the agency keeps, every earlier value
-- ---------------------------------------------------------------------
create table public.market_price_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  operation text not null check (operation in ('sale', 'rent')),
  settlement_id uuid not null references public.geo_settlements (id) on delete cascade,
  neighborhood_id uuid references public.geo_neighborhoods (id) on delete cascade,
  price_per_sqm numeric(10, 2) not null,
  as_of date not null,
  replaced_at timestamptz not null default now()
);

create index market_price_history_place_idx
  on public.market_price_history (organization_id, settlement_id, neighborhood_id, as_of desc);

alter table public.market_price_history enable row level security;

create policy "market price history: read" on public.market_price_history
  for select to authenticated using (public.is_org_member(organization_id));

create or replace function public.keep_market_price_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_per_sqm is distinct from old.price_per_sqm then
    insert into public.market_price_history (organization_id, operation, settlement_id, neighborhood_id, price_per_sqm, as_of)
    values (old.organization_id, old.operation, old.settlement_id, old.neighborhood_id, old.price_per_sqm, old.as_of);
  end if;
  return new;
end;
$$;

create trigger market_prices_keep_history
  after update on public.market_prices
  for each row execute function public.keep_market_price_history();

-- How a neighbourhood's price per m² moved (sales): the reference price the agency keeps
-- against its value a month or more ago; else BRIXA's own daily numbers (the median of the
-- listings, at least six of them, a month to four months apart).
create or replace function public.neighborhood_trend(target_org uuid, target_settlement uuid, target_neighborhood uuid)
returns table (now_sqm numeric, then_sqm numeric, since date, listings int, source text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cur record;
  old record;
begin
  select m.price_per_sqm, m.as_of into cur
  from public.market_prices m
  where m.organization_id = target_org and m.operation = 'sale'
    and m.settlement_id = target_settlement and m.neighborhood_id is not distinct from target_neighborhood;
  if found then
    select h.price_per_sqm, h.as_of into old
    from public.market_price_history h
    where h.organization_id = target_org and h.operation = 'sale'
      and h.settlement_id = target_settlement and h.neighborhood_id is not distinct from target_neighborhood
      and h.as_of <= cur.as_of - 25 and h.as_of >= cur.as_of - 200
    order by h.as_of desc
    limit 1;
    if found then
      return query select cur.price_per_sqm, old.price_per_sqm, old.as_of, null::int, 'reference'::text;
      return;
    end if;
  end if;

  select d.day, d.listing_median, d.listings into cur
  from public.market_daily d
  where d.organization_id = target_org and d.operation = 'sale' and d.settlement_id = target_settlement
    and d.neighborhood_id is not distinct from target_neighborhood and d.subtype_id is null
    and d.listings >= 6 and d.listing_median is not null
  order by d.day desc
  limit 1;
  if not found or cur.day < public.sofia_today() - 7 then
    return;
  end if;
  select d.day, d.listing_median into old
  from public.market_daily d
  where d.organization_id = target_org and d.operation = 'sale' and d.settlement_id = target_settlement
    and d.neighborhood_id is not distinct from target_neighborhood and d.subtype_id is null
    and d.listings >= 6 and d.listing_median is not null
    and d.day <= cur.day - 28 and d.day >= cur.day - 120
  order by d.day
  limit 1;
  if found then
    return query select cur.listing_median, old.listing_median, old.day, cur.listings, 'listings'::text;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- News for clients: what BRIXA wrote, waiting in the broker's follow-up
-- ---------------------------------------------------------------------
create table public.client_news (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null check (kind in ('rates', 'prices', 'monthly')),
  -- the numbers it tells (the app writes the text, in the broker's language)
  data jsonb not null default '{}',
  created_on date not null default public.sofia_today(),
  sent_at timestamptz,
  skipped_at timestamptz,
  constraint client_news_once unique (client_id, kind, created_on)
);

create index client_news_org_idx on public.client_news (organization_id, created_on desc);
create index client_news_client_idx on public.client_news (client_id, created_on desc);

alter table public.client_news enable row level security;

create policy "client news: read" on public.client_news
  for select to authenticated using (public.can_view_client(client_id));

-- what started them, once each
create table public.market_news_events (
  key text primary key,
  created_at timestamptz not null default now()
);

alter table public.market_news_events enable row level security;

-- Sent (in one tap) or left out.
create or replace function public.settle_client_news(target uuid, sent boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_news n
  set sent_at = case when sent then now() end,
      skipped_at = case when sent then null else now() end
  where n.id = target and n.sent_at is null and n.skipped_at is null
    and public.can_view_client(n.client_id);
  return found;
end;
$$;

-- One notification per broker for the day's news of a kind.
create or replace function public.tell_market_news(today date, news_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  person record;
begin
  for person in
    select c.organization_id, c.responsible_broker_id as broker, count(*)::int as n,
      case when count(distinct n.data ->> 'area') = 1 then min(n.data ->> 'area') end as area
    from public.client_news n
    join public.clients c on c.id = n.client_id
    where n.kind = news_kind and n.created_on = today and n.sent_at is null and n.skipped_at is null
      and c.responsible_broker_id is not null
    group by c.organization_id, c.responsible_broker_id
  loop
    if not exists (
      select 1 from public.notifications x
      where x.recipient_id = person.broker and x.type = 'market_news' and x.data ->> 'kind' = news_kind
        and x.created_at > now() - interval '20 hours'
    ) then
      perform public.notify(
        person.organization_id, person.broker, null, 'market_news',
        jsonb_build_object('kind', news_kind, 'count', person.n, 'title', person.area),
        '/follow-up?view=news'
      );
    end if;
  end loop;
end;
$$;

-- The mortgage rates fell (by 0.10 points or more from the highest since the last such news,
-- or in the year before): the buyers who search for a home and don't pay in cash.
create or replace function public.make_rate_news(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  latest record;
  peak record;
  last_news date;
  made int := 0;
begin
  select m.month, m.rate into latest from public.mortgage_rates m order by m.month desc limit 1;
  -- nothing new from the BNB for months: no news
  if not found or latest.month < (date_trunc('month', today) - interval '4 months')::date then
    return 0;
  end if;
  if exists (select 1 from public.market_news_events where key = 'rates:' || to_char(latest.month, 'YYYY-MM')) then
    return 0;
  end if;
  select max(to_date(substr(e.key, 7), 'YYYY-MM')) into last_news
  from public.market_news_events e where e.key like 'rates:%';
  select m.month, m.rate into peak
  from public.mortgage_rates m
  where m.month < latest.month
    and m.month >= coalesce(last_news, (latest.month - interval '12 months')::date)
  order by m.rate desc, m.month desc
  limit 1;
  if not found or latest.rate > peak.rate - 0.10 then
    return 0;
  end if;

  insert into public.market_news_events (key) values ('rates:' || to_char(latest.month, 'YYYY-MM'));
  insert into public.client_news (organization_id, client_id, kind, data)
  select c.organization_id, c.id, 'rates',
    jsonb_build_object('from', peak.rate, 'fromMonth', to_char(peak.month, 'YYYY-MM'),
                       'to', latest.rate, 'toMonth', to_char(latest.month, 'YYYY-MM'))
  from public.clients c
  join public.client_searches s on s.client_id = c.id and s.operation = 'sale'
  left join public.client_financing f on f.client_id = c.id
  where c.responsible_broker_id is not null
    and c.stage not in ('deal', 'lost')
    and (c.phone is not null or c.email is not null)
    and c.types && array['buyer', 'investor']
    and f.loan is distinct from 'none'
    -- one piece of news at a time
    and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 14)
  on conflict do nothing;
  get diagnostics made = row_count;
  if made > 0 then
    perform public.tell_market_news(today, 'rates');
  end if;
  return made;
end;
$$;

-- A neighbourhood got pricier (3% or more): the clients who own a home there (with a listing,
-- an offer, or bought through us) and the buyers who search there. Once in two months a place.
create or replace function public.make_price_news(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  place record;
  trend record;
  change numeric;
  n int;
  made int := 0;
begin
  for place in
    with spots as (
      select c.organization_id, o.settlement_id, o.neighborhood_id
      from public.client_offers o join public.clients c on c.id = o.client_id
      where o.operation = 'sale' and o.neighborhood_id is not null
      union
      select p.organization_id, p.settlement_id, p.neighborhood_id
      from public.properties p
      where p.owner_client_id is not null and p.neighborhood_id is not null and p.status in ('active', 'reserved', 'withdrawn')
      union
      select d.organization_id, p.settlement_id, p.neighborhood_id
      from public.deals d join public.properties p on p.id = d.property_id
      where d.status = 'won' and d.kind = 'sale' and d.client_id is not null and p.neighborhood_id is not null
      union
      select c.organization_id, nb.settlement_id, nb.id
      from public.client_searches s
      join public.clients c on c.id = s.client_id
      join public.geo_neighborhoods nb on nb.id = any (s.neighborhood_ids)
      where s.operation = 'sale'
    )
    select distinct s.organization_id, s.settlement_id, s.neighborhood_id, nb.name as hood, st.name as town
    from spots s
    join public.geo_neighborhoods nb on nb.id = s.neighborhood_id
    join public.geo_settlements st on st.id = s.settlement_id
  loop
    if exists (
      select 1 from public.market_news_events e
      where e.key like 'prices:' || place.organization_id || ':' || place.neighborhood_id || ':%'
        and e.created_at > now() - interval '60 days'
    ) then
      continue;
    end if;
    select * into trend from public.neighborhood_trend(place.organization_id, place.settlement_id, place.neighborhood_id);
    if not found or trend.then_sqm is null or trend.then_sqm <= 0 then
      continue;
    end if;
    change := round((trend.now_sqm / trend.then_sqm - 1) * 100, 1);
    if change < 3 then
      continue;
    end if;

    insert into public.market_news_events (key)
    values ('prices:' || place.organization_id || ':' || place.neighborhood_id || ':' || today);
    insert into public.client_news (organization_id, client_id, kind, data)
    select distinct on (who.client_id) place.organization_id, who.client_id, 'prices',
      jsonb_build_object('role', who.role, 'area', place.hood, 'town', place.town, 'change', change,
                         'sqm', round(trend.now_sqm), 'since', trend.since, 'source', trend.source)
    from (
      select o.client_id, 'owner' as role, 1 as rank
      from public.client_offers o
      where o.neighborhood_id = place.neighborhood_id and o.operation = 'sale'
      union all
      select p.owner_client_id, 'owner', 1
      from public.properties p
      where p.organization_id = place.organization_id and p.neighborhood_id = place.neighborhood_id
        and p.owner_client_id is not null and p.status in ('active', 'reserved', 'withdrawn')
      union all
      select d.client_id, 'owner', 1
      from public.deals d join public.properties p on p.id = d.property_id
      where d.organization_id = place.organization_id and d.status = 'won' and d.kind = 'sale'
        and d.client_id is not null and p.neighborhood_id = place.neighborhood_id
      union all
      select s.client_id, 'buyer', 2
      from public.client_searches s
      where s.operation = 'sale' and place.neighborhood_id = any (s.neighborhood_ids)
    ) who
    join public.clients c on c.id = who.client_id
    where c.organization_id = place.organization_id
      and c.responsible_broker_id is not null
      and c.stage <> 'lost'
      and (who.role = 'owner' or c.stage <> 'deal')
      and (c.phone is not null or c.email is not null)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 14)
    order by who.client_id, who.rank
    on conflict do nothing;
    get diagnostics n = row_count;
    made := made + n;
  end loop;
  if made > 0 then
    perform public.tell_market_news(today, 'prices');
  end if;
  return made;
end;
$$;

-- The monthly note, for the clients the broker chose: every four weeks, the market where the
-- client owns or searches (BRIXA's numbers, or the agency's reference price) and the rates.
create or replace function public.make_monthly_news(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  client record;
  place record;
  listings_n int;
  trend record;
  rate_now record;
  rate_before numeric;
  sqm numeric;
  change numeric;
  made int := 0;
begin
  select m.month, m.rate into rate_now from public.mortgage_rates m order by m.month desc limit 1;
  if found then
    select m.rate into rate_before from public.mortgage_rates m
    where m.month = (rate_now.month - interval '3 months')::date;
  end if;

  for client in
    select c.id, c.organization_id
    from public.clients c
    where c.monthly_news and c.responsible_broker_id is not null and c.stage <> 'lost'
      and (c.phone is not null or c.email is not null)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.kind = 'monthly' and x.created_on > today - 28)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 7)
  loop
    -- where: a home they own (a listing, an offer, one bought through us), else where they search
    select x.settlement_id, x.neighborhood_id into place
    from (
      select p.settlement_id, p.neighborhood_id, 1 as rank
      from public.properties p
      where p.owner_client_id = client.id and p.settlement_id is not null and p.status in ('active', 'reserved', 'withdrawn')
      union all
      select o.settlement_id, o.neighborhood_id, 2 from public.client_offers o where o.client_id = client.id and o.settlement_id is not null
      union all
      select p.settlement_id, p.neighborhood_id, 3
      from public.deals d join public.properties p on p.id = d.property_id
      where d.client_id = client.id and d.status = 'won' and d.kind = 'sale' and p.settlement_id is not null
      union all
      select nb.settlement_id, nb.id, 4
      from public.client_searches s join public.geo_neighborhoods nb on nb.id = s.neighborhood_ids[1]
      where s.client_id = client.id
      union all
      select s.settlement_ids[1], null, 5
      from public.client_searches s
      where s.client_id = client.id and coalesce(array_length(s.settlement_ids, 1), 0) > 0
    ) x
    order by x.rank, x.neighborhood_id nulls last
    limit 1;

    sqm := null;
    change := null;
    listings_n := null;
    if place.settlement_id is not null then
      select d.listing_median, d.listings into sqm, listings_n
      from public.market_daily d
      where d.organization_id = client.organization_id and d.operation = 'sale'
        and d.settlement_id = place.settlement_id and d.neighborhood_id is not distinct from place.neighborhood_id
        and d.subtype_id is null and d.listings >= 3 and d.listing_median is not null
        and d.day >= today - 7
      order by d.day desc
      limit 1;
      if sqm is null then
        select m.price_per_sqm into sqm
        from public.market_prices m
        where m.organization_id = client.organization_id and m.operation = 'sale'
          and m.settlement_id = place.settlement_id and m.neighborhood_id is not distinct from place.neighborhood_id;
      end if;
      select * into trend from public.neighborhood_trend(client.organization_id, place.settlement_id, place.neighborhood_id);
      if found and trend.then_sqm > 0 then
        change := round((trend.now_sqm / trend.then_sqm - 1) * 100, 1);
      end if;
    end if;

    -- nothing to tell
    if sqm is null and rate_now.rate is null then
      continue;
    end if;

    insert into public.client_news (organization_id, client_id, kind, data)
    values (
      client.organization_id, client.id, 'monthly',
      jsonb_strip_nulls(jsonb_build_object(
        'area', case when sqm is not null then coalesce(
          (select nb.name from public.geo_neighborhoods nb where nb.id = place.neighborhood_id),
          (select st.name from public.geo_settlements st where st.id = place.settlement_id)) end,
        'sqm', round(sqm),
        'listings', listings_n,
        'change', change,
        'rate', rate_now.rate,
        'rateMonth', to_char(rate_now.month, 'YYYY-MM'),
        'rateBefore', rate_before
      ))
    )
    on conflict do nothing;
    if found then
      made := made + 1;
    end if;
  end loop;
  if made > 0 then
    perform public.tell_market_news(today, 'monthly');
  end if;
  return made;
end;
$$;

-- Every morning: the day's news.
create or replace function public.make_market_news()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.sofia_today();
begin
  return public.make_rate_news(today) + public.make_price_news(today) + public.make_monthly_news(today);
end;
$$;

revoke execute on function public.read_mortgage_rates(text) from public, anon, authenticated;
revoke execute on function public.save_mortgage_rates() from public, anon, authenticated;
revoke execute on function public.fetch_mortgage_rates() from public, anon, authenticated;
revoke execute on function public.keep_market_price_history() from public, anon, authenticated;
revoke execute on function public.neighborhood_trend(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.tell_market_news(date, text) from public, anon, authenticated;
revoke execute on function public.make_rate_news(date) from public, anon, authenticated;
revoke execute on function public.make_price_news(date) from public, anon, authenticated;
revoke execute on function public.make_monthly_news(date) from public, anon, authenticated;
revoke execute on function public.make_market_news() from public, anon, authenticated;
revoke execute on function public.settle_client_news(uuid, boolean) from public, anon;
grant execute on function public.settle_client_news(uuid, boolean) to authenticated;

-- ask every morning at 7:00 (Sofia), read the answers every hour, and the news at 8:30
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-rates-ask', '0 4 * * *', 'select public.fetch_mortgage_rates()');
    perform cron.schedule('brixa-rates-read', '5 * * * *', 'select public.save_mortgage_rates()');
    perform cron.schedule('brixa-market-news', '30 5 * * *', 'select public.make_market_news()');
  end if;
end;
$$;

-- the rates now (their answer is read within the hour)
select public.fetch_mortgage_rates();

-- ---------------------------------------------------------------------
-- The sample data leaves no notifications behind (059)
-- ---------------------------------------------------------------------
create or replace function public.remove_sample_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  since date;
begin
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at limit 1;
  if org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select sample_since into since from public.organizations where id = org;

  perform set_config('brixa.importing', 'on', true);
  -- what BRIXA said about the samples: anything leading to one of them, and the notes naming them
  delete from public.notifications n
  where n.organization_id = org
    and (
      n.link ~ any (array(
        select '^/properties/' || id::text from public.properties where organization_id = org and sample
        union all
        select '^/clients/' || id::text from public.clients where organization_id = org and sample
        union all
        select '^/tasks/' || t.id::text from public.tasks t
        where t.organization_id = org
          and (t.sample
            or t.property_id in (select id from public.properties where organization_id = org and sample)
            or t.client_id in (select id from public.clients where organization_id = org and sample))
        union all
        select '^/deals/' || d.id::text from public.deals d
        where d.organization_id = org
          and (d.sample
            or d.property_id in (select id from public.properties where organization_id = org and sample)
            or d.client_id in (select id from public.clients where organization_id = org and sample))
      ))
      or (since is not null and n.created_at >= since
          and (n.data::text like '%(пример)%' or n.data::text like '%Пример:%'))
    );
  -- the tasks and calls about a sample (BRIXA's own too, like a listing's marketing)
  delete from public.tasks t
  where t.organization_id = org
    and (t.sample
      or t.property_id in (select id from public.properties where organization_id = org and sample)
      or t.client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.activities a
  where a.organization_id = org
    and (a.sample
      or a.property_id in (select id from public.properties where organization_id = org and sample)
      or a.client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.deals
  where organization_id = org
    and (sample
      or property_id in (select id from public.properties where organization_id = org and sample)
      or client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.properties where organization_id = org and sample;
  delete from public.clients where organization_id = org and sample;

  -- the market's days counted with the samples in
  if since is not null then
    delete from public.market_daily where organization_id = org and day >= since;
  end if;
  update public.organizations set sample_since = null where id = org;
  -- the real listings' stars without the samples around them
  perform public.refresh_org_stars(org);
end;
$$;

revoke execute on function public.remove_sample_data() from public, anon;
grant execute on function public.remove_sample_data() to authenticated;

-- once: the leftovers where the samples are already gone (their tasks and deals no longer exist)
delete from public.notifications n
using public.organizations o
where o.id = n.organization_id
  and o.sample_since is null
  and (n.data::text like '%(пример)%' or n.data::text like '%Пример:%')
  and (
    n.link is null
    or n.link !~ '^/(tasks|deals|properties|clients)/'
    or (n.link ~ '^/tasks/' and not exists (select 1 from public.tasks t where '/tasks/' || t.id::text = substring(n.link from '^/tasks/[0-9a-f-]{36}')))
    or (n.link ~ '^/deals/' and not exists (select 1 from public.deals d where '/deals/' || d.id::text = substring(n.link from '^/deals/[0-9a-f-]{36}')))
    or (n.link ~ '^/properties/' and not exists (select 1 from public.properties p where '/properties/' || p.id::text = substring(n.link from '^/properties/[0-9a-f-]{36}')))
    or (n.link ~ '^/clients/' and not exists (select 1 from public.clients c where '/clients/' || c.id::text = substring(n.link from '^/clients/[0-9a-f-]{36}')))
  );

-- ---------------------------------------------------------------------
-- The follow-up lanes A, B, C (060)
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- Qualifying a client
-- ---------------------------------------------------------------------
alter table public.clients
  -- when they'll buy or sell: within 30 days, in 1–3 months, later (or not in a hurry)
  add column timeline text check (timeline in ('now', 'soon', 'later')),
  -- who decides: they alone, with a partner, others too (parents, a company…)
  add column decider text check (decider in ('alone', 'partner', 'others')),
  -- why: what moves them
  add column motive text check (motive is null or char_length(motive) <= 300),
  -- since when in this lane (the lane's path counts its days from here)
  add column class_since timestamptz;

create or replace function public.mark_class_since()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.class_since := coalesce(new.class_since, now());
  elsif new.client_class is distinct from old.client_class then
    new.class_since := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.mark_class_since() from public, anon, authenticated;

create trigger clients_class_since
  before insert or update of client_class on public.clients
  for each row execute function public.mark_class_since();

-- ---------------------------------------------------------------------
-- The lanes' messages, in the same list as the market news
-- ---------------------------------------------------------------------
alter table public.client_news drop constraint client_news_kind_check;
alter table public.client_news add constraint client_news_kind_check
  check (kind in ('rates', 'prices', 'monthly', 'warm_analysis', 'warm_rates', 'warm_call', 'tips', 'breakup'));

-- When the client last answered: a meeting or viewing, a call that got through, a link opened, a survey.
create or replace function public.client_last_reply(target uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    (select max(a.occurred_at) from public.activities a
     where a.client_id = target and (a.type in ('meeting', 'viewing') or (a.type = 'call' and a.outcome is not null))),
    (select max(e.occurred_at) from public.share_events e where e.client_id = target),
    (select max(r.received_at) from public.lead_form_responses r where r.client_id = target)
  );
$$;

-- The break-up message went out and they haven't answered since: the lanes leave them alone.
create or replace function public.client_closed(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_news n
    where n.client_id = target and n.kind = 'breakup' and n.sent_at is not null
      and coalesce(public.client_last_reply(target), '-infinity'::timestamptz) < n.sent_at
  );
$$;

-- The market where a client owns or searches: the area, € per m², the listings, the change (%).
create or replace function public.client_market(target_client uuid, today date)
returns table (area text, sqm numeric, listings int, change numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org uuid;
  place record;
  trend record;
  v_sqm numeric;
  v_listings int;
  v_change numeric;
begin
  select c.organization_id into org from public.clients c where c.id = target_client;
  -- a home they own (a listing, an offer, one bought through us), else where they search
  select x.settlement_id, x.neighborhood_id into place
  from (
    select p.settlement_id, p.neighborhood_id, 1 as rank
    from public.properties p
    where p.owner_client_id = target_client and p.settlement_id is not null and p.status in ('active', 'reserved', 'withdrawn')
    union all
    select o.settlement_id, o.neighborhood_id, 2 from public.client_offers o where o.client_id = target_client and o.settlement_id is not null
    union all
    select p.settlement_id, p.neighborhood_id, 3
    from public.deals d join public.properties p on p.id = d.property_id
    where d.client_id = target_client and d.status = 'won' and d.kind = 'sale' and p.settlement_id is not null
    union all
    select nb.settlement_id, nb.id, 4
    from public.client_searches s join public.geo_neighborhoods nb on nb.id = s.neighborhood_ids[1]
    where s.client_id = target_client
    union all
    select s.settlement_ids[1], null, 5
    from public.client_searches s
    where s.client_id = target_client and coalesce(array_length(s.settlement_ids, 1), 0) > 0
  ) x
  order by x.rank, x.neighborhood_id nulls last
  limit 1;
  if place.settlement_id is null then
    return;
  end if;

  select d.listing_median, d.listings into v_sqm, v_listings
  from public.market_daily d
  where d.organization_id = org and d.operation = 'sale'
    and d.settlement_id = place.settlement_id and d.neighborhood_id is not distinct from place.neighborhood_id
    and d.subtype_id is null and d.listings >= 3 and d.listing_median is not null
    and d.day >= today - 7
  order by d.day desc
  limit 1;
  if v_sqm is null then
    select m.price_per_sqm into v_sqm
    from public.market_prices m
    where m.organization_id = org and m.operation = 'sale'
      and m.settlement_id = place.settlement_id and m.neighborhood_id is not distinct from place.neighborhood_id;
  end if;
  if v_sqm is null then
    return;
  end if;
  select * into trend from public.neighborhood_trend(org, place.settlement_id, place.neighborhood_id);
  if found and trend.then_sqm > 0 then
    v_change := round((trend.now_sqm / trend.then_sqm - 1) * 100, 1);
  end if;
  return query select
    coalesce((select nb.name from public.geo_neighborhoods nb where nb.id = place.neighborhood_id),
             (select st.name from public.geo_settlements st where st.id = place.settlement_id)),
    round(v_sqm), v_listings, v_change;
end;
$$;

-- One notification per broker for the day's news of a kind ('lanes': all the lanes' messages).
create or replace function public.tell_market_news(today date, news_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  person record;
begin
  for person in
    select c.organization_id, c.responsible_broker_id as broker, count(*)::int as n,
      case when count(distinct n.data ->> 'area') = 1 then min(n.data ->> 'area') end as area
    from public.client_news n
    join public.clients c on c.id = n.client_id
    where (n.kind = news_kind
           or (news_kind = 'lanes' and n.kind in ('warm_analysis', 'warm_rates', 'warm_call', 'tips', 'breakup')))
      and n.created_on = today and n.sent_at is null and n.skipped_at is null
      and c.responsible_broker_id is not null
    group by c.organization_id, c.responsible_broker_id
  loop
    if not exists (
      select 1 from public.notifications x
      where x.recipient_id = person.broker and x.type = 'market_news' and x.data ->> 'kind' = news_kind
        and x.created_at > now() - interval '20 hours'
    ) then
      perform public.notify(
        person.organization_id, person.broker, null, 'market_news',
        jsonb_build_object('kind', news_kind, 'count', person.n, 'title', person.area),
        '/follow-up?view=news'
      );
    end if;
  end loop;
end;
$$;

-- The monthly note: the clients the broker chose, and lane C's from the 15th (every four weeks).
create or replace function public.make_monthly_news(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  client record;
  market record;
  rate_now record;
  rate_before numeric;
  made int := 0;
begin
  select m.month, m.rate into rate_now from public.mortgage_rates m order by m.month desc limit 1;
  if found then
    select m.rate into rate_before from public.mortgage_rates m
    where m.month = (rate_now.month - interval '3 months')::date;
  end if;

  for client in
    select c.id, c.organization_id
    from public.clients c
    where (c.monthly_news or (c.client_class = 'C' and extract(day from today) >= 15))
      and c.responsible_broker_id is not null and c.stage <> 'lost'
      and (c.phone is not null or c.email is not null)
      and not public.client_closed(c.id)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.kind = 'monthly' and x.created_on > today - 28)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 7)
  loop
    select * into market from public.client_market(client.id, today);
    if market.area is null and rate_now.rate is null then
      continue;
    end if;
    insert into public.client_news (organization_id, client_id, kind, data)
    values (
      client.organization_id, client.id, 'monthly',
      jsonb_strip_nulls(jsonb_build_object(
        'area', market.area, 'sqm', market.sqm, 'listings', market.listings, 'change', market.change,
        'rate', rate_now.rate, 'rateMonth', to_char(rate_now.month, 'YYYY-MM'), 'rateBefore', rate_before
      ))
    )
    on conflict do nothing;
    if found then
      made := made + 1;
    end if;
  end loop;
  if made > 0 then
    perform public.tell_market_news(today, 'monthly');
  end if;
  return made;
end;
$$;

-- The lanes' paths: B's 30 days (analysis, rates, a call), C's tip on the 1st, and the break-up after six quiet months.
create or replace function public.make_lane_news(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  client record;
  market record;
  rate_now record;
  rate_before numeric;
  start date;
  buyer boolean;
  made int := 0;
  done_today boolean;
begin
  select m.month, m.rate into rate_now from public.mortgage_rates m order by m.month desc limit 1;
  if found then
    select m.rate into rate_before from public.mortgage_rates m
    where m.month = (rate_now.month - interval '3 months')::date;
  end if;

  -- ---- B: every 30 days in the lane — day 1 an analysis, day 14 the rates, day 30 a call
  for client in
    select c.id, c.organization_id, c.types, c.class_since
    from public.clients c
    where c.client_class = 'B' and c.responsible_broker_id is not null and c.stage not in ('deal', 'lost')
      and (c.phone is not null or c.email is not null)
      and not public.client_closed(c.id)
      -- a few days between two messages
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 3)
  loop
    -- the clients there before the lanes: their paths start spread over a month, not all on one day
    start := coalesce(client.class_since, now() - make_interval(days => ((hashtext(client.id::text)::bigint % 30 + 30) % 30)::int))::date;
    start := start + 30 * ((today - start) / 30);
    buyer := client.types && array['buyer', 'investor', 'tenant'];
    done_today := false;
    if not exists (select 1 from public.client_news x where x.client_id = client.id and x.kind = 'warm_analysis' and x.created_on >= start) then
      select * into market from public.client_market(client.id, today);
      if market.area is not null then
        insert into public.client_news (organization_id, client_id, kind, data)
        values (client.organization_id, client.id, 'warm_analysis',
          jsonb_strip_nulls(jsonb_build_object('area', market.area, 'sqm', market.sqm, 'listings', market.listings, 'change', market.change)))
        on conflict do nothing;
        done_today := found;
      end if;
    end if;
    if not done_today and today >= start + 13 and rate_now.rate is not null
       and not exists (select 1 from public.client_news x where x.client_id = client.id and x.kind = 'warm_rates' and x.created_on >= start) then
      insert into public.client_news (organization_id, client_id, kind, data)
      values (client.organization_id, client.id, 'warm_rates',
        jsonb_strip_nulls(jsonb_build_object('role', case when buyer then 'buyer' else 'owner' end,
          'rate', rate_now.rate, 'rateMonth', to_char(rate_now.month, 'YYYY-MM'), 'rateBefore', rate_before)))
      on conflict do nothing;
      done_today := found;
    end if;
    if not done_today and today >= start + 29
       and not exists (select 1 from public.client_news x where x.client_id = client.id and x.kind = 'warm_call' and x.created_on >= start) then
      insert into public.client_news (organization_id, client_id, kind, data)
      values (client.organization_id, client.id, 'warm_call',
        jsonb_strip_nulls(jsonb_build_object('rate', rate_now.rate)))
      on conflict do nothing;
      done_today := found;
    end if;
    if done_today then
      made := made + 1;
    end if;
  end loop;

  -- ---- C (the sphere and past clients too): a useful tip once a month
  insert into public.client_news (organization_id, client_id, kind, data)
  select c.organization_id, c.id, 'tips', jsonb_build_object('month', to_char(today, 'YYYY-MM'))
  from public.clients c
  where c.client_class = 'C' and c.responsible_broker_id is not null and c.stage <> 'lost'
    and (c.phone is not null or c.email is not null)
    and not public.client_closed(c.id)
    and not exists (select 1 from public.client_news x where x.client_id = c.id and x.kind = 'tips' and x.created_on >= date_trunc('month', today)::date)
    and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 3)
  on conflict do nothing;

  -- ---- six months without an answer, though the broker kept in touch: the break-up
  insert into public.client_news (organization_id, client_id, kind, data)
  select c.organization_id, c.id, 'breakup', '{}'::jsonb
  from public.clients c
  where c.responsible_broker_id is not null and c.stage not in ('deal', 'lost')
    and (c.phone is not null or c.email is not null)
    and c.created_at < now() - interval '180 days'
    and coalesce(public.client_last_reply(c.id), c.created_at) < now() - interval '180 days'
    and exists (
      select 1 from public.activities a
      where a.client_id = c.id and a.type in ('call', 'message', 'email') and a.occurred_at > now() - interval '180 days'
    )
    and not exists (select 1 from public.client_news x where x.client_id = c.id and x.kind = 'breakup' and x.created_on > today - 180)
    and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on = today)
  on conflict do nothing;

  -- all of today's lane messages, one notification each broker
  if exists (
    select 1 from public.client_news n
    where n.created_on = today and n.kind in ('warm_analysis', 'warm_rates', 'warm_call', 'tips', 'breakup')
  ) then
    perform public.tell_market_news(today, 'lanes');
  end if;
  return (select count(*)::int from public.client_news n
          where n.created_on = today and n.kind in ('warm_analysis', 'warm_rates', 'warm_call', 'tips', 'breakup'));
end;
$$;

-- ---------------------------------------------------------------------
-- Holidays: drop by with a small present (lane C, the sphere, past clients)
-- ---------------------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_occasion_check;
alter table public.tasks add constraint tasks_occasion_check
  check (occasion is null or occasion in ('birthday', 'anniversary', 'marketing', 'holiday'));

-- Orthodox Easter (the Julian date, moved to the Gregorian calendar: 1900–2099).
create or replace function public.orthodox_easter(year int)
returns date
language sql
immutable
as $$
  with v as (
    select (19 * (year % 19) + 15) % 30 as d, year % 4 as a, year % 7 as b
  ), w as (
    select d, (2 * a + 4 * b - d + 34) % 7 as e from v
  )
  select make_date(year, ((d + e + 114) / 31)::int, (((d + e + 114) % 31) + 1)::int) + 13
  from w;
$$;

create or replace function public.make_holiday_tasks(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from today);
  holiday record;
  person record;
  made int := 0;
begin
  for holiday in
    select * from (values
      ('Баба Марта', make_date(y, 3, 1), 'мартеничка'),
      ('Великден', public.orthodox_easter(y), 'шоколадово яйце или козунак'),
      ('Коледа', make_date(y, 12, 25), 'малък коледен подарък')
    ) as h(name, day, present)
  loop
    -- three days before, once
    if today <> holiday.day - 3 then
      continue;
    end if;
    for person in
      select c.organization_id, c.responsible_broker_id as broker, count(*)::int as n,
        string_agg(c.full_name || coalesce(' (' || c.phone || ')', ''), ', ' order by c.full_name) as names
      from public.clients c
      where c.responsible_broker_id is not null and c.stage <> 'lost'
        and (c.client_class = 'C'
             or exists (select 1 from public.contact_programs p where p.client_id = c.id and p.status = 'active' and p.program in ('sphere', 'after_deal')))
        and not public.client_closed(c.id)
      group by c.organization_id, c.responsible_broker_id
    loop
      if exists (select 1 from public.tasks t where t.assigned_to = person.broker and t.occasion = 'holiday' and t.due_date = holiday.day - 1) then
        continue;
      end if;
      insert into public.tasks (organization_id, assigned_to, created_by, title, type, due_date, description, occasion)
      values (
        person.organization_id, person.broker, null,
        left(holiday.name || ': малък подарък за ' || person.n || ' клиенти', 200),
        'meeting', holiday.day - 1,
        left('Кратко посещение или ' || holiday.present || ' — за да ви помнят, когато потрябва брокер. '
          || 'Клиенти: ' || person.names, 2000),
        'holiday'
      );
      made := made + 1;
    end loop;
  end loop;
  return made;
end;
$$;

-- Every morning: the market's news, the lanes' paths, the holidays.
create or replace function public.make_market_news()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.sofia_today();
begin
  return public.make_rate_news(today) + public.make_price_news(today) + public.make_monthly_news(today)
    + public.make_lane_news(today) + public.make_holiday_tasks(today);
end;
$$;

-- ---------------------------------------------------------------------
-- Speed to lead: a listing on the market (or cheaper) that fits a hot client
-- ---------------------------------------------------------------------
create table public.listing_events (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties (id) on delete cascade,
  kind text not null check (kind in ('new', 'cheaper')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create index listing_events_waiting_idx on public.listing_events (created_at) where handled_at is null;

alter table public.listing_events enable row level security;

-- who was told about which listing (once)
create table public.lead_alerts (
  client_id uuid not null references public.clients (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (client_id, property_id, kind)
);

alter table public.lead_alerts enable row level security;

create or replace function public.note_listing_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- not the samples, not a bulk import
  if new.sample or coalesce(current_setting('brixa.importing', true), '') = 'on' then
    return new;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    insert into public.listing_events (property_id, kind) values (new.id, 'new');
  elsif tg_op = 'UPDATE' and new.status = 'active' and new.currency = old.currency
        and new.current_price < old.current_price then
    insert into public.listing_events (property_id, kind) values (new.id, 'cheaper');
  end if;
  return new;
end;
$$;

revoke execute on function public.note_listing_event() from public, anon, authenticated;

create trigger properties_listing_event
  after insert or update of status, current_price on public.properties
  for each row execute function public.note_listing_event();

-- Does a listing fit a client's search? (as the app's matching: the budget may be 10% over)
create or replace function public.listing_fits(target_property uuid, target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties p
    join public.client_searches s on s.client_id = target_client
    where p.id = target_property
      and p.operation_type = s.operation
      and (cardinality(s.subtype_ids) = 0 or p.subtype_id = any (s.subtype_ids))
      and (cardinality(s.settlement_ids) = 0 or p.settlement_id = any (s.settlement_ids))
      -- neighbourhoods picked in the listing's town: it must be in one of them
      and (not exists (select 1 from public.geo_neighborhoods nb where nb.id = any (s.neighborhood_ids) and nb.settlement_id = p.settlement_id)
           or p.neighborhood_id = any (s.neighborhood_ids))
      and (cardinality(s.feature_ids) = 0 or not exists (
            select 1 from unnest(s.feature_ids) f(id)
            where not exists (select 1 from public.property_feature_values v where v.property_id = p.id and v.feature_id = f.id)))
      and (s.budget_max is null or p.current_price is null
           or (p.currency = s.currency and p.current_price <= s.budget_max * 1.1)
           or (p.currency in ('EUR', 'BGN') and s.currency in ('EUR', 'BGN')
               and public.to_eur(p.current_price, p.currency) <= public.to_eur(s.budget_max, s.currency) * 1.1)
           or (p.currency <> s.currency and not (p.currency in ('EUR', 'BGN') and s.currency in ('EUR', 'BGN'))))
      and (p.area is null or ((s.area_min is null or p.area >= s.area_min) and (s.area_max is null or p.area <= s.area_max)))
      and (p.rooms is null or ((s.rooms_min is null or p.rooms >= s.rooms_min) and (s.rooms_max is null or p.rooms <= s.rooms_max)))
  );
$$;

-- Every minute: the listings that came on the market or got cheaper (a minute ago, so their
-- extras are saved too) → the hot clients they fit → their brokers, at once.
create or replace function public.speed_to_lead()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
  hit record;
  made int := 0;
begin
  for ev in
    select e.id, e.kind, p.id as property_id, p.organization_id, p.title, p.owner_client_id
    from public.listing_events e
    join public.properties p on p.id = e.property_id
    where e.handled_at is null and e.created_at < now() - interval '50 seconds' and p.status = 'active'
    order by e.created_at
    limit 50
  loop
    update public.listing_events set handled_at = now() where id = ev.id;
    for hit in
      select c.id, c.full_name, c.responsible_broker_id
      from public.clients c
      where c.organization_id = ev.organization_id and c.client_class = 'A'
        and c.responsible_broker_id is not null and c.stage not in ('deal', 'lost')
        and c.id is distinct from ev.owner_client_id
        and public.listing_fits(ev.property_id, c.id)
      order by c.updated_at desc
      limit 20
    loop
      insert into public.lead_alerts (client_id, property_id, kind) values (hit.id, ev.property_id, ev.kind)
      on conflict do nothing;
      if found then
        perform public.notify(
          ev.organization_id, hit.responsible_broker_id, null, 'speed_to_lead',
          jsonb_build_object('title', hit.full_name, 'property', ev.title, 'kind', ev.kind),
          '/clients/' || hit.id
        );
        made := made + 1;
      end if;
    end loop;
  end loop;
  -- what's done and old
  delete from public.listing_events where handled_at < now() - interval '7 days';
  -- a listing that never became active again: forget it after a day
  update public.listing_events set handled_at = now() where handled_at is null and created_at < now() - interval '1 day';
  return made;
end;
$$;

-- A push about a client (not only a task's) can call or Viber them straight from the phone.
create or replace function public.claim_push(target uuid, token uuid)
returns table (
  type text, data jsonb, link text, endpoint text, p256dh text, auth_key text, lang text,
  phone text, email text, waiting int
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
  elsif claimed.link ~ '^/clients/[0-9a-f-]{36}$' then
    select c.phone, c.email into contact_phone, contact_email
    from public.clients c
    where c.id = substr(claimed.link, 10)::uuid
      and (
        c.responsible_broker_id = claimed.recipient_id
        or public.oversees_as(claimed.recipient_id, c.responsible_broker_id)
      );
  end if;

  return query
  select claimed.type, claimed.data, claimed.link, s.endpoint, s.p256dh, s.auth_key, s.lang,
    contact_phone, contact_email, public.waiting_for(claimed.recipient_id)
  from public.push_subscriptions s
  where s.profile_id = claimed.recipient_id;
end;
$$;

grant execute on function public.claim_push(uuid, uuid) to anon, authenticated;

revoke execute on function public.client_last_reply(uuid) from public, anon, authenticated;
revoke execute on function public.client_closed(uuid) from public, anon, authenticated;
revoke execute on function public.client_market(uuid, date) from public, anon, authenticated;
revoke execute on function public.tell_market_news(date, text) from public, anon, authenticated;
revoke execute on function public.make_monthly_news(date) from public, anon, authenticated;
revoke execute on function public.make_lane_news(date) from public, anon, authenticated;
revoke execute on function public.make_holiday_tasks(date) from public, anon, authenticated;
revoke execute on function public.make_market_news() from public, anon, authenticated;
revoke execute on function public.listing_fits(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.speed_to_lead() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-speed-to-lead', '* * * * *', 'select public.speed_to_lead()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- The sample data shows the lanes and the news (061)
-- ---------------------------------------------------------------------
create or replace function public.enrich_sample_data()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  done int := 0;
  rate_now record;
  rate_peak record;
  analysis record;
begin
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at limit 1;
  if org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- when, who decides, why — the lane follows the "when"
  update public.clients c
  set timeline = v.timeline, decider = v.decider, motive = v.motive, client_class = v.lane
  from (values
    ('Мария Иванова (пример)', 'now', 'partner', 'Иска да се нанесе до лятото', 'A'),
    ('Георги Петров (пример)', 'soon', 'partner', 'Второ дете — тясно им е', 'B'),
    ('Елена Димитрова (пример)', 'now', 'alone', 'Започва нова работа наблизо', 'A'),
    ('Николай Стоянов (пример)', 'later', 'alone', 'Инвестиция за отдаване под наем', 'C'),
    ('Иван Колев (пример)', 'now', 'partner', 'Купили са къща и трябва да продадат', 'A'),
    ('Десислава Тодорова (пример)', 'soon', 'alone', 'Сменя наемателите', 'B'),
    ('Петър Василев (пример)', 'soon', 'others', 'Наследство — решават заедно с братята', 'B'),
    ('Анна Георгиева (пример)', 'later', 'alone', 'Още разглежда', 'C')
  ) as v(name, timeline, decider, motive, lane)
  where c.organization_id = org and c.sample and c.full_name = v.name;
  get diagnostics done = row_count;

  -- how the buyers pay
  insert into public.client_financing (client_id, loan, own_funds, bank_amount, bank_referred, bank_name)
  select c.id, v.loan, v.own, v.bank, v.referred, v.bank_name
  from public.clients c
  join (values
    ('Мария Иванова (пример)', 'approved', 40000::numeric, 110000::numeric, true, 'Банка ДСК'),
    ('Георги Петров (пример)', 'applying', 30000::numeric, 150000::numeric, false, null),
    ('Николай Стоянов (пример)', 'none', 90000::numeric, null::numeric, false, null)
  ) as v(name, loan, own, bank, referred, bank_name) on v.name = c.full_name
  where c.organization_id = org and c.sample
  on conflict (client_id) do nothing;

  -- a few ready messages in Follow-up → News
  select m.month, m.rate into rate_now from public.mortgage_rates m order by m.month desc limit 1;
  if found then
    select m.month, m.rate into rate_peak from public.mortgage_rates m
    where m.month < rate_now.month and m.month >= (rate_now.month - interval '12 months')::date
    order by m.rate desc, m.month desc limit 1;
    if found and rate_peak.rate > rate_now.rate then
      insert into public.client_news (organization_id, client_id, kind, data)
      select org, c.id, 'rates',
        jsonb_build_object('from', rate_peak.rate, 'fromMonth', to_char(rate_peak.month, 'YYYY-MM'),
                           'to', rate_now.rate, 'toMonth', to_char(rate_now.month, 'YYYY-MM'))
      from public.clients c
      where c.organization_id = org and c.sample and c.full_name = 'Мария Иванова (пример)'
      on conflict do nothing;
    end if;
  end if;

  -- the warm buyer's area: the samples' own listings there
  select nb.name as area, round(avg(p.current_price / nullif(p.area, 0))) as sqm, count(*)::int as listings
  into analysis
  from public.properties p
  join public.geo_neighborhoods nb on nb.id = p.neighborhood_id
  where p.organization_id = org and p.sample and p.operation_type = 'sale' and p.area > 0
  group by nb.name
  order by count(*) desc, nb.name
  limit 1;
  if analysis.area is not null then
    insert into public.client_news (organization_id, client_id, kind, data)
    select org, c.id, 'warm_analysis', jsonb_build_object('area', analysis.area, 'sqm', analysis.sqm)
    from public.clients c
    where c.organization_id = org and c.sample and c.full_name = 'Георги Петров (пример)'
    on conflict do nothing;
  end if;

  insert into public.client_news (organization_id, client_id, kind, data)
  select org, c.id, 'tips', jsonb_build_object('month', to_char(public.sofia_today(), 'YYYY-MM'))
  from public.clients c
  where c.organization_id = org and c.sample and c.full_name = 'Анна Георгиева (пример)'
  on conflict do nothing;

  return done;
end;
$$;

revoke execute on function public.enrich_sample_data() from public, anon;
grant execute on function public.enrich_sample_data() to authenticated;

-- ---------------------------------------------------------------------
-- The documents for selling a property (062)
-- ---------------------------------------------------------------------
create table public.sale_docs (
  code text primary key,
  sort int not null default 0,
  -- when it's needed: always, inheritance, new_build, house_land, mortgage, buyer_loan, spouse, proxy
  cases text[] not null default '{always}',
  issuer text not null check (issuer in ('owner', 'municipality', 'cadastre', 'registry', 'notary', 'bank', 'other')),
  title text not null check (char_length(title) <= 200),
  about text check (about is null or char_length(about) <= 1000),
  fee text check (fee is null or char_length(fee) <= 300),
  term text check (term is null or char_length(term) <= 300),
  validity text check (validity is null or char_length(validity) <= 500),
  online text check (online is null or char_length(online) <= 300),
  updated_at timestamptz not null default now()
);

create table public.sale_offices (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  kind text not null check (kind in ('cadastre', 'registry', 'municipality')),
  name text not null check (char_length(name) <= 200),
  address text check (address is null or char_length(address) <= 300),
  phone text check (phone is null or char_length(phone) <= 100),
  -- the municipality's: the tax valuation's fee and time there
  fee text check (fee is null or char_length(fee) <= 300),
  term text check (term is null or char_length(term) <= 300),
  updated_at timestamptz not null default now(),
  constraint sale_offices_one unique (city, kind)
);

create trigger sale_docs_touch_updated_at before update on public.sale_docs
  for each row execute function public.touch_updated_at();
create trigger sale_offices_touch_updated_at before update on public.sale_offices
  for each row execute function public.touch_updated_at();

alter table public.sale_docs enable row level security;
alter table public.sale_offices enable row level security;

-- everyone in BRIXA reads them; BRIXA's owner keeps them up to date
create policy "sale docs: read" on public.sale_docs for select to authenticated using (true);
create policy "sale docs: platform edits" on public.sale_docs for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "sale offices: read" on public.sale_offices for select to authenticated using (true);
create policy "sale offices: platform edits" on public.sale_offices for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

insert into public.sale_docs (code, sort, cases, issuer, title, about, fee, term, validity, online) values
  ('title_deed', 10, array['always'], 'owner', 'Документ за собственост', 'Нотариалният акт или другият документ, с който продавачът е станал собственик (договор, дарение, съдебно решение, делба). Ако е изгубен — заверен препис от Службата по вписванията.', null, null, null, null),
  ('id_cards', 20, array['always'], 'owner', 'Лични карти на продавачите', 'Всички собственици подписват при нотариуса — лично или чрез пълномощник.', null, null, null, null),
  ('tax_valuation', 30, array['always'], 'municipality', 'Удостоверение за данъчна оценка (чл. 264, ал. 1 ДОПК)', 'Нотариусът го изисква при всяка продажба. Показва и дали данъкът и таксата за смет за имота са платени. Вади се от общината, в която е имотът — независимо къде живее собственикът.', 'по тарифата на общината', 'по тарифата на общината', 'Издадено до 30 юни — важи до 30 юни; издадено след това — до края на годината. Ако данъците за цялата година са платени и това е вписано — до края на годината.', 'Може и онлайн през egov.bg (услуга 2396), с електронен подпис.'),
  ('cadastre_scheme', 40, array['always'], 'cadastre', 'Схема на самостоятелен обект (апартамент, офис, гараж)', 'Издава се от кадастъра, когато за мястото има одобрена кадастрална карта. Нотариусът може да я поръча и сам.', '10,23 € на хартия (бърза: 20,45 €); 7,16 € електронно (бърза: 14,32 €)', 'до 7 работни дни; бърза — до 3 работни дни', 'Важи, докато няма промяна в имота или в кадастъра.', 'Онлайн през kais.cadastre.bg с електронен подпис — с 30% по-евтино.'),
  ('encumbrances', 50, array['always'], 'registry', 'Удостоверение за тежести (ипотеки, възбрани)', 'Показва дали имотът е ипотекиран, под възбрана или има заведени дела. Купувачът и банката винаги го искат — добре е да е готово преди сделката.', '5,11 € (бърза: 15,34 €)', 'до 7 работни дни; бърза — до 3 работни дни', null, 'Онлайн през portal.registryagency.bg с електронен подпис.'),
  ('notary_declarations', 60, array['always'], 'notary', 'Декларации пред нотариуса', 'За гражданство и семейно положение, за липса на задължения (чл. 264 ДОПК), а купувачът — за произхода на парите, когато го изисква законът срещу изпирането на пари. Подписват се при нотариуса — не се вадят отнякъде.', 'включени в нотариалната такса', 'в деня на сделката', null, null),
  ('notary_deed', 70, array['always'], 'notary', 'Нотариален акт за продажбата', 'Изготвя се и се подписва при нотариуса, който го изпраща за вписване в Службата по вписванията. Купувачът плаща и местен данък при придобиване — от 0,1% до 3% според общината (в повечето големи градове 3%).', 'нотариална такса по тарифата (най-много 3 068 € + ДДС) и такса вписване 0,1% от цената', 'в деня на сделката', null, null),
  ('heirs_certificate', 110, array['inheritance'], 'municipality', 'Удостоверение за наследници', 'Показва кои са наследниците. Вади се от общината по последния постоянен адрес на починалия — не непременно там, където е имотът.', 'по тарифата на общината', 'по тарифата на общината', null, null),
  ('inheritance_declaration', 120, array['inheritance'], 'municipality', 'Декларация за наследство (чл. 32 ЗМДТ)', 'Наследниците я подават в общината по последния адрес на починалия до 6 месеца от смъртта. Без нея общината не може да издаде данъчна оценка на тяхно име.', 'безплатно', null, null, null),
  ('deceased_title', 130, array['inheritance'], 'owner', 'Документът за собственост на починалия', 'Нотариалният акт (или другият документ) на наследодателя — заедно с удостоверението за наследници доказва собствеността.', null, null, null, null),
  ('use_permit', 210, array['new_build'], 'other', 'Акт 16 — удостоверение за въвеждане в експлоатация или разрешение за ползване', 'Доказва, че сградата е въведена в експлоатация. За сгради от IV и V категория се издава от общината, за I–III категория — от ДНСК. Копие обикновено има строителят или управителят на сградата. Без него банките не кредитират.', 'копие — по тарифата на общината / ДНСК', null, null, null),
  ('new_unit_cadastre', 220, array['new_build'], 'cadastre', 'Нанасяне на новия обект в кадастъра', 'Ако апартаментът още не е в кадастъра, той се нанася (поръчва се чрез правоспособен геодезист) — после се вади схемата му.', 'по Тарифа № 14 на АГКК', null, null, 'Заявява се и през kais.cadastre.bg.'),
  ('land_sketch', 310, array['house_land'], 'cadastre', 'Скица на поземлен имот (и скица на сградата)', 'За къща, вила или парцел — вместо схемата на апартамент.', 'в регулация: 10,23 € на хартия (бърза: 20,45 €), 7,16 € електронно; извън регулация: 2,56 € (електронно 1,79 €)', 'до 7 работни дни; бърза — до 3 работни дни', 'Важи, докато няма промяна в имота или в кадастъра.', 'Онлайн през kais.cadastre.bg с електронен подпис.'),
  ('agri_sketch', 320, array['house_land'], 'other', 'За земеделска земя без кадастрална карта — скица от Общинската служба по земеделие', 'Там, където още няма одобрена кадастрална карта, скицата на земеделската земя се вади от службата по земеделие в общината.', 'по тарифата на службата', null, null, null),
  ('tolerance', 330, array['house_land'], 'municipality', 'Удостоверение за търпимост (стара сграда без строителни книжа)', 'Ако сграда в имота е строена отдавна без книжа, общината може да издаде удостоверение, че е търпим строеж — иначе нотариусът и банката може да откажат.', 'по тарифата на общината', null, null, null),
  ('bank_payoff', 410, array['mortgage'], 'bank', 'Писмо от банката на продавача за остатъка по кредита', 'Колко точно трябва да се плати, за да се погаси кредитът в деня на сделката — обикновено от цената, при нотариуса.', 'по тарифата на банката', null, null, null),
  ('mortgage_release', 420, array['mortgage'], 'registry', 'Заличаване на ипотеката', 'След погасяването банката дава съгласие и ипотеката се заличава в Службата по вписванията.', 'по тарифата на Агенцията по вписванията', null, null, null),
  ('bank_valuation', 510, array['buyer_loan'], 'bank', 'Пазарна оценка от лицензиран оценител', 'Банката на купувача поръчва оценка на имота. Продавачът осигурява достъп до имота.', 'по ценоразписа на банката / оценителя', null, null, null),
  ('bank_copies', 520, array['buyer_loan'], 'owner', 'Копия на документите за банката', 'Нотариален акт, схема или скица, данъчна оценка, удостоверение за тежести — банката ги иска преди да одобри кредита.', null, null, null, null),
  ('spouse', 610, array['spouse'], 'owner', 'Съпругът или съпругата също подписва', 'Ако имотът е купен по време на брака (съпружеска общност), двамата съпрузи продават заедно. Ако е придобит преди брака, по наследство или дарение — личен е; това личи от документа за собственост.', null, null, null, null),
  ('power_of_attorney', 620, array['proxy'], 'notary', 'Нотариално заверено пълномощно', 'Когато собственик не може да присъства — изрично пълномощно за продажбата на конкретния имот, с нотариална заверка.', 'по тарифата за нотариалните такси', null, null, null),
  ('abroad', 630, array['proxy'], 'other', 'Пълномощно, издадено в чужбина', 'Заверено в българско посолство или консулство — или от местен нотариус с апостил и превод на български.', 'по тарифата на консулството / нотариуса', null, null, null);

insert into public.sale_offices (city, kind, name, address, phone, fee, term) values
  ('Благоевград', 'cadastre', 'СГКК – Благоевград', 'гр. Благоевград, ул. „Иван Михайлов“ № 49, вх. Б, ет. 4', '073/830 423', null, null),
  ('Благоевград', 'registry', 'Служба по вписванията – Благоевград', 'гр. Благоевград, ул. „Тодор Александров“ № 47', '073/831 711', null, null),
  ('Благоевград', 'municipality', 'Община Благоевград – Местни данъци и такси', null, null, null, null),
  ('Бургас', 'cadastre', 'СГКК – Бургас', 'гр. Бургас, бул. „Стефан Стамболов“ № 120, ет. 1', '056/813 518', null, null),
  ('Бургас', 'registry', 'Служба по вписванията – Бургас', 'гр. Бургас, пл. „Жени Патева“ № 1', '056/878 481', null, null),
  ('Бургас', 'municipality', 'Община Бургас – Дирекция „Местни приходи от данъци, такси и реклама“', 'гр. Бургас, ул. „Александровска“ № 83', '056/907 452', '5,11 € (5 дни); двойна за 3 дни, тройна за 24 часа', 'до 5 дни; до 3 дни; до 24 часа'),
  ('Варна', 'cadastre', 'СГКК – Варна', 'гр. Варна, бул. „Цар Освободител“ № 76Г, ет. 6', '052/634 638', null, null),
  ('Варна', 'registry', 'Служба по вписванията – Варна', 'гр. Варна, бул. „8-ми Приморски полк“ № 54', '052/786 413', null, null),
  ('Варна', 'municipality', 'Община Варна – Дирекция „Местни данъци“', 'гр. Варна, бул. „Сливница“ № 191', '052/820 905', '7,67 € (до 5 дни); 15,34 € (до 1 ден) — за деклариран имот; 25,56 € при нова декларация', 'до 5 дни; бърза — до 1 ден'),
  ('Велико Търново', 'cadastre', 'СГКК – Велико Търново', 'гр. Велико Търново, бул. „Цар Т. Светослав“ № 59, ет. 4', '062/622 536', null, null),
  ('Велико Търново', 'registry', 'Служба по вписванията – Велико Търново', 'гр. Велико Търново, ул. „Цанко Церковски“ № 40', '062/605 253', null, null),
  ('Велико Търново', 'municipality', 'Община Велико Търново – Общински център за услуги и информация', 'гр. Велико Търново, пл. „Майка България“ № 2', '062/619 108', '5,11 € (обикновена); 15,34 € (бърза); 30,68 € (експресна)', 'обикновена — до 2 седмици; бърза и експресна — по-кратко'),
  ('Видин', 'cadastre', 'СГКК – Видин', 'гр. Видин, ул. „Цар Симеон Велики“ № 71, ет. 1 и 6', '094/600 314', null, null),
  ('Видин', 'registry', 'Служба по вписванията – Видин', 'гр. Видин, пл. „Бдинци“ № 1', '094/607 331', null, null),
  ('Видин', 'municipality', 'Община Видин – Център за административно обслужване', 'гр. Видин, пл. „Бдинци“ № 2', '094/609 402', '5,11 € (7 работни дни); 7,67 € (3 работни дни); 10,23 € (24 часа)', '7 работни дни; бърза — 3; експресна — 24 часа'),
  ('Враца', 'cadastre', 'СГКК – Враца', 'гр. Враца, бул. „Христо Ботев“ № 46, ет. 2 и 3', '092/623 081', null, null),
  ('Враца', 'registry', 'Служба по вписванията – Враца', 'гр. Враца, бул. „Александър Стамболийски“ № 7', '092/669 685', null, null),
  ('Враца', 'municipality', 'Община Враца – Дирекция „Местни данъци и такси“', 'гр. Враца, ул. „Петропавловска“ № 43, ет. 3', '0876 967 773', '5,11 € (5 дни); 7,67 € (3 дни); 12,78 € (в деня)', '5 дни; бърза — 3 дни; експресна — в деня'),
  ('Габрово', 'cadastre', 'СГКК – Габрово', 'гр. Габрово, пл. „Възраждане“ № 5, ет. 4', '066/801 644', null, null),
  ('Габрово', 'registry', 'Служба по вписванията – Габрово', 'гр. Габрово, ул. „Лазар Донков“ № 5', '066/81 507', null, null),
  ('Габрово', 'municipality', 'Община Габрово – Дирекция „Местни данъци и такси“', 'гр. Габрово, ул. „Райчо Каролев“ № 4', '066/804 776', '5,50 € (5 дни); 13,75 € (1 ден)', '5 дни; бърза — 1 ден'),
  ('Добрич', 'cadastre', 'СГКК – Добрич', 'гр. Добрич, бул. „Добруджа“ № 28, ет. 3', '058/601 278', null, null),
  ('Добрич', 'registry', 'Служба по вписванията – Добрич', 'гр. Добрич, бул. „Добруджа“ № 32А', '058/838 501', null, null),
  ('Добрич', 'municipality', 'Община Добрич – Дирекция „Местни данъци и такси“', 'гр. Добрич, ул. „Независимост“ № 7, ет. 3', '058/603 196', '5,11 € (обикновена); 12,78 € (бърза)', '5 дни'),
  ('Кърджали', 'cadastre', 'СГКК – Кърджали', 'гр. Кърджали, ул. „Беломорски“ № 79, ет. 1', '036/161 873', null, null),
  ('Кърджали', 'registry', 'Служба по вписванията – Кърджали', 'гр. Кърджали, ул. „Васил Априлов“ № 6А', '0361/61 383', null, null),
  ('Кърджали', 'municipality', 'Община Кърджали – Дирекция „Местни приходи“', null, '0361/62 951', '5,11 € (5 дни); 12,78 € (1 ден)', '5 дни; бърза — 1 ден'),
  ('Кюстендил', 'cadastre', 'СГКК – Кюстендил', 'гр. Кюстендил, ул. „Гороцветна“ № 43', '078/551 427', null, null),
  ('Кюстендил', 'registry', 'Служба по вписванията – Кюстендил', 'гр. Кюстендил, ул. „Гороцветна“ № 29А', '078/550 575', null, null),
  ('Кюстендил', 'municipality', 'Община Кюстендил', 'гр. Кюстендил, пл. „Велбъжд“ № 1', '078/551 166', '7,67 € (обикновена); 15,34 € (бърза)', '5 дни'),
  ('Ловеч', 'cadastre', 'СГКК – Ловеч', 'гр. Ловеч, бул. „България“ № 3, ет. 4', '068/601 677', null, null),
  ('Ловеч', 'registry', 'Служба по вписванията – Ловеч', 'гр. Ловеч, ул. „Търговска“ № 41', '068/604 715', null, null),
  ('Ловеч', 'municipality', 'Община Ловеч – Дирекция „Местни приходи“', 'гр. Ловеч, ул. „Търговска“ № 22', '068/688 301', '5,11 € (7 дни); 12,78 € (24 часа)', '7 дни; бърза — 24 часа'),
  ('Монтана', 'cadastre', 'СГКК – Монтана', 'гр. Монтана, пл. „Жеравица“ № 3, ет. 3 (в сградата на РЗИ)', '096/305 822', null, null),
  ('Монтана', 'registry', 'Служба по вписванията – Монтана', 'гр. Монтана, ул. „Св. Климент Охридски“ № 5А, ет. 3, стая 314', '096/307 522', null, null),
  ('Монтана', 'municipality', 'Община Монтана – Дирекция „Местни приходи и такси“', 'гр. Монтана, пл. „Жеравица“ № 3', '096/301 249', '2,05 € (14 дни); 3,58 € (7 дни); 6,14 € (1 ден)', '14 дни; бърза — 7 дни; експресна — 1 ден'),
  ('Пазарджик', 'cadastre', 'СГКК – Пазарджик', 'гр. Пазарджик, ул. „Цар Шишман“ № 2, ет. 5', '034/448 625', null, null),
  ('Пазарджик', 'registry', 'Служба по вписванията – Пазарджик', 'гр. Пазарджик, ул. „Хан Крум“ № 3, ет. 1, стая 3', '034/442 304', null, null),
  ('Пазарджик', 'municipality', 'Община Пазарджик – Дирекция „Бюджет и общинска собственост“', 'гр. Пазарджик, бул. „България“ № 2', '034/402 220', '5,11 € (5 дни); 10,23 € (2 дни)', '5 дни; бърза — 2 дни'),
  ('Перник', 'cadastre', 'СГКК – Перник', 'гр. Перник, ул. „Търговска“ № 46, ет. 4', '076/600 163', null, null),
  ('Перник', 'registry', 'Служба по вписванията – Перник', 'гр. Перник, ул. „Търговска“ № 37', '076/600 732', null, null),
  ('Перник', 'municipality', 'Община Перник – Дирекция „Местни данъци и такси“', null, '076/601 595', '5,20 € (5 дни); 13,00 € (до 24 часа)', '5 дни; бърза — до 24 часа'),
  ('Плевен', 'cadastre', 'СГКК – Плевен', 'гр. Плевен, ул. „Ал. Стамболийски“ № 1, ет. 8', '064/801 420', null, null),
  ('Плевен', 'registry', 'Служба по вписванията – Плевен', 'гр. Плевен, ул. „Хаджи Димитър“ № 2', '064/803 702', null, null),
  ('Плевен', 'municipality', 'Община Плевен – Дирекция „Приходи от местни данъци и такси“', 'гр. Плевен, ул. „П. Р. Славейков“ № 21', '064/889 464', '2,56 € (обикновена); 3,83 € (бърза); 12,78 € (експресна)', '5 дни'),
  ('Пловдив', 'cadastre', 'СГКК – Пловдив', 'гр. Пловдив, пл. „Съединение“ № 3', '032/627 379', null, null),
  ('Пловдив', 'registry', 'Служба по вписванията – Пловдив', 'гр. Пловдив, бул. „6-ти Септември“ № 152', '032/279 145', null, null),
  ('Пловдив', 'municipality', 'Община Пловдив – Дирекция „Местни данъци и такси“', 'гр. Пловдив, ул. „Радецки“ № 18А', '032/276 902', 'по ценоразписа на общината', '5 дни; 3 дни; 1 ден'),
  ('Разград', 'cadastre', 'СГКК – Разград', 'гр. Разград, ул. „Бузлуджа“ № 2, ет. 6 и 7', '084/661 355', null, null),
  ('Разград', 'registry', 'Служба по вписванията – Разград', 'гр. Разград, пл. „Независимост“ № 2', '084/662 979', null, null),
  ('Разград', 'municipality', 'Община Разград – Дирекция „Местни данъци и такси“', 'гр. Разград, бул. „Бели Лом“ № 37А', '084/618 120', 'по тарифата на общината', 'до 5 работни дни; до 3; до 24 часа'),
  ('Русе', 'cadastre', 'СГКК – Русе', 'гр. Русе, ул. „Църковна независимост“ № 18, ет. 6', '082/872 035', null, null),
  ('Русе', 'registry', 'Служба по вписванията – Русе', 'гр. Русе, ул. „Църковна независимост“ № 16, ет. 3', '082/816 580', null, null),
  ('Русе', 'municipality', 'Община Русе – Отдел „Отчитане на приходи и обслужване на данъкоплатци“', null, '082/506 525', '2,56 € (до 5 работни дни); 5,11 € (до 3); 10,23 € (до 1 работен ден)', 'до 5 работни дни; бърза — до 3; експресна — до 1'),
  ('Силистра', 'cadastre', 'СГКК – Силистра', 'гр. Силистра, ул. „Илия Блъсков“ № 1, ет. 3', '086/822 397', null, null),
  ('Силистра', 'registry', 'Служба по вписванията – Силистра', 'гр. Силистра, ул. „Христо Смирненски“ № 2, ет. 2', '086/871 114', null, null),
  ('Силистра', 'municipality', 'Община Силистра – Отдел „Местни данъци и такси“', 'гр. Силистра, ул. „Симеон Велики“ № 33', '086/816 291', '3,07 € (5 дни); 6,14 € (3 дни); 9,20 € (24 часа)', '5 дни; бърза — 3 дни; експресна — 24 часа'),
  ('Сливен', 'cadastre', 'СГКК – Сливен', 'гр. Сливен, ул. „Димитър Пехливанов-Добрович“ № 2, ет. 2', '044/662 321', null, null),
  ('Сливен', 'registry', 'Служба по вписванията – Сливен', 'гр. Сливен, пл. „Хаджи Димитър“ № 2', '044/623 530', null, null),
  ('Сливен', 'municipality', 'Община Сливен – Дирекция „Местни данъци и такси“', null, '044/622 924', '2,56 € (5 работни дни); 5,11 € (1 работен ден)', '5 работни дни; експресна — 1'),
  ('Смолян', 'cadastre', 'СГКК – Смолян', 'гр. Смолян, бул. „България“ № 69, ет. 1 и 3', '0301/63 101', null, null),
  ('Смолян', 'registry', 'Служба по вписванията – Смолян', 'гр. Смолян, бул. „България“ № 14, ет. 1', '0301/27 603', null, null),
  ('Смолян', 'municipality', 'Община Смолян – Отдел „Местни приходи“', 'гр. Смолян, бул. „България“ № 12', '0301/62 566', '7,67 € (5 дни); 15,34 € (3 дни); 23,01 € (1 ден)', '5 дни; бърза — 3 дни; експресна — 1 ден'),
  ('София', 'cadastre', 'СГКК – София', 'гр. София, ул. „Мусала“ № 1 (вход от ул. „Белмекен“)', '02/818 8338', null, null),
  ('София', 'registry', 'Служба по вписванията – София', 'гр. София, ул. „Елисавета Багряна“ № 20', '02/948 6336', null, null),
  ('София', 'municipality', 'Столична община – Център за информация и услуги', 'гр. София, ул. „Московска“ № 33', '0700 17 310', '17,38 € (5 дни); 26,08 € (3 дни); 34,77 € (1 ден)', '5 дни; бърза — 3 дни; експресна — 1 ден'),
  ('Стара Загора', 'cadastre', 'СГКК – Стара Загора', 'гр. Стара Загора, ул. „Цар Симеон Велики“ № 1', '042/622 113', null, null),
  ('Стара Загора', 'registry', 'Служба по вписванията – Стара Загора', 'гр. Стара Загора, бул. „Цар Симеон Велики“ № 108', null, null, null),
  ('Стара Загора', 'municipality', 'Община Стара Загора – Дирекция „Местни данъци и такси“', 'гр. Стара Загора, бул. „Митрополит Методий Кусев“ № 35 (офис за граждани)', '042/622 613', 'по тарифата на общината', '5 дни; бърза — 3 дни; експресна — 1 ден'),
  ('Търговище', 'cadastre', 'СГКК – Търговище', 'гр. Търговище, ул. „Лилия“ № 2', '060/167 325', null, null),
  ('Търговище', 'registry', 'Служба по вписванията – Търговище', 'гр. Търговище, ул. „Стефан Караджа“ № 1', '0601/629 75', null, null),
  ('Търговище', 'municipality', 'Община Търговище – Отдел „Местни данъци и такси“', 'гр. Търговище, пл. „Свобода“', '0601/68 755', '5,11 € (7,67 € за земеделска земя)', 'веднага'),
  ('Хасково', 'cadastre', 'СГКК – Хасково', 'гр. Хасково, бул. „Георги Сава Раковски“ № 26, вх. А, ет. 3', '038/665 081', null, null),
  ('Хасково', 'registry', 'Служба по вписванията – Хасково', 'гр. Хасково, бул. „Враня“ № 1', '038/665 591', null, null),
  ('Хасково', 'municipality', 'Община Хасково', 'гр. Хасково, пл. „Общински“ № 1', '038/603 414', '5,11 € (5 дни); 12,78 € (до 24 часа)', '5 дни; бърза — до 24 часа'),
  ('Шумен', 'cadastre', 'СГКК – Шумен', 'гр. Шумен, ул. „Съединение“ № 107', '054/802 812', null, null),
  ('Шумен', 'registry', 'Служба по вписванията – Шумен', 'гр. Шумен, ул. „Съединение“ № 107, ет. 2, стая 205', '054/802 164', null, null),
  ('Шумен', 'municipality', 'Община Шумен – Дирекция „Бюджет, финанси и работна заплата“', null, null, '11,25 € (до 5 дни); 20,45 € (до 24 часа)', 'до 5 дни; експресна — до 24 часа'),
  ('Ямбол', 'cadastre', 'СГКК – Ямбол', 'гр. Ямбол, пл. „Освобождение“ № 7, ет. 2 и 3', '046/661 879', null, null),
  ('Ямбол', 'registry', 'Служба по вписванията – Ямбол', 'гр. Ямбол, ул. „Жорж Папазов“ № 1', '046/661 426', null, null),
  ('Ямбол', 'municipality', 'Община Ямбол – Отдел „Местни приходи“', 'гр. Ямбол, ул. „Г. С. Раковски“ № 7', '046/681 101', '15,00 € (5 работни дни); 30,00 € (24 часа)', '5 работни дни; експресна — 24 часа');

-- ---------------------------------------------------------------------
-- Follow-up messages for the chosen clients; a property's documents (063)
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- Follow-up messages: only for the clients the broker chose
-- ---------------------------------------------------------------------
alter table public.clients add column auto_follow_up boolean not null default false;

-- the ones chosen for the monthly note already
update public.clients set auto_follow_up = true where monthly_news;

-- the messages waiting for clients nobody chose: gone (there's no list for them any more)
delete from public.client_news n
using public.clients c
where c.id = n.client_id and not c.auto_follow_up and n.sent_at is null and n.skipped_at is null;

-- every maker (the rates, the prices, the lanes…) writes only for the chosen clients
create or replace function public.client_news_only_followed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select c.auto_follow_up from public.clients c where c.id = new.client_id), false) then
    return null;
  end if;
  return new;
end;
$$;

create trigger client_news_only_followed
  before insert on public.client_news
  for each row execute function public.client_news_only_followed();

-- …and the client's broker hears about each message (not about the samples)
create or replace function public.tell_client_news()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  select cl.organization_id, cl.responsible_broker_id, cl.full_name, cl.sample into c
  from public.clients cl where cl.id = new.client_id;
  if c.responsible_broker_id is null or c.sample then
    return new;
  end if;
  perform public.notify(
    c.organization_id, c.responsible_broker_id, null, 'client_message',
    jsonb_build_object('title', c.full_name, 'kind', new.kind),
    '/clients/' || new.client_id
  );
  return new;
end;
$$;

create trigger client_news_tell
  after insert on public.client_news
  for each row execute function public.tell_client_news();

-- no more daily summaries pointing to the old list
create or replace function public.tell_market_news(today date, news_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- each message is told on its own now (tell_client_news)
  return;
end;
$$;

-- The monthly note: a seller or landlord every four weeks, a cold client from the 15th.
create or replace function public.make_monthly_news(today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  client record;
  market record;
  rate_now record;
  rate_before numeric;
  made int := 0;
begin
  select m.month, m.rate into rate_now from public.mortgage_rates m order by m.month desc limit 1;
  if found then
    select m.rate into rate_before from public.mortgage_rates m
    where m.month = (rate_now.month - interval '3 months')::date;
  end if;

  for client in
    select c.id, c.organization_id
    from public.clients c
    where c.auto_follow_up
      and ((c.client_class = 'C' and extract(day from today) >= 15) or c.types && array['seller', 'landlord'])
      and c.responsible_broker_id is not null and c.stage <> 'lost'
      and (c.phone is not null or c.email is not null)
      and not public.client_closed(c.id)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.kind = 'monthly' and x.created_on > today - 28)
      and not exists (select 1 from public.client_news x where x.client_id = c.id and x.created_on > today - 7)
  loop
    select * into market from public.client_market(client.id, today);
    if market.area is null and rate_now.rate is null then
      continue;
    end if;
    insert into public.client_news (organization_id, client_id, kind, data)
    values (
      client.organization_id, client.id, 'monthly',
      jsonb_strip_nulls(jsonb_build_object(
        'area', market.area, 'sqm', market.sqm, 'listings', market.listings, 'change', market.change,
        'rate', rate_now.rate, 'rateMonth', to_char(rate_now.month, 'YYYY-MM'), 'rateBefore', rate_before
      ))
    )
    on conflict do nothing;
    if found then
      made := made + 1;
    end if;
  end loop;
  return made;
end;
$$;

create or replace function public.enrich_sample_data()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  done int := 0;
  rate_now record;
  rate_peak record;
  analysis record;
begin
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at limit 1;
  if org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- when, who decides, why — the lane follows the "when"
  update public.clients c
  set timeline = v.timeline, decider = v.decider, motive = v.motive, client_class = v.lane
  from (values
    ('Мария Иванова (пример)', 'now', 'partner', 'Иска да се нанесе до лятото', 'A'),
    ('Георги Петров (пример)', 'soon', 'partner', 'Второ дете — тясно им е', 'B'),
    ('Елена Димитрова (пример)', 'now', 'alone', 'Започва нова работа наблизо', 'A'),
    ('Николай Стоянов (пример)', 'later', 'alone', 'Инвестиция за отдаване под наем', 'C'),
    ('Иван Колев (пример)', 'now', 'partner', 'Купили са къща и трябва да продадат', 'A'),
    ('Десислава Тодорова (пример)', 'soon', 'alone', 'Сменя наемателите', 'B'),
    ('Петър Василев (пример)', 'soon', 'others', 'Наследство — решават заедно с братята', 'B'),
    ('Анна Георгиева (пример)', 'later', 'alone', 'Още разглежда', 'C')
  ) as v(name, timeline, decider, motive, lane)
  where c.organization_id = org and c.sample and c.full_name = v.name;
  get diagnostics done = row_count;

  -- how the buyers pay
  insert into public.client_financing (client_id, loan, own_funds, bank_amount, bank_referred, bank_name)
  select c.id, v.loan, v.own, v.bank, v.referred, v.bank_name
  from public.clients c
  join (values
    ('Мария Иванова (пример)', 'approved', 40000::numeric, 110000::numeric, true, 'Банка ДСК'),
    ('Георги Петров (пример)', 'applying', 30000::numeric, 150000::numeric, false, null),
    ('Николай Стоянов (пример)', 'none', 90000::numeric, null::numeric, false, null)
  ) as v(name, loan, own, bank, referred, bank_name) on v.name = c.full_name
  where c.organization_id = org and c.sample
  on conflict (client_id) do nothing;

  -- the clients whose follow-up is on, and a few ready messages on their pages
  update public.clients c
  set auto_follow_up = true
  where c.organization_id = org and c.sample
    and c.full_name in ('Мария Иванова (пример)', 'Георги Петров (пример)', 'Анна Георгиева (пример)');
  select m.month, m.rate into rate_now from public.mortgage_rates m order by m.month desc limit 1;
  if found then
    select m.month, m.rate into rate_peak from public.mortgage_rates m
    where m.month < rate_now.month and m.month >= (rate_now.month - interval '12 months')::date
    order by m.rate desc, m.month desc limit 1;
    if found and rate_peak.rate > rate_now.rate then
      insert into public.client_news (organization_id, client_id, kind, data)
      select org, c.id, 'rates',
        jsonb_build_object('from', rate_peak.rate, 'fromMonth', to_char(rate_peak.month, 'YYYY-MM'),
                           'to', rate_now.rate, 'toMonth', to_char(rate_now.month, 'YYYY-MM'))
      from public.clients c
      where c.organization_id = org and c.sample and c.full_name = 'Мария Иванова (пример)'
      on conflict do nothing;
    end if;
  end if;

  -- the warm buyer's area: the samples' own listings there
  select nb.name as area, round(avg(p.current_price / nullif(p.area, 0))) as sqm, count(*)::int as listings
  into analysis
  from public.properties p
  join public.geo_neighborhoods nb on nb.id = p.neighborhood_id
  where p.organization_id = org and p.sample and p.operation_type = 'sale' and p.area > 0
  group by nb.name
  order by count(*) desc, nb.name
  limit 1;
  if analysis.area is not null then
    insert into public.client_news (organization_id, client_id, kind, data)
    select org, c.id, 'warm_analysis', jsonb_build_object('area', analysis.area, 'sqm', analysis.sqm)
    from public.clients c
    where c.organization_id = org and c.sample and c.full_name = 'Георги Петров (пример)'
    on conflict do nothing;
  end if;

  insert into public.client_news (organization_id, client_id, kind, data)
  select org, c.id, 'tips', jsonb_build_object('month', to_char(public.sofia_today(), 'YYYY-MM'))
  from public.clients c
  where c.organization_id = org and c.sample and c.full_name = 'Анна Георгиева (пример)'
  on conflict do nothing;

  return done;
end;
$$;

revoke execute on function public.client_news_only_followed() from public, anon, authenticated;
revoke execute on function public.tell_client_news() from public, anon, authenticated;
revoke execute on function public.tell_market_news(date, text) from public, anon, authenticated;
revoke execute on function public.make_monthly_news(date) from public, anon, authenticated;
revoke execute on function public.enrich_sample_data() from public, anon;
grant execute on function public.enrich_sample_data() to authenticated;

-- ---------------------------------------------------------------------
-- A property's documents: its history, the cases, the checklist
-- ---------------------------------------------------------------------
create table public.property_dossiers (
  property_id uuid primary key references public.properties (id) on delete cascade,
  -- inheritance, new_build, house_land, mortgage, buyer_loan, spouse, proxy
  cases text[] not null default '{}',
  -- the property's history in words: how the owners got it, inheritances, mortgages, works…
  history text check (history is null or char_length(history) <= 10000),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

create trigger property_dossiers_touch_updated_at before update on public.property_dossiers
  for each row execute function public.touch_updated_at();

alter table public.property_dossiers enable row level security;
create policy "property dossiers: read" on public.property_dossiers
  for select to authenticated using (public.can_edit_property(property_id));
create policy "property dossiers: add" on public.property_dossiers
  for insert to authenticated with check (public.can_edit_property(property_id));
create policy "property dossiers: change" on public.property_dossiers
  for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));

-- each document of the checklist: we have it, it must be obtained, it's ordered, or it doesn't apply
create table public.property_doc_status (
  property_id uuid not null references public.properties (id) on delete cascade,
  doc_code text not null references public.sale_docs (code) on delete cascade,
  status text not null check (status in ('have', 'need', 'ordered', 'na')),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (property_id, doc_code)
);

create trigger property_doc_status_touch_updated_at before update on public.property_doc_status
  for each row execute function public.touch_updated_at();

alter table public.property_doc_status enable row level security;
create policy "property doc status: read" on public.property_doc_status
  for select to authenticated using (public.can_edit_property(property_id));
create policy "property doc status: add" on public.property_doc_status
  for insert to authenticated with check (public.can_edit_property(property_id));
create policy "property doc status: change" on public.property_doc_status
  for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
create policy "property doc status: remove" on public.property_doc_status
  for delete to authenticated using (public.can_edit_property(property_id));

-- a file uploaded can be one of the checklist's documents
alter table public.property_documents
  add column doc_code text references public.sale_docs (code) on delete set null;

create policy "property documents: change" on public.property_documents
  for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));

-- ---------------------------------------------------------------------
-- The broker's social networks (064)
-- ---------------------------------------------------------------------
alter table public.profiles
  add column socials jsonb not null default '{}'::jsonb
    check (jsonb_typeof(socials) = 'object' and pg_column_size(socials) < 4000);

-- the public pages bring them along with the broker
create or replace function public.shared_property(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'operation', p.operation_type,
      'status', p.status,
      'price', p.current_price,
      'currency', p.currency,
      'area', p.area,
      'rooms', p.rooms,
      'bedrooms', p.bedrooms,
      'floor', p.floor,
      'total_floors', p.total_floors,
      'construction', p.construction_type,
      'condition', p.condition,
      'furnishing', p.furnishing,
      'heating', p.heating,
      'exposures', p.exposures,
      'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((
        select jsonb_agg(ph.storage_path order by ph.position)
        from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb),
      -- for a listing for sale: the rent the broker expects, or BRIXA's estimate from the agency's market
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end,
      -- the stars against the market, only when the price is good
      'rating', public.public_rating(p.id)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
      from public.profiles pr where pr.id = coalesce(sh.created_by, p.responsible_broker_id)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  )
  from public.property_shares sh
  join public.properties p on p.id = sh.property_id
  where sh.token = share_token and sh.revoked_at is null;
$$;

create or replace function public.shared_search(share_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sh public.search_shares;
  s public.client_searches;
  result jsonb;
begin
  select * into sh from public.search_shares where token = share_token and revoked_at is null;
  if sh.id is null then
    return null;
  end if;
  select * into s from public.client_searches where client_id = sh.client_id;
  if s.client_id is null then
    return null;
  end if;

  update public.search_shares set views = views + 1 where id = sh.id;

  select jsonb_build_object(
    'search', jsonb_build_object(
      'operation', s.operation,
      'subtypes', coalesce((select jsonb_agg(jsonb_build_object('name', st.name, 'name_en', st.name_en) order by st.sort_order)
        from public.property_subtypes st where st.id = any (s.subtype_ids)), '[]'::jsonb),
      'settlements', coalesce((select jsonb_agg(g.settlement_type || ' ' || g.name order by g.name)
        from public.geo_settlements g where g.id = any (s.settlement_ids)), '[]'::jsonb),
      'neighborhoods', coalesce((select jsonb_agg(n.name order by n.name)
        from public.geo_neighborhoods n where n.id = any (s.neighborhood_ids)), '[]'::jsonb),
      'budget_min', s.budget_min,
      'budget_max', s.budget_max,
      'currency', s.currency,
      'area_min', s.area_min,
      'area_max', s.area_max,
      'rooms_min', s.rooms_min,
      'rooms_max', s.rooms_max,
      'features', coalesce((select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_features f where f.id = any (s.feature_ids)), '[]'::jsonb),
      'updated_at', s.updated_at
    ),
    'comment', sh.comment,
    'shared_at', sh.created_at,
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
      from public.profiles pr
      where pr.id = coalesce((select c.responsible_broker_id from public.clients c where c.id = sh.client_id), sh.created_by)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = sh.organization_id
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.shared_analysis(share_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sh public.analysis_shares;
  p public.properties;
  a jsonb;
begin
  select * into sh from public.analysis_shares where token = share_token and revoked_at is null;
  if sh.id is null then
    return null;
  end if;
  select * into p from public.properties where id = sh.property_id;
  a := public.analysis_of(p.id, true);
  if a is null or a -> 'rating' is null or jsonb_typeof(a -> 'rating') = 'null' then
    return jsonb_build_object('unavailable', true);
  end if;
  if sh.audience = 'buyer' and (a -> 'rating' ->> 'stars')::int < 4 then
    return jsonb_build_object('unavailable', true);
  end if;

  return jsonb_build_object(
    'audience', sh.audience,
    'analysis', a,
    'property', jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'operation', p.operation_type,
      'price', p.current_price,
      'currency', p.currency,
      'area', p.area,
      'rooms', p.rooms,
      'floor', p.floor,
      'total_floors', p.total_floors,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
      from public.profiles pr where pr.id = coalesce(sh.created_by, p.responsible_broker_id)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  );
end;
$$;

create or replace function public.owner_report(report_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.owner_reports;
  p public.properties;
  result jsonb;
begin
  select * into r from public.owner_reports where token = report_token and revoked_at is null;
  if r.id is null then
    return null;
  end if;
  select * into p from public.properties where id = r.property_id;

  with
  -- a viewing logged by hand and the same one on a deal count once
  viewings as (
    select (a.occurred_at at time zone 'Europe/Sofia')::date as on_day, a.client_id
    from public.activities a
    where a.property_id = p.id and a.type = 'viewing'
      and a.client_id is distinct from p.owner_client_id
    union
    select d.viewing_on, d.client_id
    from public.deals d
    where d.property_id = p.id and d.viewing_on is not null
  ),
  period_viewings as (
    select on_day from viewings where on_day between r.period_start and r.period_end
  ),
  -- buyers calling, writing, meeting about it (not the owner; not the links sent — counted apart)
  inquiries as (
    select (a.occurred_at at time zone 'Europe/Sofia')::date as on_day
    from public.activities a
    where a.property_id = p.id
      and a.type in ('call', 'email', 'message', 'meeting')
      and a.client_id is distinct from p.owner_client_id
      and not (a.type = 'message' and coalesce(a.note, '') like '🔗%')
      and (a.occurred_at at time zone 'Europe/Sofia')::date between r.period_start and r.period_end
  ),
  shares as (
    select sh.views, sh.first_viewed_at
    from public.property_shares sh
    where sh.property_id = p.id
      and (sh.created_at at time zone 'Europe/Sofia')::date between r.period_start and r.period_end
  ),
  offers as (
    select o.amount, o.currency, o.offered_on, o.status
    from public.deal_offers o
    join public.deals d on d.id = o.deal_id
    where d.property_id = p.id and o.offered_on between r.period_start and r.period_end
  )
  select jsonb_build_object(
    'report', jsonb_build_object(
      'period_start', r.period_start,
      'period_end', r.period_end,
      'comment', r.comment,
      'created_at', r.created_at
    ),
    'owner', (select c.full_name from public.clients c where c.id = p.owner_client_id),
    'property', jsonb_build_object(
      'title', p.title,
      'operation', p.operation_type,
      'status', p.status,
      'price', p.current_price,
      'asking_price', p.asking_price,
      'currency', p.currency,
      'area', p.area,
      'listed_at', p.created_at,
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'cover', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1)
    ),
    'totals', jsonb_build_object(
      'viewings', (select count(*) from period_viewings),
      'inquiries', (select count(*) from inquiries),
      'shared', (select count(*) from shares),
      'opened', (select count(*) from shares where first_viewed_at is not null),
      'offers', (select count(*) from offers),
      'best_offer', (select max(amount) from offers where status <> 'rejected')
    ),
    'viewings', coalesce((select jsonb_agg(on_day order by on_day desc) from period_viewings), '[]'::jsonb),
    'inquiries', coalesce((select jsonb_agg(on_day order by on_day desc) from inquiries), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object('amount', amount, 'currency', currency, 'on', offered_on, 'status', status)
        order by offered_on desc)
      from offers), '[]'::jsonb),
    -- where the interested clients are now (open deals, by stage)
    'in_progress', coalesce((
      select jsonb_agg(jsonb_build_object('stage', stage, 'kind', kind, 'count', n) order by n desc)
      from (
        select d.stage, d.kind, count(*) as n
        from public.deals d
        where d.property_id = p.id and d.status = 'open'
        group by d.stage, d.kind
      ) s), '[]'::jsonb),
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object('at', h.changed_at, 'old', h.old_price, 'new', h.new_price, 'currency', h.currency)
        order by h.changed_at)
      from public.property_price_history h
      where h.property_id = p.id), '[]'::jsonb),
    'market', public.market_facts(p.id),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
      from public.profiles pr where pr.id = coalesce(p.responsible_broker_id, r.created_by)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.open_house_public(house_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'title', p.title,
    'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
    'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
    'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
    'price', p.current_price,
    'currency', p.currency,
    'area', p.area,
    'rooms', p.rooms,
    'day', h.day,
    'starts_at', to_char(h.starts_at, 'HH24:MI'),
    'ends_at', to_char(h.ends_at, 'HH24:MI'),
    'cancelled', h.cancelled_at is not null,
    -- signing in: on the day and the day after
    'open', h.cancelled_at is null and public.sofia_today() between h.day and h.day + 1,
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
      from public.profiles pr where pr.id = h.host_id
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = h.organization_id
    )
  )
  from public.open_houses h
  join public.properties p on p.id = h.property_id
  where h.token = house_token;
$$;

create or replace function public.site_public(site text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website,
      'address', o.address, 'logo_path', o.logo_path, 'headline', o.site_headline, 'about', o.site_about),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
          'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms,
          'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
          'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
          'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
          'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
          -- for the visitor's eyes: the stars only when they're 4 or 5
          'stars', case when p.market_stars >= 4 then p.market_stars end)
        order by p.created_at desc)
      from public.properties p
      where p.organization_id = o.id and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
        and not p.off_market and not p.sample), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'phone', pr.phone, 'email', pr.email,
          'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials) order by m.created_at)
      from public.organization_members m join public.profiles pr on pr.id = m.profile_id
      where m.organization_id = o.id), '[]'::jsonb)
  )
  from public.organizations o
  where o.site_slug = lower(site) and o.site_enabled;
$$;

create or replace function public.site_listing(site text, target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
      'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms, 'bedrooms', p.bedrooms,
      'floor', p.floor, 'total_floors', p.total_floors, 'construction', p.construction_type, 'condition', p.condition,
      'furnishing', p.furnishing, 'heating', p.heating, 'exposures', p.exposures, 'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position) from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb),
      -- for a listing for sale: the rent the broker expects, or BRIXA's estimate from the agency's market
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end,
      'rating', public.public_rating(p.id)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
      from public.profiles pr where pr.id = p.responsible_broker_id
    ),
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
  )
  from public.properties p
  join public.organizations o on o.id = p.organization_id
  where o.site_slug = lower(site) and o.site_enabled and p.id = target_property
    and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
    and not p.off_market and not p.sample;
$$;

-- (064)
-- the reminder 15 minutes before a task: with its kind and whom it's about
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
    select t.id, t.organization_id, t.assigned_to, t.title, t.due_time, t.type,
      coalesce(c.full_name, pa.full_name) as person
    from public.tasks t
    left join public.clients c on c.id = t.client_id
    left join public.partners pa on pa.id = t.partner_id
    where t.status = 'open'
      and t.due_date = today
      and t.due_time is not null
      and (t.reminded_on is null or t.reminded_on < today)
      and t.due_time > now_time
      and t.due_time - interval '15 minutes' <= now_time
  loop
    perform public.notify(
      task.organization_id, task.assigned_to, null, 'task_reminder',
      jsonb_strip_nulls(jsonb_build_object(
        'title', task.title,
        'time', to_char(task.due_time, 'HH24:MI'),
        'kind', task.type,
        'client', task.person
      )),
      '/tasks/' || task.id
    );
    update public.tasks set reminded_on = today where id = task.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.notify_task_reminders(timestamptz) from public, anon, authenticated;

-- (065) the legal documents
alter table public.organizations
  add column if not exists terms_version text
    check (terms_version is null or terms_version ~ '^\d{4}-\d{2}-\d{2}$');

alter table public.platform_settings
  add column if not exists vat_number text
    check (vat_number is null or char_length(vat_number) <= 20),
  add column if not exists representative text
    check (representative is null or char_length(representative) <= 200);

-- only BRIXA changes an agency's trial, payments and accepted terms — or the owner, through accept_terms
create or replace function public.guard_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.trial_ends_at, new.plan_code, new.paid_until, new.comped, new.terms_accepted_at, new.terms_version)
     is distinct from (old.trial_ends_at, old.plan_code, old.paid_until, old.comped, old.terms_accepted_at, old.terms_version)
     and auth.uid() is not null and not public.is_platform_admin()
     and coalesce(current_setting('brixa.accepting_terms', true), '') <> 'on' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- the agency's owner accepts the documents' current version (the date is kept)
create or replace function public.accept_terms(version text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  if version is null or version !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at
  limit 1;
  if org is null then
    return false;
  end if;
  perform set_config('brixa.accepting_terms', 'on', true);
  update public.organizations
  set terms_accepted_at = now(), terms_version = version
  where id = org;
  perform set_config('brixa.accepting_terms', 'off', true);
  return true;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- signing up keeps the version accepted
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

  insert into public.organizations (name, kind, eik, legal_name, city, address, phone, email, website, terms_accepted_at, terms_version)
  values (
    agency_name, account,
    case when clean_eik ~ '^[0-9]{9}([0-9]{4})?$' then clean_eik end,
    left(nullif(btrim(coalesce(meta ->> 'legal_name', '')), ''), 200),
    left(nullif(btrim(coalesce(meta ->> 'city', '')), ''), 80),
    left(nullif(btrim(coalesce(meta ->> 'address', '')), ''), 300),
    left(nullif(btrim(coalesce(meta ->> 'agency_phone', '')), ''), 40),
    left(new.email, 200),
    left(nullif(btrim(coalesce(meta ->> 'website', '')), ''), 200),
    case when meta ->> 'accepted_terms' = 'yes' then now() end,
    case when meta ->> 'accepted_terms' = 'yes' and coalesce(meta ->> 'terms_version', '') ~ '^\d{4}-\d{2}-\d{2}$' then meta ->> 'terms_version' end
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

  -- a brand-new BRIXA: whoever signs up first runs it (and their agency is free)
  if not exists (select 1 from public.platform_admins) then
    insert into public.platform_admins (profile_id) values (new.id);
    update public.organizations set comped = true where id = new_org_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Paying by card: Stripe (066)
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

alter table public.organizations
  add column if not exists stripe_customer_id text
    check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  add column if not exists stripe_subscription_id text
    check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  add column if not exists billing_interval text
    check (billing_interval is null or billing_interval in ('month', 'year')),
  -- the card renews by itself (off: it ends with the paid time)
  add column if not exists auto_renew boolean not null default false,
  add column if not exists payment_failed_at timestamptz;

-- only BRIXA (and Stripe, through the webhook) changes what an agency pays — or the owner, accepting the terms
create or replace function public.guard_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.trial_ends_at, new.plan_code, new.paid_until, new.comped, new.terms_accepted_at, new.terms_version,
      new.stripe_customer_id, new.stripe_subscription_id, new.billing_interval, new.auto_renew, new.payment_failed_at)
     is distinct from
     (old.trial_ends_at, old.plan_code, old.paid_until, old.comped, old.terms_accepted_at, old.terms_version,
      old.stripe_customer_id, old.stripe_subscription_id, old.billing_interval, old.auto_renew, old.payment_failed_at)
     and auth.uid() is not null and not public.is_platform_admin()
     and coalesce(current_setting('brixa.accepting_terms', true), '') <> 'on'
     and coalesce(current_setting('brixa.billing', true), '') <> 'on' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- what an agency has paid
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  method text not null default 'card' check (method in ('card', 'bank')),
  amount numeric(12, 2) not null,
  currency text not null default 'EUR',
  plan_code text,
  billing_interval text check (billing_interval is null or billing_interval in ('month', 'year')),
  period_start date,
  period_end date,
  stripe_invoice_id text unique,
  invoice_url text,
  invoice_pdf text,
  created_at timestamptz not null default now()
);
create index if not exists payments_org_idx on public.payments (organization_id, created_at desc);
alter table public.payments enable row level security;
drop policy if exists "payments: the owner and BRIXA read" on public.payments;
create policy "payments: the owner and BRIXA read" on public.payments
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = payments.organization_id and m.profile_id = auth.uid() and m.role = 'owner'
    )
  );
grant select on public.payments to authenticated;

-- Stripe's events, each applied once
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- the webhook's signing secret: out of reach of the API
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.billing (
  id boolean primary key default true check (id),
  stripe_webhook_secret text
);
insert into private.billing (id) values (true) on conflict do nothing;
revoke all on private.billing from public, anon, authenticated;

-- BRIXA's owner saves (or clears) the secret Stripe shows for the webhook
create or replace function public.set_stripe_webhook_secret(secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    return false;
  end if;
  if nullif(btrim(coalesce(secret, '')), '') is not null and btrim(secret) !~ '^whsec_[A-Za-z0-9+/=_-]{10,200}$' then
    return false;
  end if;
  update private.billing set stripe_webhook_secret = nullif(btrim(coalesce(secret, '')), '');
  return true;
end;
$$;

-- for /admin: is the webhook's secret saved?
create or replace function public.stripe_webhook_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() and exists (select 1 from private.billing where stripe_webhook_secret is not null);
$$;

revoke execute on function public.set_stripe_webhook_secret(text) from public, anon;
grant execute on function public.set_stripe_webhook_secret(text) to authenticated;
revoke execute on function public.stripe_webhook_ready() from public, anon;
grant execute on function public.stripe_webhook_ready() to authenticated;

-- a uuid from Stripe's metadata (null when it isn't one)
create or replace function public.uuid_or_null(value text)
returns uuid
language sql
immutable
as $$
  select case when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then value::uuid end;
$$;

-- tell the agency's owners
create or replace function public.tell_owners(target_org uuid, kind text, payload jsonb, target_link text)
returns void
language sql
security definer
set search_path = public
as $$
  select public.notify(target_org, m.profile_id, null, kind, payload, target_link)
  from public.organization_members m
  where m.organization_id = target_org and m.role = 'owner';
$$;
revoke execute on function public.tell_owners(uuid, text, jsonb, text) from public, anon, authenticated;

-- Stripe tells BRIXA what happened: checked by its signature, applied once
create or replace function public.stripe_webhook(payload text, signature text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
  stamp bigint;
  expected text;
  signed boolean := false;
  part text;
  event jsonb;
  kind text;
  obj jsonb;
  meta jsonb;
  org uuid;
  sub_id text;
  plan text;
  every text;
  period_from bigint;
  period_to bigint;
  amount numeric;
  until date;
begin
  select b.stripe_webhook_secret into secret from private.billing b;
  if secret is null then
    return 'not_configured';
  end if;
  if payload is null or signature is null or length(payload) > 1000000 then
    return 'bad_signature';
  end if;

  -- Stripe's signature: t=<seconds>,v1=<hmac-sha256 of "t.payload">, within 5 minutes
  stamp := nullif(substring(signature from '(?:^|,)\s*t=([0-9]{1,12})'), '')::bigint;
  if stamp is null or abs(extract(epoch from now())::bigint - stamp) > 300 then
    return 'bad_signature';
  end if;
  expected := encode(extensions.hmac(convert_to(stamp::text || '.' || payload, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'), 'hex');
  foreach part in array string_to_array(signature, ',') loop
    if btrim(part) = 'v1=' || expected then
      signed := true;
    end if;
  end loop;
  if not signed then
    return 'bad_signature';
  end if;
  -- signed by Stripe: the agency's billing may change (the guard lets it)
  perform set_config('brixa.billing', 'on', true);

  event := payload::jsonb;
  kind := event ->> 'type';
  insert into public.stripe_events (id, type) values (event ->> 'id', coalesce(kind, '?')) on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;
  obj := event -> 'data' -> 'object';

  -- whose: the metadata BRIXA put on the payment, or the agency's Stripe customer
  meta := coalesce(
    nullif(obj -> 'metadata', '{}'::jsonb),
    obj #> '{parent,subscription_details,metadata}',
    obj #> '{subscription_details,metadata}',
    '{}'::jsonb
  );
  org := coalesce(public.uuid_or_null(obj ->> 'client_reference_id'), public.uuid_or_null(meta ->> 'org'));
  if org is null and obj ->> 'customer' is not null then
    select o.id into org from public.organizations o where o.stripe_customer_id = obj ->> 'customer';
  end if;
  if org is null or not exists (select 1 from public.organizations o where o.id = org) then
    return 'ignored';
  end if;
  plan := (select p.code from public.plans p where p.code = meta ->> 'plan');
  every := case when meta ->> 'interval' in ('month', 'year') then meta ->> 'interval' end;

  if kind = 'checkout.session.completed' then
    if obj ->> 'mode' = 'subscription' then
      update public.organizations
      set stripe_customer_id = coalesce(obj ->> 'customer', stripe_customer_id),
          stripe_subscription_id = coalesce(obj ->> 'subscription', stripe_subscription_id),
          plan_code = coalesce(plan, plan_code),
          billing_interval = coalesce(every, billing_interval),
          auto_renew = true,
          payment_failed_at = null
      where id = org;
    end if;

  elsif kind = 'invoice.paid' then
    sub_id := coalesce(obj #>> '{parent,subscription_details,subscription}', obj ->> 'subscription');
    select max((l #>> '{period,end}')::bigint), min((l #>> '{period,start}')::bigint)
    into period_to, period_from
    from jsonb_array_elements(coalesce(obj #> '{lines,data}', '[]'::jsonb)) l;
    if period_to is null then
      return 'ignored';
    end if;
    until := (to_timestamp(period_to) at time zone 'Europe/Sofia')::date;
    amount := coalesce((obj ->> 'amount_paid')::numeric, 0) / 100;
    update public.organizations
    set paid_until = greatest(coalesce(paid_until, until), until),
        plan_code = coalesce(plan, plan_code),
        billing_interval = coalesce(every, billing_interval),
        stripe_customer_id = coalesce(stripe_customer_id, obj ->> 'customer'),
        stripe_subscription_id = coalesce(sub_id, stripe_subscription_id),
        payment_failed_at = null
    where id = org;
    insert into public.payments (organization_id, method, amount, currency, plan_code, billing_interval, period_start, period_end, stripe_invoice_id, invoice_url, invoice_pdf)
    values (
      org, 'card', amount, upper(coalesce(obj ->> 'currency', 'eur')),
      coalesce(plan, (select plan_code from public.organizations where id = org)),
      coalesce(every, (select billing_interval from public.organizations where id = org)),
      (to_timestamp(period_from) at time zone 'Europe/Sofia')::date, until,
      obj ->> 'id', left(obj ->> 'hosted_invoice_url', 1000), left(obj ->> 'invoice_pdf', 1000)
    )
    on conflict (stripe_invoice_id) do nothing;
    perform public.tell_owners(org, 'payment_received', jsonb_build_object('amount', amount, 'date', until), '/subscription');
    perform public.tell_platform('card_payment', jsonb_build_object(
      'title', (select name from public.organizations where id = org),
      'amount', amount,
      'plan', (select p.name from public.plans p where p.code = coalesce(plan, (select plan_code from public.organizations where id = org)))));

  elsif kind = 'invoice.payment_failed' then
    update public.organizations set payment_failed_at = now() where id = org;
    perform public.tell_owners(org, 'payment_failed', jsonb_build_object('amount', coalesce((obj ->> 'amount_due')::numeric, 0) / 100), '/subscription');

  elsif kind = 'customer.subscription.updated' or kind = 'customer.subscription.created' then
    update public.organizations
    set stripe_subscription_id = obj ->> 'id',
        stripe_customer_id = coalesce(stripe_customer_id, obj ->> 'customer'),
        auto_renew = obj ->> 'status' in ('active', 'trialing', 'past_due')
          and not coalesce((obj ->> 'cancel_at_period_end')::boolean, false)
          and obj ->> 'cancel_at' is null,
        billing_interval = coalesce(
          case when obj #>> '{items,data,0,price,recurring,interval}' in ('month', 'year') then obj #>> '{items,data,0,price,recurring,interval}' end,
          every, billing_interval),
        plan_code = coalesce(plan, plan_code)
    where id = org;

  elsif kind = 'customer.subscription.deleted' then
    update public.organizations
    set auto_renew = false, stripe_subscription_id = null
    where id = org and stripe_subscription_id = obj ->> 'id';
  end if;

  return 'ok';
end;
$$;

revoke execute on function public.stripe_webhook(text, text) from public;
grant execute on function public.stripe_webhook(text, text) to anon, authenticated;

-- every morning: the reminders to the agency's owners
create or replace function public.notify_billing(day date default public.sofia_today())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  sent integer := 0;
  trial_day date;
  price numeric;
begin
  for o in
    select org.* from public.organizations org where not coalesce(org.comped, false)
  loop
    trial_day := (o.trial_ends_at at time zone 'Europe/Sofia')::date;
    if o.auto_renew and o.stripe_subscription_id is not null and o.paid_until = day + 3 then
      -- the card renews by itself: what and when (a year costs 10 months)
      price := (select p.price_month from public.plans p where p.code = o.plan_code)
               * case when o.billing_interval = 'year' then 10 else 1 end;
      perform public.tell_owners(o.id, 'subscription_renews', jsonb_build_object('date', o.paid_until, 'amount', price), '/subscription');
      sent := sent + 1;
    elsif (not o.auto_renew or o.stripe_subscription_id is null) and o.paid_until in (day + 7, day + 3, day + 1) then
      perform public.tell_owners(o.id, 'subscription_ends', jsonb_build_object('date', o.paid_until, 'days', o.paid_until - day), '/subscription');
      sent := sent + 1;
    elsif (o.paid_until is null or o.paid_until < day) and trial_day in (day + 3, day + 1) then
      perform public.tell_owners(o.id, 'trial_ends', jsonb_build_object('date', trial_day, 'days', trial_day - day), '/subscription');
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.notify_billing(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-billing', '0 6 * * *', 'select public.notify_billing()');
  end if;
end;
$$;

-- (067) saving Stripe's secret: insert-or-update (Supabase refuses an UPDATE without WHERE)
create or replace function public.set_stripe_webhook_secret(secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  value text := nullif(btrim(coalesce(secret, '')), '');
begin
  if not public.is_platform_admin() then
    return false;
  end if;
  if value is not null and value !~ '^whsec_[A-Za-z0-9+/=_-]{10,200}$' then
    return false;
  end if;
  insert into private.billing (id, stripe_webhook_secret)
  values (true, value)
  on conflict (id) do update set stripe_webhook_secret = excluded.stripe_webhook_secret;
  return true;
end;
$$;

revoke execute on function public.set_stripe_webhook_secret(text) from public, anon;
grant execute on function public.set_stripe_webhook_secret(text) to authenticated;

-- =====================================================================
-- BRIXA — migration 068: Brix watches the market online
--   Each broker says what to watch (town, neighbourhoods, kinds of
--   property, top price, private sellers only). Every morning Brix
--   searches the portals for new listings of that kind, and checks the
--   listings the brokers follow: the price up or down, or gone from the
--   market. At 08:00 each broker hears what's new.
--   Only the listing is kept (its link, price, area, place, whether a
--   private person sells) — never the seller's phone or name.
-- Run once in Supabase → SQL Editor → New query → Run (after 067).
-- =====================================================================

-- what a broker watches
create table if not exists public.market_watches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  operation text not null default 'sale' check (operation in ('sale', 'rent')),
  settlement_id uuid not null references public.geo_settlements (id) on delete cascade,
  neighborhood_ids uuid[] not null default '{}',
  subtype_ids uuid[] not null default '{}',
  price_max numeric(12, 2) check (price_max is null or price_max > 0),
  private_only boolean not null default false,
  active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists market_watches_profile_idx on public.market_watches (profile_id);

-- the listings Brix found online (one per link in the agency)
create table if not exists public.market_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  url text not null check (url ~ '^https?://' and char_length(url) <= 600),
  portal text,
  title text check (title is null or char_length(title) <= 200),
  operation text check (operation is null or operation in ('sale', 'rent')),
  place text check (place is null or char_length(place) <= 120),
  price_eur numeric(14, 2),
  area numeric(10, 2),
  private boolean,
  status text not null default 'active' check (status in ('active', 'gone')),
  found_by uuid references public.profiles (id) on delete set null,
  watch_id uuid references public.market_watches (id) on delete set null,
  first_seen date not null default public.sofia_today(),
  last_seen date not null default public.sofia_today(),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint market_listings_one unique (organization_id, url)
);
create index if not exists market_listings_org_seen_idx on public.market_listings (organization_id, first_seen desc);

-- what happened to a listing: found, price changed, gone, back
create table if not exists public.market_listing_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.market_listings (id) on delete cascade,
  day date not null default public.sofia_today(),
  kind text not null check (kind in ('new', 'price', 'gone', 'back')),
  price_eur numeric(14, 2),
  old_price_eur numeric(14, 2),
  created_at timestamptz not null default now()
);
create index if not exists market_listing_events_listing_idx on public.market_listing_events (listing_id, created_at desc);

-- who follows which listing
create table if not exists public.market_tracks (
  listing_id uuid not null references public.market_listings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, profile_id)
);
create index if not exists market_tracks_profile_idx on public.market_tracks (profile_id);

-- each morning's work, one job per watch (and per handful of followed listings); its token is the proof
create table if not exists public.scout_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('search', 'track')),
  watch_id uuid references public.market_watches (id) on delete cascade,
  listing_ids uuid[] not null default '{}',
  token uuid not null default gen_random_uuid(),
  day date not null default public.sofia_today(),
  claimed_at timestamptz,
  finished_at timestamptz,
  found int,
  created_at timestamptz not null default now()
);
create index if not exists scout_jobs_day_idx on public.scout_jobs (day);

-- the 08:00 word, once a day
create table if not exists public.scout_digests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (profile_id, day)
);

alter table public.market_watches enable row level security;
alter table public.market_listings enable row level security;
alter table public.market_listing_events enable row level security;
alter table public.market_tracks enable row level security;
alter table public.scout_jobs enable row level security;
alter table public.scout_digests enable row level security;

-- a broker keeps their own watches
drop policy if exists "market watches: own" on public.market_watches;
create policy "market watches: own" on public.market_watches
  for all to authenticated
  using (profile_id = auth.uid() and public.is_org_member(organization_id))
  with check (profile_id = auth.uid() and public.is_org_member(organization_id));

-- what Brix found, the whole agency sees (the market is the same for everyone)
drop policy if exists "market listings: read" on public.market_listings;
create policy "market listings: read" on public.market_listings
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists "market listing events: read" on public.market_listing_events;
create policy "market listing events: read" on public.market_listing_events
  for select to authenticated
  using (exists (select 1 from public.market_listings l where l.id = listing_id and public.is_org_member(l.organization_id)));

-- following: one's own
drop policy if exists "market tracks: own" on public.market_tracks;
create policy "market tracks: own" on public.market_tracks
  for all to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (select 1 from public.market_listings l where l.id = listing_id and public.is_org_member(l.organization_id))
  );

grant select, insert, update, delete on public.market_watches to authenticated;
grant select on public.market_listings, public.market_listing_events to authenticated;
grant select, insert, delete on public.market_tracks to authenticated;
revoke all on public.scout_jobs, public.scout_digests from anon, authenticated;

-- A broker follows a listing by its link (one they found themselves, or one Brix found).
create or replace function public.follow_market_listing(link text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  clean text := left(btrim(coalesce(link, '')), 600);
  found_id uuid;
begin
  select organization_id into org from public.organization_members where profile_id = auth.uid() order by created_at limit 1;
  if org is null or clean !~ '^https?://[^ ]+\.[^ ]+' then return null; end if;
  insert into public.market_listings (organization_id, url, portal, found_by)
  values (org, clean, substring(clean from '^https?://(?:www\.)?([^/]+)'), auth.uid())
  on conflict (organization_id, url) do update set url = excluded.url
  returning id into found_id;
  insert into public.market_tracks (listing_id, profile_id) values (found_id, auth.uid()) on conflict do nothing;
  return found_id;
end;
$$;
revoke execute on function public.follow_market_listing(text) from public, anon;
grant execute on function public.follow_market_listing(text) to authenticated;

-- ---------------------------------------------------------------------
-- The morning's work: the database hands each job to the app
-- (/api/brix/scout) with its token; the app looks online and reports back.
-- ---------------------------------------------------------------------
create or replace function public.start_market_scout(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (at_time at time zone 'Europe/Sofia')::date;
  w record;
  batch record;
  job record;
  started integer := 0;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return 0; end if;

  -- one search per active watch a day
  for w in
    select mw.id, mw.organization_id from public.market_watches mw
    join public.organization_members m on m.organization_id = mw.organization_id and m.profile_id = mw.profile_id
    where mw.active
      and not exists (select 1 from public.scout_jobs j where j.watch_id = mw.id and j.day = today)
  loop
    insert into public.scout_jobs (organization_id, kind, watch_id, day) values (w.organization_id, 'search', w.id, today)
    returning id, token into job;
    perform net.http_post(
      url := 'https://brixa-yavlena.vercel.app/api/brix/scout',
      body := jsonb_build_object('id', job.id, 'token', job.token),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 150000
    );
    started := started + 1;
  end loop;

  -- the followed listings, eight at a time
  for batch in
    select l.organization_id, array_agg(l.id order by l.id) as ids
    from (
      select l.id, l.organization_id, (row_number() over (partition by l.organization_id order by l.id) - 1) / 8 as part
      from public.market_listings l
      where l.status = 'active'
        and exists (select 1 from public.market_tracks t where t.listing_id = l.id)
        and (l.checked_at is null or (l.checked_at at time zone 'Europe/Sofia')::date < today)
    ) l
    group by l.organization_id, l.part
  loop
    continue when exists (select 1 from public.scout_jobs j where j.kind = 'track' and j.day = today and j.listing_ids && batch.ids);
    insert into public.scout_jobs (organization_id, kind, listing_ids, day) values (batch.organization_id, 'track', batch.ids, today)
    returning id, token into job;
    perform net.http_post(
      url := 'https://brixa-yavlena.vercel.app/api/brix/scout',
      body := jsonb_build_object('id', job.id, 'token', job.token),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 150000
    );
    started := started + 1;
  end loop;
  return started;
end;
$$;
revoke execute on function public.start_market_scout(timestamptz) from public, anon, authenticated;

-- The app takes a job with its token (once) and gets what to look for.
create or replace function public.scout_claim(target uuid, job_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job record;
  result jsonb;
begin
  update public.scout_jobs set claimed_at = now()
  where id = target and token = job_token and claimed_at is null and created_at > now() - interval '6 hours'
  returning * into job;
  if not found then return null; end if;

  if job.kind = 'search' then
    select jsonb_build_object(
      'kind', 'search',
      'operation', w.operation,
      'town', s.name,
      'neighborhoods', coalesce((select jsonb_agg(n.name order by n.name) from public.geo_neighborhoods n where n.id = any (w.neighborhood_ids)), '[]'),
      'kinds', coalesce((select jsonb_agg(p.name order by p.sort_order) from public.property_subtypes p where p.id = any (w.subtype_ids)), '[]'),
      'price_max', w.price_max,
      'private_only', w.private_only,
      -- what is already known, so it isn't reported again
      'known', coalesce((
        select jsonb_agg(k.url) from (
          select l.url from public.market_listings l
          where l.organization_id = w.organization_id
          order by l.last_seen desc limit 150
        ) k
      ), '[]')
    ) into result
    from public.market_watches w
    join public.geo_settlements s on s.id = w.settlement_id
    where w.id = job.watch_id;
  else
    select jsonb_build_object(
      'kind', 'track',
      'listings', coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'url', l.url, 'price_eur', l.price_eur)), '[]')
    ) into result
    from public.market_listings l
    where l.id = any (job.listing_ids);
  end if;
  return result;
end;
$$;
revoke execute on function public.scout_claim(uuid, uuid) from public;
grant execute on function public.scout_claim(uuid, uuid) to anon, authenticated;

-- The app reports what it found (once per job).
--   search: {"listings": [{url, title, price_eur, area, place, private}]}
--   track:  {"listings": [{id, status: active|gone|unknown, price_eur}]}
create or replace function public.scout_report(target uuid, job_token uuid, payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  job record;
  w record;
  item jsonb;
  link text;
  price numeric;
  listing record;
  counted integer := 0;
begin
  update public.scout_jobs set finished_at = now()
  where id = target and token = job_token and claimed_at is not null and finished_at is null
  returning * into job;
  if not found then return null; end if;

  if job.kind = 'search' then
    select * into w from public.market_watches where id = job.watch_id;
    if not found then return 0; end if;
    update public.market_watches set last_run_at = now() where id = w.id;
    for item in select * from jsonb_array_elements(coalesce(payload -> 'listings', '[]')) limit 30 loop
      link := left(btrim(coalesce(item ->> 'url', '')), 600);
      continue when link !~ '^https?://[^ ]+\.[^ ]+';
      price := case when (item ->> 'price_eur') ~ '^[0-9]+(\.[0-9]+)?$' then (item ->> 'price_eur')::numeric end;
      insert into public.market_listings (organization_id, url, portal, title, operation, place, price_eur, area, private, found_by, watch_id)
      values (
        w.organization_id, link, substring(link from '^https?://(?:www\.)?([^/]+)'),
        left(item ->> 'title', 200), w.operation, left(item ->> 'place', 120), price,
        case when (item ->> 'area') ~ '^[0-9]+(\.[0-9]+)?$' and (item ->> 'area')::numeric < 100000 then (item ->> 'area')::numeric end,
        case when item ->> 'private' in ('true', 'false') then (item ->> 'private')::boolean end,
        w.profile_id, w.id
      )
      on conflict (organization_id, url) do update set last_seen = public.sofia_today()
      returning id, (xmax = 0) as fresh into listing;
      if listing.fresh then
        insert into public.market_listing_events (listing_id, kind, price_eur) values (listing.id, 'new', price);
        counted := counted + 1;
      end if;
    end loop;
  else
    for item in select * from jsonb_array_elements(coalesce(payload -> 'listings', '[]')) loop
      select * into listing from public.market_listings
      where id = public.uuid_or_null(item ->> 'id') and id = any (job.listing_ids);
      continue when not found;
      price := case when (item ->> 'price_eur') ~ '^[0-9]+(\.[0-9]+)?$' then (item ->> 'price_eur')::numeric end;
      if item ->> 'status' = 'gone' then
        if listing.status = 'active' then
          update public.market_listings set status = 'gone', checked_at = now() where id = listing.id;
          insert into public.market_listing_events (listing_id, kind, price_eur) values (listing.id, 'gone', listing.price_eur);
          counted := counted + 1;
        end if;
      elsif item ->> 'status' = 'active' then
        if listing.price_eur is not null and price is not null and abs(price - listing.price_eur) >= greatest(1, listing.price_eur * 0.005) then
          insert into public.market_listing_events (listing_id, kind, price_eur, old_price_eur) values (listing.id, 'price', price, listing.price_eur);
          counted := counted + 1;
        end if;
        update public.market_listings
        set price_eur = coalesce(price, price_eur), last_seen = public.sofia_today(), checked_at = now(),
            title = coalesce(title, left(item ->> 'title', 200)),
            area = coalesce(area, case when (item ->> 'area') ~ '^[0-9]+(\.[0-9]+)?$' and (item ->> 'area')::numeric < 100000 then (item ->> 'area')::numeric end),
            place = coalesce(place, left(item ->> 'place', 120)),
            private = coalesce(private, case when item ->> 'private' in ('true', 'false') then (item ->> 'private')::boolean end)
        where id = listing.id;
      else
        update public.market_listings set checked_at = now() where id = listing.id;
      end if;
    end loop;
  end if;

  update public.scout_jobs set found = counted where id = job.id;
  return counted;
end;
$$;
revoke execute on function public.scout_report(uuid, uuid, jsonb) from public;
grant execute on function public.scout_report(uuid, uuid, jsonb) to anon, authenticated;

-- "Search now" on a watch: today's search at once (still one a day per watch).
create or replace function public.run_market_watch(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  job record;
  today date := public.sofia_today();
begin
  select * into w from public.market_watches where id = target and profile_id = auth.uid() and active;
  if not found or not exists (select 1 from pg_extension where extname = 'pg_net') then return false; end if;
  if exists (select 1 from public.scout_jobs j where j.watch_id = w.id and j.day = today) then return false; end if;
  insert into public.scout_jobs (organization_id, kind, watch_id, day) values (w.organization_id, 'search', w.id, today)
  returning id, token into job;
  perform net.http_post(
    url := 'https://brixa-yavlena.vercel.app/api/brix/scout',
    body := jsonb_build_object('id', job.id, 'token', job.token),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 150000
  );
  return true;
end;
$$;
revoke execute on function public.run_market_watch(uuid) from public, anon;
grant execute on function public.run_market_watch(uuid) to authenticated;

-- at most five watches a broker (each one is a search on the web every morning)
create or replace function public.guard_market_watches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.market_watches where profile_id = new.profile_id) >= 5 then
    raise exception 'too many watches' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists market_watches_limit on public.market_watches;
create trigger market_watches_limit before insert on public.market_watches
  for each row execute function public.guard_market_watches();

-- 08:00: each broker hears what's new — the new listings their watches found since yesterday's
-- word (and how many private sellers among them), and what happened to the listings they follow.
create or replace function public.notify_market_scout(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  person record;
  sent integer := 0;
begin
  if local_now::time < time '08:00' then return 0; end if;

  for person in
    select m.organization_id, m.profile_id,
      (select count(*)::int from public.market_listing_events e join public.market_listings l on l.id = e.listing_id
        join public.market_watches w on w.id = l.watch_id
        where w.profile_id = m.profile_id and e.kind = 'new' and e.day between today - 1 and today) as fresh,
      (select count(*)::int from public.market_listing_events e join public.market_listings l on l.id = e.listing_id
        join public.market_watches w on w.id = l.watch_id
        where w.profile_id = m.profile_id and e.kind = 'new' and e.day between today - 1 and today and l.private) as private,
      (select count(*)::int from public.market_listing_events e join public.market_tracks t on t.listing_id = e.listing_id
        where t.profile_id = m.profile_id and e.kind in ('price', 'gone') and e.day between today - 1 and today) as changed
    from public.organization_members m
    where exists (select 1 from public.market_watches w where w.profile_id = m.profile_id)
       or exists (select 1 from public.market_tracks t where t.profile_id = m.profile_id)
  loop
    continue when person.fresh + person.changed = 0;
    insert into public.scout_digests (profile_id, day) values (person.profile_id, today) on conflict do nothing;
    continue when not found;
    perform public.notify(
      person.organization_id, person.profile_id, null, 'market_scout',
      jsonb_build_object('count', person.fresh, 'properties', person.private, 'deals', person.changed),
      '/market/scout'
    );
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke execute on function public.notify_market_scout(timestamptz) from public, anon, authenticated;

-- old jobs go after a month
create or replace function public.clean_scout_jobs()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.scout_jobs where created_at < now() - interval '30 days';
  delete from public.scout_digests where day < public.sofia_today() - 30;
$$;
revoke execute on function public.clean_scout_jobs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 05:40 Sofia in summer (04:40 in winter): the search is done well before the 08:00 word
    perform cron.schedule('brixa-market-scout', '40 2 * * *', 'select public.start_market_scout()');
    perform cron.schedule('brixa-market-scout-word', '*/15 * * * *', 'select public.notify_market_scout()');
    perform cron.schedule('brixa-market-scout-clean', '20 4 * * *', 'select public.clean_scout_jobs()');
  end if;
end;
$$;

-- =====================================================================
-- BRIXA — migration 069: the market's prices keep themselves up to date
--   1. Every Monday Brix reads the portals' price statistics (average €/m²
--      of apartments by neighbourhood, for sale and for rent) for the towns
--      the agency works in, and Market → Prices by area is filled in by
--      itself. A price a person entered stays untouched for 30 days.
--   2. A listing's stars and its estimate count the real sales too: the
--      deals closed nearby in the last year (the register and BRIXA's own),
--      turned back into asking prices with the usual haggling, weigh up to
--      half — the more sales there are, the more they weigh.
-- Run once in Supabase → SQL Editor → New query → Run (after 068).
-- =====================================================================

-- the jobs: a town's prices, for sale or for rent
alter table public.scout_jobs drop constraint if exists scout_jobs_kind_check;
alter table public.scout_jobs add constraint scout_jobs_kind_check check (kind in ('search', 'track', 'prices'));
alter table public.scout_jobs
  add column if not exists settlement_id uuid references public.geo_settlements (id) on delete cascade,
  add column if not exists operation text check (operation is null or operation in ('sale', 'rent'));

-- One town's prices, for sale and for rent: the jobs handed to the app (/api/brix/scout).
create or replace function public.start_price_jobs(target_org uuid, target_settlement uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  op text;
  job record;
  started integer := 0;
  today date := public.sofia_today();
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return 0; end if;
  foreach op in array array['sale', 'rent'] loop
    continue when exists (
      select 1 from public.scout_jobs j
      where j.kind = 'prices' and j.organization_id = target_org and j.settlement_id = target_settlement
        and j.operation = op and j.day = today
    );
    insert into public.scout_jobs (organization_id, kind, settlement_id, operation, day)
    values (target_org, 'prices', target_settlement, op, today)
    returning id, token into job;
    perform net.http_post(
      url := 'https://brixa-yavlena.vercel.app/api/brix/scout',
      body := jsonb_build_object('id', job.id, 'token', job.token),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 150000
    );
    started := started + 1;
  end loop;
  return started;
end;
$$;
revoke execute on function public.start_price_jobs(uuid, uuid) from public, anon, authenticated;

-- Monday morning: the three towns each agency works in most (that have neighbourhoods to price).
create or replace function public.start_price_refresh()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  town record;
  started integer := 0;
begin
  for town in
    select x.organization_id, x.settlement_id
    from (
      select p.organization_id, p.settlement_id,
        row_number() over (partition by p.organization_id order by count(*) desc) as place
      from public.properties p
      where p.settlement_id is not null
        and exists (select 1 from public.geo_neighborhoods n where n.settlement_id = p.settlement_id)
      group by p.organization_id, p.settlement_id
    ) x
    where x.place <= 3
  loop
    started := started + public.start_price_jobs(town.organization_id, town.settlement_id);
  end loop;
  return started;
end;
$$;
revoke execute on function public.start_price_refresh() from public, anon, authenticated;

-- "Refresh now" in Market (the owner or an office manager): today's look for one town.
create or replace function public.refresh_market_prices(target_settlement uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  select m.organization_id into org from public.organization_members m where m.profile_id = auth.uid() order by m.created_at limit 1;
  if org is null or not public.is_org_leader(org) then return 0; end if;
  if not exists (select 1 from public.geo_neighborhoods n where n.settlement_id = target_settlement) then return 0; end if;
  return public.start_price_jobs(org, target_settlement);
end;
$$;
revoke execute on function public.refresh_market_prices(uuid) from public, anon;
grant execute on function public.refresh_market_prices(uuid) to authenticated;

-- The app takes a job with its token: now also a town's prices (its neighbourhoods by name).
create or replace function public.scout_claim(target uuid, job_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job record;
  result jsonb;
begin
  update public.scout_jobs set claimed_at = now()
  where id = target and token = job_token and claimed_at is null and created_at > now() - interval '6 hours'
  returning * into job;
  if not found then return null; end if;

  if job.kind = 'search' then
    select jsonb_build_object(
      'kind', 'search',
      'operation', w.operation,
      'town', s.name,
      'neighborhoods', coalesce((select jsonb_agg(n.name order by n.name) from public.geo_neighborhoods n where n.id = any (w.neighborhood_ids)), '[]'),
      'kinds', coalesce((select jsonb_agg(p.name order by p.sort_order) from public.property_subtypes p where p.id = any (w.subtype_ids)), '[]'),
      'price_max', w.price_max,
      'private_only', w.private_only,
      'known', coalesce((
        select jsonb_agg(k.url) from (
          select l.url from public.market_listings l
          where l.organization_id = w.organization_id
          order by l.last_seen desc limit 150
        ) k
      ), '[]')
    ) into result
    from public.market_watches w
    join public.geo_settlements s on s.id = w.settlement_id
    where w.id = job.watch_id;
  elsif job.kind = 'prices' then
    select jsonb_build_object(
      'kind', 'prices',
      'operation', job.operation,
      'town', s.name,
      'neighborhoods', coalesce((select jsonb_agg(n.name order by n.name) from public.geo_neighborhoods n where n.settlement_id = s.id), '[]')
    ) into result
    from public.geo_settlements s
    where s.id = job.settlement_id;
  else
    select jsonb_build_object(
      'kind', 'track',
      'listings', coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'url', l.url, 'price_eur', l.price_eur)), '[]')
    ) into result
    from public.market_listings l
    where l.id = any (job.listing_ids);
  end if;
  return result;
end;
$$;
revoke execute on function public.scout_claim(uuid, uuid) from public;
grant execute on function public.scout_claim(uuid, uuid) to anon, authenticated;

-- A town's prices, as the app read them from the portals' statistics:
--   {"source": "imot.bg", "town_price": 2150, "prices": [{"neighborhood": "Левски", "price": 2300}]}
-- Each neighbourhood is matched by its name; a price a person entered in the last 30 days stays.
create or replace function public.report_market_prices(job public.scout_jobs, payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  hood uuid;
  amount numeric;
  label text := left('Brix · ' || coalesce(nullif(btrim(payload ->> 'source'), ''), 'порталите'), 120);
  saved integer := 0;
  rows jsonb := coalesce(payload -> 'prices', '[]');
begin
  -- the whole town, as one more row (no neighbourhood)
  if (payload ->> 'town_price') ~ '^[0-9]+(\.[0-9]+)?$' then
    rows := rows || jsonb_build_array(jsonb_build_object('neighborhood', null, 'price', payload ->> 'town_price'));
  end if;

  for item in select * from jsonb_array_elements(rows) limit 200 loop
    amount := case when (item ->> 'price') ~ '^[0-9]+(\.[0-9]+)?$' then (item ->> 'price')::numeric end;
    -- a sane €/m² only (rent: a month)
    continue when amount is null
      or (job.operation = 'sale' and (amount < 200 or amount > 20000))
      or (job.operation = 'rent' and (amount < 1 or amount > 100));
    hood := null;
    if item ->> 'neighborhood' is not null then
      select n.id into hood from public.geo_neighborhoods n
      where n.settlement_id = job.settlement_id and lower(btrim(n.name)) = lower(btrim(item ->> 'neighborhood'))
      limit 1;
      continue when hood is null;
    end if;

    insert into public.market_prices
      (organization_id, operation, settlement_id, neighborhood_id, price_per_sqm, source, as_of, updated_by, updated_at)
    values (job.organization_id, job.operation, job.settlement_id, hood, round(amount, 2), label, public.sofia_today(), null, now())
    on conflict on constraint market_prices_one do update
      set price_per_sqm = excluded.price_per_sqm, source = excluded.source, as_of = excluded.as_of,
          updated_by = null, updated_at = now()
      where public.market_prices.updated_by is null or public.market_prices.updated_at < now() - interval '30 days';
    if found then saved := saved + 1; end if;
  end loop;

  if saved > 0 then
    perform public.refresh_org_stars(job.organization_id);
  end if;
  return saved;
end;
$$;
revoke execute on function public.report_market_prices(public.scout_jobs, jsonb) from public, anon, authenticated;

-- scout_report: the prices job goes to report_market_prices (search and track as in 068)
create or replace function public.scout_report(target uuid, job_token uuid, payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.scout_jobs;
  w record;
  item jsonb;
  link text;
  price numeric;
  listing record;
  counted integer := 0;
begin
  update public.scout_jobs set finished_at = now()
  where id = target and token = job_token and claimed_at is not null and finished_at is null
  returning * into job;
  if not found then return null; end if;

  if job.kind = 'prices' then
    counted := public.report_market_prices(job, payload);
  elsif job.kind = 'search' then
    select * into w from public.market_watches where id = job.watch_id;
    if not found then return 0; end if;
    update public.market_watches set last_run_at = now() where id = w.id;
    for item in select * from jsonb_array_elements(coalesce(payload -> 'listings', '[]')) limit 30 loop
      link := left(btrim(coalesce(item ->> 'url', '')), 600);
      continue when link !~ '^https?://[^ ]+\.[^ ]+';
      price := case when (item ->> 'price_eur') ~ '^[0-9]+(\.[0-9]+)?$' then (item ->> 'price_eur')::numeric end;
      insert into public.market_listings (organization_id, url, portal, title, operation, place, price_eur, area, private, found_by, watch_id)
      values (
        w.organization_id, link, substring(link from '^https?://(?:www\.)?([^/]+)'),
        left(item ->> 'title', 200), w.operation, left(item ->> 'place', 120), price,
        case when (item ->> 'area') ~ '^[0-9]+(\.[0-9]+)?$' and (item ->> 'area')::numeric < 100000 then (item ->> 'area')::numeric end,
        case when item ->> 'private' in ('true', 'false') then (item ->> 'private')::boolean end,
        w.profile_id, w.id
      )
      on conflict (organization_id, url) do update set last_seen = public.sofia_today()
      returning id, (xmax = 0) as fresh into listing;
      if listing.fresh then
        insert into public.market_listing_events (listing_id, kind, price_eur) values (listing.id, 'new', price);
        counted := counted + 1;
      end if;
    end loop;
  else
    for item in select * from jsonb_array_elements(coalesce(payload -> 'listings', '[]')) loop
      select * into listing from public.market_listings
      where id = public.uuid_or_null(item ->> 'id') and id = any (job.listing_ids);
      continue when not found;
      price := case when (item ->> 'price_eur') ~ '^[0-9]+(\.[0-9]+)?$' then (item ->> 'price_eur')::numeric end;
      if item ->> 'status' = 'gone' then
        if listing.status = 'active' then
          update public.market_listings set status = 'gone', checked_at = now() where id = listing.id;
          insert into public.market_listing_events (listing_id, kind, price_eur) values (listing.id, 'gone', listing.price_eur);
          counted := counted + 1;
        end if;
      elsif item ->> 'status' = 'active' then
        if listing.price_eur is not null and price is not null and abs(price - listing.price_eur) >= greatest(1, listing.price_eur * 0.005) then
          insert into public.market_listing_events (listing_id, kind, price_eur, old_price_eur) values (listing.id, 'price', price, listing.price_eur);
          counted := counted + 1;
        end if;
        update public.market_listings
        set price_eur = coalesce(price, price_eur), last_seen = public.sofia_today(), checked_at = now(),
            title = coalesce(title, left(item ->> 'title', 200)),
            area = coalesce(area, case when (item ->> 'area') ~ '^[0-9]+(\.[0-9]+)?$' and (item ->> 'area')::numeric < 100000 then (item ->> 'area')::numeric end),
            place = coalesce(place, left(item ->> 'place', 120)),
            private = coalesce(private, case when item ->> 'private' in ('true', 'false') then (item ->> 'private')::boolean end)
        where id = listing.id;
      else
        update public.market_listings set checked_at = now() where id = listing.id;
      end if;
    end loop;
  end if;

  update public.scout_jobs set found = counted where id = job.id;
  return counted;
end;
$$;
revoke execute on function public.scout_report(uuid, uuid, jsonb) from public;
grant execute on function public.scout_report(uuid, uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- The stars count the real sales: what sold nearby in the last year,
-- turned back into an asking price (÷ (1 − the usual haggling)), weighs
-- 5% a sale, up to half; the rest is what the stars measured before
-- (the comparables, the Market price, else the agency's listings).
-- ---------------------------------------------------------------------
create or replace function public.price_rating(target_property uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.properties;
  facts jsonb;
  own numeric;
  added int;
  pool int;
  pool_median numeric;
  bench numeric;
  basis text;
  diff numeric;
  stars int;
  sold_count int;
  sold_sqm numeric;
  haggling numeric;
  sold_ask numeric;
  sold_weight numeric := 0;
begin
  select * into p from public.properties where id = target_property;
  if p.id is null or p.operation_type not in ('sale', 'rent') then
    return null;
  end if;
  facts := public.market_facts(p.id);
  if facts is null then
    return null;
  end if;
  own := (facts ->> 'own_sqm')::numeric;

  -- the comparables: the ones the broker added and the agency's own similar listings nearby
  select count(*) into added from public.property_comparables c where c.property_id = p.id;
  select count(*), percentile_cont(0.5) within group (order by sqm)
    into pool, pool_median
  from (
    select public.to_eur(c.price, c.currency) / c.area as sqm
    from public.property_comparables c
    where c.property_id = p.id
    union all
    select x.price_eur / x.area
    from public.market_pool(p.id) x
    where (facts ->> 'scope' = 'city' or x.same_neighborhood)
      and x.status in ('active', 'reserved') and x.price_eur > 0
  ) found_comparables
  where sqm > 0;

  if added > 0 and pool >= 3 then
    bench := round(pool_median, 2);
    basis := 'comparables';
  else
    bench := (facts -> 'benchmark' ->> 'sqm')::numeric;
    basis := facts -> 'benchmark' ->> 'basis';
  end if;

  -- the real sales (sale listings only: a rent's "sale" is a let, kept apart)
  sold_count := coalesce((facts -> 'sold' ->> 'count')::int, 0);
  sold_sqm := (facts -> 'sold' ->> 'median_sqm')::numeric;
  if p.operation_type = 'sale' and sold_count >= 2 and sold_sqm > 0 then
    haggling := coalesce((facts ->> 'discount')::numeric, 0.05);
    sold_ask := sold_sqm / (1 - least(greatest(haggling, 0), 0.3));
    if bench > 0 then
      sold_weight := least(0.5, 0.05 * sold_count);
      bench := round(bench * (1 - sold_weight) + sold_ask * sold_weight, 2);
    elsif sold_count >= 3 then
      sold_weight := 1;
      bench := round(sold_ask, 2);
      basis := 'sold';
    end if;
  end if;

  if bench > 0 and own > 0 then
    diff := own / bench - 1;
    stars := case
      when diff <= -0.10 then 5
      when diff <= -0.03 then 4
      when diff < 0.03 then 3
      when diff < 0.10 then 2
      else 1
    end;
  end if;

  return facts || jsonb_build_object(
    'rating', case when stars is not null then jsonb_build_object(
      'stars', stars,
      'diff', round(diff, 4),
      'bench_sqm', bench,
      'basis', basis,
      'added', added,
      'pool', pool,
      -- the sales counted, and how much they weighed
      'sold', case when sold_weight > 0 then sold_count else 0 end,
      'sold_weight', round(sold_weight, 2),
      'estimate', case when p.area > 0 then jsonb_build_object(
        'low', round(bench * p.area * 0.95, -2),
        'mid', round(bench * p.area, -2),
        'high', round(bench * p.area * 1.05, -2)) end
    ) end
  );
end;
$$;
revoke execute on function public.price_rating(uuid) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Mondays, 06:10 Sofia in summer (05:10 in winter)
    perform cron.schedule('brixa-market-prices', '10 3 * * 1', 'select public.start_price_refresh()');
  end if;
end;
$$;

-- every listing's stars at once, with the sales in
select public.refresh_all_stars();

-- =====================================================================
-- BRIXA — migration 070: a listing Brix finds goes to the buyers it fits
--   When Brix's morning search finds a new listing, it is checked against
--   every buyer's (or tenant's) search in the agency: the deal, the town,
--   the neighbourhoods, the kind of property, the budget and the size.
--   The client's broker hears of it ("A listing in Levski for 118 000 €
--   fits Maria Petrova") and sends it to the client in a tap.
-- Run once in Supabase → SQL Editor → New query → Run (after 069).
-- =====================================================================

create table if not exists public.market_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  listing_id uuid not null references public.market_listings (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  broker_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  dismissed_at timestamptz,
  constraint market_matches_one unique (listing_id, client_id)
);
create index if not exists market_matches_broker_idx on public.market_matches (broker_id, created_at desc);

alter table public.market_matches enable row level security;
drop policy if exists "market matches: read" on public.market_matches;
create policy "market matches: read" on public.market_matches
  for select to authenticated
  using (broker_id = auth.uid() or public.is_org_manager(organization_id));
drop policy if exists "market matches: mark" on public.market_matches;
create policy "market matches: mark" on public.market_matches
  for update to authenticated
  using (broker_id = auth.uid())
  with check (broker_id = auth.uid());
grant select, update (sent_at, dismissed_at) on public.market_matches to authenticated;

-- One listing against every buyer's search; the matches kept, the brokers told (in the day).
create or replace function public.match_market_listing(target uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.market_listings;
  w public.market_watches;
  local_now timestamp := now() at time zone 'Europe/Sofia';
  added integer := 0;
  broker record;
begin
  select * into l from public.market_listings where id = target;
  if not found or l.status <> 'active' or l.price_eur is null or l.watch_id is null then return 0; end if;
  select * into w from public.market_watches where id = l.watch_id;
  if not found then return 0; end if;

  with fits as (
    select c.id as client_id, c.responsible_broker_id as broker_id
    from public.clients c
    join public.client_searches s on s.client_id = c.id
    where c.organization_id = l.organization_id
      and c.responsible_broker_id is not null
      and c.stage not in ('deal', 'lost')
      and c.types && array['buyer', 'tenant', 'investor']
      and s.operation = coalesce(l.operation, w.operation)
      -- the town
      and (cardinality(s.settlement_ids) = 0 or w.settlement_id = any (s.settlement_ids))
      -- the neighbourhoods: the listing's place has to name one of them
      and (
        cardinality(s.neighborhood_ids) = 0
        or exists (
          select 1 from public.geo_neighborhoods n
          where n.id = any (s.neighborhood_ids)
            and (coalesce(l.place, '') || ' ' || coalesce(l.title, '')) ilike '%' || n.name || '%'
        )
      )
      -- the kind: the same one searched, or named in the listing's title
      and (
        cardinality(s.subtype_ids) = 0
        or s.subtype_ids && w.subtype_ids
        or exists (
          select 1 from public.property_subtypes st
          where st.id = any (s.subtype_ids) and coalesce(l.title, '') ilike '%' || st.name || '%'
        )
      )
      -- the budget (a little room above it: prices are haggled)
      and (s.budget_max is null or l.price_eur <= coalesce(public.to_eur(s.budget_max, s.currency), s.budget_max) * 1.05)
      and (s.budget_min is null or l.price_eur >= coalesce(public.to_eur(s.budget_min, s.currency), s.budget_min) * 0.9)
      -- the size, when the listing says it
      and (l.area is null or s.area_min is null or l.area >= s.area_min * 0.95)
      and (l.area is null or s.area_max is null or l.area <= s.area_max * 1.05)
      -- someone's actual budget or place, not just "anything anywhere"
      and (s.budget_max is not null or cardinality(s.neighborhood_ids) > 0)
    order by c.updated_at desc
    limit 10
  ),
  saved as (
    insert into public.market_matches (organization_id, listing_id, client_id, broker_id)
    select l.organization_id, l.id, f.client_id, f.broker_id from fits f
    on conflict do nothing
    returning client_id, broker_id
  )
  select count(*) into added from saved;

  -- in the day each broker hears at once (the night's finds come with the 08:00 word)
  if added > 0 and local_now::time between time '08:00' and time '21:00' then
    for broker in
      select m.broker_id, count(*)::int as clients,
        (array_agg(c.full_name order by c.full_name))[1] as first_name
      from public.market_matches m
      join public.clients c on c.id = m.client_id
      where m.listing_id = l.id and m.created_at > now() - interval '1 minute' and m.broker_id is not null
      group by m.broker_id
    loop
      perform public.notify(
        l.organization_id, broker.broker_id, null, 'market_match',
        jsonb_build_object('title', coalesce(l.place, l.title, ''), 'amount', l.price_eur, 'client', broker.first_name, 'count', broker.clients),
        '/market/scout?view=matches'
      );
    end loop;
  end if;
  return added;
end;
$$;
revoke execute on function public.match_market_listing(uuid) from public, anon, authenticated;

create or replace function public.match_new_market_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.match_market_listing(new.listing_id);
  return new;
end;
$$;
revoke execute on function public.match_new_market_listing() from public, anon, authenticated;

drop trigger if exists market_listing_events_match on public.market_listing_events;
create trigger market_listing_events_match
  after insert on public.market_listing_events
  for each row when (new.kind = 'new')
  execute function public.match_new_market_listing();

-- The 08:00 word also says how many new listings fit the broker's buyers.
create or replace function public.notify_market_scout(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  person record;
  sent integer := 0;
begin
  if local_now::time < time '08:00' then return 0; end if;

  for person in
    select m.organization_id, m.profile_id,
      (select count(*)::int from public.market_listing_events e join public.market_listings l on l.id = e.listing_id
        join public.market_watches w on w.id = l.watch_id
        where w.profile_id = m.profile_id and e.kind = 'new' and e.day between today - 1 and today) as fresh,
      (select count(*)::int from public.market_listing_events e join public.market_listings l on l.id = e.listing_id
        join public.market_watches w on w.id = l.watch_id
        where w.profile_id = m.profile_id and e.kind = 'new' and e.day between today - 1 and today and l.private) as private,
      (select count(*)::int from public.market_listing_events e join public.market_tracks t on t.listing_id = e.listing_id
        where t.profile_id = m.profile_id and e.kind in ('price', 'gone') and e.day between today - 1 and today) as changed,
      (select count(distinct mm.listing_id)::int from public.market_matches mm
        where mm.broker_id = m.profile_id and mm.created_at >= (today - 1)::timestamp at time zone 'Europe/Sofia') as matched
    from public.organization_members m
    where exists (select 1 from public.market_watches w where w.profile_id = m.profile_id)
       or exists (select 1 from public.market_tracks t where t.profile_id = m.profile_id)
       or exists (select 1 from public.market_matches mm where mm.broker_id = m.profile_id and mm.created_at > now() - interval '2 days')
  loop
    continue when person.fresh + person.changed + person.matched = 0;
    insert into public.scout_digests (profile_id, day) values (person.profile_id, today) on conflict do nothing;
    continue when not found;
    perform public.notify(
      person.organization_id, person.profile_id, null, 'market_scout',
      jsonb_build_object('count', person.fresh, 'properties', person.private, 'deals', person.changed, 'clients', person.matched),
      case when person.matched > 0 then '/market/scout?view=matches' else '/market/scout' end
    );
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke execute on function public.notify_market_scout(timestamptz) from public, anon, authenticated;

-- =====================================================================
-- BRIXA — migration 071: one word a morning for a team's leader
--   The owner and the managers no longer get a notification for every
--   task, follow-up or deal date someone in the team missed (some got 20
--   to 30 a day). Those go into the 08:00 word instead, next to their
--   own day: "Your day: 3 tasks… Your team: 7 overdue tasks (Иван,
--   Мария…), 4 clients not called, 2 deal steps today, 1 client freed."
-- Run once in Supabase → SQL Editor → New query → Run (after 070).
-- =====================================================================

-- what happened in the team, kept for the leader's morning word
create table if not exists public.team_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  manager_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists team_events_manager_idx on public.team_events (manager_id, created_at desc);
alter table public.team_events enable row level security;
revoke all on public.team_events from anon, authenticated;

-- every notification goes through here: a team's misses wait for the morning, the rest go at once
create or replace function public.notify(
  target_org uuid, recipient uuid, actor uuid, kind text, payload jsonb, target_link text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if kind in ('task_overdue_team', 'tasks_missed_team', 'follow_up_missed_team', 'client_released_team', 'deal_date_team') then
    insert into public.team_events (organization_id, manager_id, actor_id, kind)
    values (target_org, recipient, actor, kind);
    return;
  end if;
  insert into public.notifications (organization_id, recipient_id, actor_id, type, data, link)
  values (target_org, recipient, actor, kind, coalesce(payload, '{}'), target_link);
end;
$$;
revoke execute on function public.notify(uuid, uuid, uuid, text, jsonb, text) from public, anon, authenticated;

-- 08:00: my day, and — for whoever leads people — the team's, in the same word
create or replace function public.notify_morning_brief(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  end_of_day timestamptz := (today + 1)::timestamp at time zone 'Europe/Sofia';
  since timestamptz := at_time - interval '24 hours';
  stages text[] := array['viewing', 'offer', 'deposit', 'preliminary', 'notary'];
  person record;
  team_tasks integer;
  team_followups integer;
  team_steps integer;
  team_released integer;
  team_names text;
  sent integer := 0;
begin
  if local_now::time < time '08:00' then return 0; end if;

  for person in
    select m.organization_id, m.profile_id, m.role,
      (select count(*)::int from public.tasks t
        where t.assigned_to = m.profile_id and t.status = 'open' and t.due_date <= today) as tasks,
      (select count(*)::int from public.clients c
        where c.responsible_broker_id = m.profile_id and c.follow_up_at < end_of_day) as followups,
      (select array_to_string((array_agg(c.full_name order by c.follow_up_at))[1:2], ', ') from public.clients c
        where c.responsible_broker_id = m.profile_id and c.follow_up_at < end_of_day) as names,
      (select count(*)::int from public.deals d
        cross join lateral (values
          ('viewing', d.viewing_on), ('offer', d.offer_on), ('deposit', d.deposit_on),
          ('preliminary', d.preliminary_on), ('notary', d.notary_on)
        ) as s (stage, due)
        where d.broker_id = m.profile_id and d.status = 'open' and s.due = today
          and (array_position(stages, s.stage) > array_position(stages, d.stage)
               or (s.stage = d.stage and s.stage in ('viewing', 'notary')))) as steps
    from public.organization_members m
  loop
    team_tasks := 0; team_followups := 0; team_steps := 0; team_released := 0; team_names := null;
    if person.role <> 'broker' then
      -- the people this person leads, as they stand this morning
      select
        (select count(*)::int from public.tasks t
          where t.organization_id = person.organization_id and t.status = 'open' and t.due_date < today
            and t.assigned_to <> person.profile_id and public.oversees_as(person.profile_id, t.assigned_to)) as tasks,
        (select count(*)::int from public.clients c
          where c.organization_id = person.organization_id and c.follow_up_at < at_time
            and c.responsible_broker_id is not null and c.responsible_broker_id <> person.profile_id
            and public.oversees_as(person.profile_id, c.responsible_broker_id)) as followups,
        (select count(*)::int from public.deals d
          cross join lateral (values
            ('viewing', d.viewing_on), ('offer', d.offer_on), ('deposit', d.deposit_on),
            ('preliminary', d.preliminary_on), ('notary', d.notary_on)
          ) as s (stage, due)
          where d.organization_id = person.organization_id and d.status = 'open' and s.due = today
            and d.broker_id <> person.profile_id and public.oversees_as(person.profile_id, d.broker_id)) as steps,
        (select count(*)::int from public.team_events e
          where e.manager_id = person.profile_id and e.kind = 'client_released_team' and e.created_at >= since) as released,
        -- who is behind the most
        (select array_to_string((array_agg(x.name order by x.late desc))[1:3], ', ')
          from (
            select public.person_name(t.assigned_to) as name, count(*) as late
            from public.tasks t
            where t.organization_id = person.organization_id and t.status = 'open' and t.due_date < today
              and t.assigned_to <> person.profile_id and public.oversees_as(person.profile_id, t.assigned_to)
            group by t.assigned_to
          ) x) as names
      into team_tasks, team_followups, team_steps, team_released, team_names;
    end if;

    continue when person.tasks + person.followups + person.steps
      + team_tasks + team_followups + team_steps + team_released = 0;

    insert into public.morning_digests (profile_id, day) values (person.profile_id, today)
    on conflict do nothing;
    if not found then continue; end if;

    perform public.notify(
      person.organization_id, person.profile_id, null, 'morning_brief',
      jsonb_build_object(
        'tasks', person.tasks, 'followups', person.followups, 'steps', person.steps,
        'title', coalesce(person.names, ''),
        'team_tasks', team_tasks, 'team_followups', team_followups,
        'team_steps', team_steps, 'team_released', team_released,
        'team_names', coalesce(team_names, '')
      ),
      '/'
    );
    sent := sent + 1;
  end loop;

  delete from public.team_events where created_at < at_time - interval '7 days';
  return sent;
end;
$$;
revoke execute on function public.notify_morning_brief(timestamptz) from public, anon, authenticated;

-- =====================================================================
-- BRIXA — migration 073: the Academy — tests, exams and certificates
--   • a bank of questions in 8 topics (ЗУТ и строителство, право и сделката,
--     купувачи, продавачи, банки и кредити, продажби и преговори, пазар и
--     оценка, градът) on 3 levels: основно, напреднало, експертно
--   • each broker's level: set by the manager, else from their BRIXA level
--     (Нов брокер/Брокер → основно, Активен…Топ брокер → напреднало, Експерт… → експертно)
--   • practice (10 questions, the answer shown at once) and the exam
--     (20 questions in 30 minutes, the answers at the end); the questions and
--     the right answers stay in the database — the test is checked here
--   • the exam comes round by the agency's rule (every month by default; also
--     every 3 or 6 months, every year, or not at all) — BRIXA reminds the
--     brokers and tells the leaders how it went
--   • passing gives an A4 certificate with a number and a code anyone can check
--   • the agency's leaders add questions of their own (their city, their way)
-- Run once in Supabase → SQL Editor → New query → Run (after 071; it doesn't need 072).
-- =====================================================================

-- ---------------------------------------------------------------------
-- The agency's rules
-- ---------------------------------------------------------------------
alter table public.organizations
  add column if not exists academy_every text not null default 'month',
  add column if not exists academy_pass smallint not null default 80;
alter table public.organizations drop constraint if exists organizations_academy_every_check;
alter table public.organizations add constraint organizations_academy_every_check
  check (academy_every in ('off', 'month', 'quarter', 'half', 'year'));
alter table public.organizations drop constraint if exists organizations_academy_pass_check;
alter table public.organizations add constraint organizations_academy_pass_check
  check (academy_pass between 50 and 100);

-- ---------------------------------------------------------------------
-- The questions: BRIXA's own (no agency) and each agency's own
--   the right answer is options[correct + 1]; every test shows them shuffled
-- ---------------------------------------------------------------------
create table if not exists public.academy_questions (
  id uuid primary key default gen_random_uuid(),
  -- BRIXA's own questions have a code, so a migration can tell them apart
  code text unique,
  organization_id uuid references public.organizations (id) on delete cascade,
  topic text not null check (topic in ('zut', 'law', 'buyers', 'sellers', 'banks', 'sales', 'market', 'city')),
  level smallint not null check (level between 1 and 3),
  -- the city a "city" question is about (BRIXA's own); an agency's own are about its city
  city text check (city is null or char_length(city) <= 80),
  question text not null check (char_length(question) between 5 and 600),
  options text[] not null check (cardinality(options) between 2 and 5 and char_length(array_to_string(options, '')) <= 1500),
  correct smallint not null default 0,
  explanation text check (explanation is null or char_length(explanation) <= 1000),
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_questions_correct_check check (correct >= 0 and correct < cardinality(options))
);
create index if not exists academy_questions_pool_idx on public.academy_questions (level, topic) where active;
create index if not exists academy_questions_org_idx on public.academy_questions (organization_id);

drop trigger if exists academy_questions_touch_updated_at on public.academy_questions;
create trigger academy_questions_touch_updated_at before update on public.academy_questions
  for each row execute function public.touch_updated_at();

alter table public.academy_questions enable row level security;

-- the answers are in the rows: only who writes them reads them — BRIXA's owner its own,
-- an agency's leaders the agency's; the brokers get the questions only through a test
drop policy if exists "academy questions: read" on public.academy_questions;
create policy "academy questions: read" on public.academy_questions for select to authenticated
  using (case when organization_id is null then public.is_platform_admin() else public.is_org_manager(organization_id) end);
drop policy if exists "academy questions: add" on public.academy_questions;
create policy "academy questions: add" on public.academy_questions for insert to authenticated
  with check (case when organization_id is null then public.is_platform_admin() else public.is_org_manager(organization_id) end);
drop policy if exists "academy questions: edit" on public.academy_questions;
create policy "academy questions: edit" on public.academy_questions for update to authenticated
  using (case when organization_id is null then public.is_platform_admin() else public.is_org_manager(organization_id) end)
  with check (case when organization_id is null then public.is_platform_admin() else public.is_org_manager(organization_id) end);
-- BRIXA's own are switched off, not deleted (past tests keep their copy anyway)
drop policy if exists "academy questions: delete" on public.academy_questions;
create policy "academy questions: delete" on public.academy_questions for delete to authenticated
  using (organization_id is not null and public.is_org_manager(organization_id));

-- ---------------------------------------------------------------------
-- A broker's level, when a manager sets it (else it follows the BRIXA level)
-- ---------------------------------------------------------------------
create table if not exists public.academy_levels (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  level smallint not null check (level between 1 and 3),
  set_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

alter table public.academy_levels enable row level security;
drop policy if exists "academy levels: read" on public.academy_levels;
create policy "academy levels: read" on public.academy_levels for select to authenticated
  using (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));

-- ---------------------------------------------------------------------
-- The tests taken, and their questions as they were shown
--   a test keeps its own copy of each question, so editing the bank later
--   never changes a result; the copies (with the right answers) are read only
--   through the functions below
-- ---------------------------------------------------------------------
create table if not exists public.academy_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('exam', 'practice')),
  level smallint not null check (level between 1 and 3),
  -- practice on one topic
  topic text,
  -- the exam's round: '2026-11', '2026-Q4', '2026-H2', '2026' (none when the agency has no rounds)
  period text,
  total smallint not null default 0,
  correct smallint,
  score smallint,
  passed boolean,
  started_at timestamptz not null default now(),
  deadline_at timestamptz,
  finished_at timestamptz
);
create index if not exists academy_attempts_person_idx on public.academy_attempts (profile_id, started_at desc);
create index if not exists academy_attempts_round_idx on public.academy_attempts (organization_id, period) where mode = 'exam';

alter table public.academy_attempts enable row level security;
drop policy if exists "academy attempts: read" on public.academy_attempts;
create policy "academy attempts: read" on public.academy_attempts for select to authenticated
  using (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));

create table if not exists public.academy_answers (
  attempt_id uuid not null references public.academy_attempts (id) on delete cascade,
  position smallint not null,
  question_id uuid references public.academy_questions (id) on delete set null,
  topic text not null,
  question text not null,
  -- in the order shown
  options text[] not null,
  right_option smallint not null,
  explanation text,
  chosen smallint,
  answered_at timestamptz,
  primary key (attempt_id, position)
);
create index if not exists academy_answers_question_idx on public.academy_answers (question_id);

-- no policies: read and written only by the functions below
alter table public.academy_answers enable row level security;

-- ---------------------------------------------------------------------
-- The certificates
-- ---------------------------------------------------------------------
create sequence if not exists public.academy_certificate_no;

create table if not exists public.academy_certificates (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.academy_certificate_no'),
  -- the code printed on it and in its QR code: anyone can check it at /v/<code>
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  attempt_id uuid unique references public.academy_attempts (id) on delete set null,
  level smallint not null check (level between 1 and 3),
  score smallint not null,
  -- as they were on the day
  holder_name text not null,
  agency_name text not null,
  -- the agency's owner signs (not when it is their own)
  signer_name text,
  issued_on date not null default public.sofia_today(),
  valid_until date not null,
  created_at timestamptz not null default now()
);
create index if not exists academy_certificates_person_idx on public.academy_certificates (profile_id, issued_on desc);

alter table public.academy_certificates enable row level security;
drop policy if exists "academy certificates: read" on public.academy_certificates;
create policy "academy certificates: read" on public.academy_certificates for select to authenticated
  using (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));

-- ---------------------------------------------------------------------
-- Rounds: which one a day is in, where it starts and ends
-- ---------------------------------------------------------------------
create or replace function public.academy_period(every text, day date)
returns text
language sql
stable
as $$
  select case every
    when 'month' then to_char(day, 'YYYY-MM')
    when 'quarter' then to_char(day, 'YYYY') || '-Q' || extract(quarter from day)::int
    when 'half' then to_char(day, 'YYYY') || '-H' || case when extract(month from day) <= 6 then 1 else 2 end
    when 'year' then to_char(day, 'YYYY')
  end;
$$;

create or replace function public.academy_period_bounds(every text, day date, out starts date, out ends date)
language sql
stable
as $$
  select s, (s + case every when 'month' then interval '1 month' when 'quarter' then interval '3 months'
                            when 'half' then interval '6 months' else interval '1 year' end)::date - 1
  from (
    select case every
      when 'month' then date_trunc('month', day)::date
      when 'quarter' then date_trunc('quarter', day)::date
      when 'half' then make_date(extract(year from day)::int, case when extract(month from day) <= 6 then 1 else 7 end, 1)
      when 'year' then date_trunc('year', day)::date
    end as s
  ) x;
$$;

-- ---------------------------------------------------------------------
-- A person's level and city
-- ---------------------------------------------------------------------

-- from the BRIXA level (experience): 0–999 → 1, 1 000–9 999 → 2, 10 000 and more → 3
create or replace function public.academy_level_for(points integer)
returns smallint
language sql
immutable
as $$
  select (case when coalesce(points, 0) >= 10000 then 3 when coalesce(points, 0) >= 1000 then 2 else 1 end)::smallint;
$$;

create or replace function public.academy_level_of(target_org uuid, target uuid)
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select l.level from public.academy_levels l where l.organization_id = target_org and l.profile_id = target),
    public.academy_level_for((select b.points from public.leaderboard(target_org, 'all') b where b.profile_id = target))
  );
$$;

-- the city the "city" questions are about: the person's office's, else the agency's ("гр. " left out)
create or replace function public.academy_city(target_org uuid, target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(regexp_replace(coalesce(
    (select nullif(trim(f.city), '') from public.organization_members m join public.offices f on f.id = m.office_id
     where m.organization_id = target_org and m.profile_id = target),
    (select o.city from public.organizations o where o.id = target_org),
    ''), '^\s*(гр\.|град)\s*', '', 'i')), '');
$$;

revoke execute on function public.academy_level_of(uuid, uuid) from public, anon;
grant execute on function public.academy_level_of(uuid, uuid) to authenticated;
revoke execute on function public.academy_city(uuid, uuid) from public, anon;

-- ---------------------------------------------------------------------
-- Finishing a test: the score, passed or not, the certificate, the leaders told
--   (internal: the person finishes their own; the morning run the ones left open)
-- ---------------------------------------------------------------------
create or replace function public.academy_close(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  o record;
  got integer;
  pct integer;
  ok boolean;
  signer text;
  leader record;
begin
  select * into a from public.academy_attempts where id = target for update;
  if a.id is null or a.finished_at is not null then
    return;
  end if;

  select count(*) filter (where w.chosen = w.right_option) into got from public.academy_answers w where w.attempt_id = target;
  pct := case when a.total > 0 then round(100.0 * got / a.total)::int else 0 end;
  select * into o from public.organizations where id = a.organization_id;
  ok := a.mode = 'exam' and pct >= o.academy_pass;

  update public.academy_attempts
  set correct = got,
      score = pct,
      passed = case when a.mode = 'exam' then ok end,
      -- an exam left open ends when its time did
      finished_at = case when a.deadline_at is not null then least(now(), a.deadline_at) else now() end
  where id = target;

  if ok then
    select coalesce(p.full_name, p.email) into signer
    from public.organization_members m join public.profiles p on p.id = m.profile_id
    where m.organization_id = a.organization_id and m.role = 'owner' and m.profile_id <> a.profile_id
    order by m.created_at
    limit 1;

    insert into public.academy_certificates (organization_id, profile_id, attempt_id, level, score, holder_name, agency_name, signer_name, issued_on, valid_until)
    values (a.organization_id, a.profile_id, a.id, a.level, pct, coalesce(public.person_name(a.profile_id), ''), o.name, signer,
            public.sofia_today(), (public.sofia_today() + interval '1 year')::date)
    on conflict (attempt_id) do nothing;
  end if;

  -- the person's leaders hear how the exam went
  if a.mode = 'exam' then
    for leader in
      select m.profile_id from public.organization_members m
      where m.organization_id = a.organization_id and m.profile_id <> a.profile_id
        and public.oversees_as(m.profile_id, a.profile_id)
    loop
      perform public.notify(
        a.organization_id, leader.profile_id, a.profile_id, 'academy_result',
        jsonb_build_object('actor', public.person_name(a.profile_id), 'count', pct, 'level', a.level, 'kind', case when ok then 'passed' else 'failed' end),
        '/academy/team'
      );
    end loop;
  end if;
end;
$$;

revoke execute on function public.academy_close(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Starting a test: practice (10 questions; one topic or all) or the exam (20 in 30 minutes)
--   the questions: the person's level first, a few from each topic in turn, the ones not
--   seen in the last 90 days first; the answers shuffled
-- ---------------------------------------------------------------------
create or replace function public.academy_start(want_mode text, want_level integer default null, want_topic text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  org uuid;
  o record;
  my_level smallint;
  lvl smallint;
  per text;
  size integer;
  last_fail timestamptz;
  town text;
  attempt uuid;
  q record;
  pos integer := 0;
  shown text[];
  idxs integer[];
begin
  select m.organization_id into org from public.organization_members m where m.profile_id = me order by m.created_at limit 1;
  if me is null or org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if want_mode is null or want_mode not in ('exam', 'practice') then
    raise exception 'academy_mode';
  end if;
  if want_topic is not null and want_topic not in ('zut', 'law', 'buyers', 'sellers', 'banks', 'sales', 'market', 'city') then
    raise exception 'academy_topic';
  end if;

  select * into o from public.organizations where id = org;
  my_level := public.academy_level_of(org, me);
  lvl := coalesce(want_level, my_level);
  if lvl not between 1 and 3 then
    raise exception 'academy_level';
  end if;

  -- an exam still running: starting it again continues it, and nothing else starts meanwhile
  select a.id into attempt from public.academy_attempts a
  where a.profile_id = me and a.mode = 'exam' and a.finished_at is null and a.deadline_at > now()
  order by a.started_at desc
  limit 1;
  if attempt is not null then
    if want_mode = 'exam' then
      return attempt;
    end if;
    raise exception 'academy_exam_open';
  end if;

  -- whatever was left open is finished first
  perform public.academy_close(a.id) from public.academy_attempts a where a.profile_id = me and a.finished_at is null;

  if want_mode = 'exam' then
    want_topic := null;
    -- the exam is at one's own level or higher
    if lvl < my_level then
      raise exception 'academy_level_low';
    end if;
    per := public.academy_period(o.academy_every, public.sofia_today());
    if exists (
      select 1 from public.academy_attempts a
      where a.profile_id = me and a.organization_id = org and a.mode = 'exam' and a.passed and a.level >= lvl
        -- the round's; with no rounds, one passed within the year
        and (case when per is not null then a.period = per else a.finished_at > now() - interval '1 year' end)
    ) then
      raise exception 'academy_passed';
    end if;
    -- after a failed exam: the next one tomorrow
    select max(a.finished_at) into last_fail from public.academy_attempts a
    where a.profile_id = me and a.mode = 'exam' and a.passed is false;
    if last_fail is not null and last_fail > now() - interval '24 hours' then
      raise exception 'academy_wait';
    end if;
    size := 20;
  else
    size := 10;
  end if;

  town := public.academy_city(org, me);

  insert into public.academy_attempts (organization_id, profile_id, mode, level, topic, period, deadline_at)
  values (org, me, want_mode, lvl, want_topic, per, case when want_mode = 'exam' then now() + interval '30 minutes' end)
  returning id into attempt;

  for q in
    with seen as (
      select distinct w.question_id
      from public.academy_answers w join public.academy_attempts a on a.id = w.attempt_id
      where a.profile_id = me and a.started_at > now() - interval '90 days' and w.question_id is not null
    ),
    pool as (
      select x.id, x.topic, x.level, x.question, x.options, x.correct, x.explanation,
        row_number() over (partition by x.topic, x.level order by (x.id in (select s.question_id from seen s)), random()) as rn
      from public.academy_questions x
      where x.active
        and (x.organization_id is null or x.organization_id = org)
        and (want_topic is null or x.topic = want_topic)
        and (x.topic <> 'city' or x.organization_id = org or (town is not null and lower(x.city) = lower(town)))
    )
    select * from pool
    order by (pool.level <> lvl), abs(pool.level - lvl), pool.rn, random()
    limit size
  loop
    pos := pos + 1;
    select array_agg(t.opt order by t.r), array_agg(t.i::int order by t.r)
    into shown, idxs
    from (select u.opt, u.i, random() as r from unnest(q.options) with ordinality as u(opt, i)) t;
    insert into public.academy_answers (attempt_id, position, question_id, topic, question, options, right_option, explanation)
    values (attempt, pos, q.id, q.topic, q.question, shown, array_position(idxs, q.correct + 1) - 1, q.explanation);
  end loop;

  if pos = 0 then
    raise exception 'academy_empty';
  end if;
  update public.academy_attempts set total = pos where id = attempt;
  return attempt;
end;
$$;

revoke execute on function public.academy_start(text, integer, text) from public, anon;
grant execute on function public.academy_start(text, integer, text) to authenticated;

-- An answer: practice shows at once whether it was right (the first answer counts);
-- the exam keeps it (it can be changed until the end)
create or replace function public.academy_answer(target uuid, pos integer, choice integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  w record;
begin
  select * into a from public.academy_attempts where id = target and profile_id = auth.uid();
  if a.id is null then
    raise exception 'not_found';
  end if;
  if a.finished_at is not null then
    return jsonb_build_object('finished', true);
  end if;
  -- the time is up (half a minute's grace for the network)
  if a.deadline_at is not null and now() > a.deadline_at + interval '30 seconds' then
    perform public.academy_close(target);
    return jsonb_build_object('finished', true);
  end if;

  select * into w from public.academy_answers where attempt_id = target and position = pos;
  if w.attempt_id is null or choice is null or choice < 0 or choice >= cardinality(w.options) then
    raise exception 'academy_answer';
  end if;

  if a.mode = 'practice' then
    if w.chosen is null then
      update public.academy_answers set chosen = choice, answered_at = now() where attempt_id = target and position = pos;
    end if;
    return jsonb_build_object('chosen', coalesce(w.chosen, choice), 'right', w.right_option, 'explanation', w.explanation);
  end if;

  update public.academy_answers set chosen = choice, answered_at = now() where attempt_id = target and position = pos;
  return jsonb_build_object('saved', true);
end;
$$;

revoke execute on function public.academy_answer(uuid, integer, integer) from public, anon;
grant execute on function public.academy_answer(uuid, integer, integer) to authenticated;

create or replace function public.academy_finish(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.academy_attempts where id = target and profile_id = auth.uid()) then
    raise exception 'not_found';
  end if;
  perform public.academy_close(target);
  return (
    select jsonb_build_object('score', a.score, 'passed', a.passed,
      'certificate', (select c.id from public.academy_certificates c where c.attempt_id = a.id))
    from public.academy_attempts a where a.id = target
  );
end;
$$;

revoke execute on function public.academy_finish(uuid) from public, anon;
grant execute on function public.academy_finish(uuid) to authenticated;

-- A test with its questions: the right answers once it is finished (practice: once answered).
-- The person themself and their leaders.
create or replace function public.academy_review(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  reveal boolean;
begin
  select * into a from public.academy_attempts
  where id = target and (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));
  if a.id is null then
    return null;
  end if;
  reveal := a.finished_at is not null;
  return jsonb_build_object(
    'id', a.id, 'mode', a.mode, 'level', a.level, 'topic', a.topic, 'period', a.period,
    'total', a.total, 'correct', a.correct, 'score', a.score, 'passed', a.passed,
    'started_at', a.started_at, 'deadline_at', a.deadline_at, 'finished_at', a.finished_at, 'now', now(),
    'name', public.person_name(a.profile_id), 'mine', a.profile_id = auth.uid(),
    'pass', (select o.academy_pass from public.organizations o where o.id = a.organization_id),
    'certificate', (select c.id from public.academy_certificates c where c.attempt_id = a.id),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', w.position, 'topic', w.topic, 'question', w.question, 'options', to_jsonb(w.options), 'chosen', w.chosen,
        'right', case when reveal or (a.mode = 'practice' and w.chosen is not null) then w.right_option end,
        'explanation', case when reveal or (a.mode = 'practice' and w.chosen is not null) then w.explanation end
      ) order by w.position)
      from public.academy_answers w where w.attempt_id = a.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.academy_review(uuid) from public, anon;
grant execute on function public.academy_review(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- What the academy page shows
-- ---------------------------------------------------------------------

-- me: my level (and where it comes from), the round, whether I passed it, when I may try again
create or replace function public.academy_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  org uuid;
  o record;
  set_level smallint;
  points integer;
  per text;
  b record;
  last_fail timestamptz;
begin
  select m.organization_id into org from public.organization_members m where m.profile_id = me order by m.created_at limit 1;
  if org is null then
    return null;
  end if;
  select * into o from public.organizations where id = org;
  select l.level into set_level from public.academy_levels l where l.organization_id = org and l.profile_id = me;
  select lb.points into points from public.leaderboard(org, 'all') lb where lb.profile_id = me;
  per := public.academy_period(o.academy_every, public.sofia_today());
  select * into b from public.academy_period_bounds(o.academy_every, public.sofia_today());
  select max(a.finished_at) into last_fail from public.academy_attempts a
  where a.profile_id = me and a.mode = 'exam' and a.passed is false;

  return jsonb_build_object(
    'level', coalesce(set_level, public.academy_level_for(points)),
    'auto_level', public.academy_level_for(points),
    'level_set', set_level is not null,
    'every', o.academy_every,
    'pass', o.academy_pass,
    'period', per,
    'period_ends', b.ends,
    'passed', exists (
      select 1 from public.academy_attempts a
      where a.profile_id = me and a.organization_id = org and a.mode = 'exam' and a.passed
        and (case when per is not null then a.period = per else a.finished_at > now() - interval '1 year' end)
    ),
    'passed_level', (
      select max(a.level) from public.academy_attempts a
      where a.profile_id = me and a.organization_id = org and a.mode = 'exam' and a.passed
        and (case when per is not null then a.period = per else a.finished_at > now() - interval '1 year' end)
    ),
    'wait_until', case when last_fail > now() - interval '24 hours' then last_fail + interval '24 hours' end,
    'city', public.academy_city(org, me)
  );
end;
$$;

revoke execute on function public.academy_me() from public, anon;
grant execute on function public.academy_me() to authenticated;

-- how many questions there are, by topic and level (what the person can be asked)
create or replace function public.academy_bank(target_org uuid)
returns table (topic text, level smallint, builtin integer, own integer)
language sql
stable
security definer
set search_path = public
as $$
  with town as (select public.academy_city(target_org, auth.uid()) as name)
  select q.topic, q.level,
    (count(*) filter (where q.organization_id is null))::int,
    (count(*) filter (where q.organization_id = target_org))::int
  from public.academy_questions q, town
  where q.active and public.is_org_member(target_org)
    and (q.organization_id is null or q.organization_id = target_org)
    and (q.topic <> 'city' or q.organization_id = target_org or (town.name is not null and lower(q.city) = lower(town.name)))
  group by q.topic, q.level;
$$;

revoke execute on function public.academy_bank(uuid) from public, anon;
grant execute on function public.academy_bank(uuid) to authenticated;

-- right and wrong by topic in the exams of the last 12 months: one person (themself or a leader),
-- or everyone the leader leads (no person given)
create or replace function public.academy_topics(target_org uuid, target uuid default null)
returns table (topic text, answered integer, right_answers integer)
language sql
stable
security definer
set search_path = public
as $$
  with people as (
    select m.profile_id from public.organization_members m
    where m.organization_id = target_org
      and (case when target is null then public.oversees_as(auth.uid(), m.profile_id)
                else m.profile_id = target and (target = auth.uid() or public.oversees_as(auth.uid(), target)) end)
  )
  select w.topic, count(*)::int, (count(*) filter (where w.chosen = w.right_option))::int
  from public.academy_attempts a
  join people p on p.profile_id = a.profile_id
  join public.academy_answers w on w.attempt_id = a.id
  where a.organization_id = target_org and a.mode = 'exam' and a.finished_at is not null
    and a.started_at > now() - interval '1 year'
  group by w.topic;
$$;

revoke execute on function public.academy_topics(uuid, uuid) from public, anon;
grant execute on function public.academy_topics(uuid, uuid) to authenticated;

-- the leader's people: level, this round's exam, the last certificate
create or replace function public.academy_team(target_org uuid)
returns table (
  profile_id uuid, full_name text, email text, avatar_path text, role text,
  level smallint, level_set boolean, auto_level smallint, expected boolean,
  best smallint, passed boolean, attempts integer, last_at timestamptz,
  certificate_level smallint, certificate_until date
)
language sql
stable
security definer
set search_path = public
as $$
  with o as (
    select org.*, public.academy_period(org.academy_every, public.sofia_today()) as per
    from public.organizations org where org.id = target_org
  ),
  lb as (
    select b.profile_id, b.points from public.leaderboard(target_org, 'all') b
  )
  select m.profile_id, p.full_name, p.email, p.avatar_path, m.role,
    coalesce(al.level, public.academy_level_for(lb.points)),
    al.level is not null,
    public.academy_level_for(lb.points),
    -- who the exam is for: the brokers and the team managers (working alone: oneself)
    (m.role in ('broker', 'manager') or o.kind = 'solo'),
    (select max(a.score) from public.academy_attempts a
     where a.profile_id = m.profile_id and a.organization_id = target_org and a.mode = 'exam'
       and a.finished_at is not null and a.period is not distinct from o.per)::smallint,
    exists (select 1 from public.academy_attempts a
            where a.profile_id = m.profile_id and a.organization_id = target_org and a.mode = 'exam'
              and a.passed and a.period is not distinct from o.per),
    (select count(*) from public.academy_attempts a
     where a.profile_id = m.profile_id and a.organization_id = target_org and a.mode = 'exam'
       and a.period is not distinct from o.per)::int,
    (select max(a.started_at) from public.academy_attempts a
     where a.profile_id = m.profile_id and a.organization_id = target_org),
    c.level, c.valid_until
  from public.organization_members m
  cross join o
  join public.profiles p on p.id = m.profile_id
  left join public.academy_levels al on al.organization_id = target_org and al.profile_id = m.profile_id
  left join lb on lb.profile_id = m.profile_id
  left join lateral (
    select ce.level, ce.valid_until from public.academy_certificates ce
    where ce.profile_id = m.profile_id and ce.organization_id = target_org
    order by ce.issued_on desc, ce.level desc
    limit 1
  ) c on true
  where m.organization_id = target_org and public.oversees_as(auth.uid(), m.profile_id)
  order by coalesce(p.full_name, p.email);
$$;

revoke execute on function public.academy_team(uuid) from public, anon;
grant execute on function public.academy_team(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- What the leaders set
-- ---------------------------------------------------------------------

-- a person's level (null: back to the one from their BRIXA level)
create or replace function public.set_academy_level(target uuid, new_level integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  select m.organization_id into org from public.organization_members m where m.profile_id = auth.uid() order by m.created_at limit 1;
  if org is null or not public.oversees_as(auth.uid(), target)
     or not exists (select 1 from public.organization_members t where t.organization_id = org and t.profile_id = target) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if new_level is null then
    delete from public.academy_levels where organization_id = org and profile_id = target;
  elsif new_level between 1 and 3 then
    insert into public.academy_levels (organization_id, profile_id, level, set_by)
    values (org, target, new_level, auth.uid())
    on conflict (organization_id, profile_id) do update set level = excluded.level, set_by = excluded.set_by, updated_at = now();
  else
    raise exception 'academy_level';
  end if;
end;
$$;

revoke execute on function public.set_academy_level(uuid, integer) from public, anon;
grant execute on function public.set_academy_level(uuid, integer) to authenticated;

-- the agency's rules: the owner
create or replace function public.set_academy_rules(target_org uuid, every text, pass_mark integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_owner(target_org) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.organizations set academy_every = every, academy_pass = pass_mark where id = target_org;
end;
$$;

revoke execute on function public.set_academy_rules(uuid, text, integer) from public, anon;
grant execute on function public.set_academy_rules(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Checking a certificate: anyone with its code (the QR code on it)
-- ---------------------------------------------------------------------
create or replace function public.academy_certificate_public(cert_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'number', c.number, 'holder', c.holder_name, 'agency', c.agency_name, 'level', c.level, 'score', c.score,
    'issued_on', c.issued_on, 'valid_until', c.valid_until, 'valid', c.valid_until >= public.sofia_today(),
    'logo_path', o.logo_path
  )
  from public.academy_certificates c
  left join public.organizations o on o.id = c.organization_id
  where c.code = upper(trim(cert_code));
$$;

revoke execute on function public.academy_certificate_public(text) from public;
grant execute on function public.academy_certificate_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Every morning: the rounds
--   the first day of a round: "the exam is open" to everyone it is for, and the leaders
--   hear how the last round went; 3 days before the end: a reminder to who hasn't passed.
--   Exams left open past their time are finished.
-- ---------------------------------------------------------------------
create or replace function public.notify_academy(day date default public.sofia_today())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  b record;
  m record;
  leader record;
  per text;
  prev text;
  total integer;
  done integer;
  sent integer := 0;
begin
  perform public.academy_close(a.id) from public.academy_attempts a
  where a.finished_at is null
    and ((a.deadline_at is not null and a.deadline_at < now() - interval '1 minute')
         or (a.deadline_at is null and a.started_at < now() - interval '1 day'));

  for o in select org.* from public.organizations org where org.academy_every <> 'off' loop
    select * into b from public.academy_period_bounds(o.academy_every, day);
    per := public.academy_period(o.academy_every, day);

    if day = b.starts then
      for m in
        select mm.profile_id from public.organization_members mm
        where mm.organization_id = o.id and (mm.role in ('broker', 'manager') or o.kind = 'solo')
      loop
        perform public.notify(o.id, m.profile_id, null, 'academy_open',
          jsonb_build_object('period', per, 'count', 20, 'minutes', 30), '/academy');
        sent := sent + 1;
      end loop;

      prev := public.academy_period(o.academy_every, day - 1);
      for leader in
        select l.profile_id from public.organization_members l where l.organization_id = o.id and l.role <> 'broker'
      loop
        select count(*)::int,
               (count(*) filter (where exists (
                 select 1 from public.academy_attempts a
                 where a.profile_id = t.profile_id and a.organization_id = o.id and a.mode = 'exam' and a.period = prev and a.passed
               )))::int
        into total, done
        from public.organization_members t
        where t.organization_id = o.id and t.profile_id <> leader.profile_id
          and (t.role in ('broker', 'manager') or o.kind = 'solo')
          and public.oversees_as(leader.profile_id, t.profile_id);
        -- only once the academy has had a round here
        if total > 0 and exists (
          select 1 from public.academy_attempts a where a.organization_id = o.id and a.mode = 'exam' and a.period = prev
        ) then
          perform public.notify(o.id, leader.profile_id, null, 'academy_summary',
            jsonb_build_object('period', prev, 'count', done, 'total', total), '/academy/team');
          sent := sent + 1;
        end if;
      end loop;
    elsif day = b.ends - 3 then
      for m in
        select mm.profile_id from public.organization_members mm
        where mm.organization_id = o.id and (mm.role in ('broker', 'manager') or o.kind = 'solo')
          and not exists (
            select 1 from public.academy_attempts a
            where a.profile_id = mm.profile_id and a.organization_id = o.id and a.mode = 'exam' and a.period = per and a.passed
          )
      loop
        perform public.notify(o.id, m.profile_id, null, 'academy_due',
          jsonb_build_object('period', per, 'days', 3), '/academy');
        sent := sent + 1;
      end loop;
    end if;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.notify_academy(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-academy', '0 6 * * *', 'select public.notify_academy()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- BRIXA's own questions (written 02.11.2026; BRIXA's owner keeps them up to date)
--   the right answer is the first one — every test shuffles them
-- ---------------------------------------------------------------------
insert into public.academy_questions (code, topic, level, city, question, options, correct, explanation) values
  ('zut-1-01', 'zut', 1, null, 'Какво означава съкращението ЗУТ?', array['Закон за устройство на територията', 'Закон за управление на териториите', 'Закон за уреждане на търговията с имоти', 'Закон за устройство на търговските обекти'], 0, 'ЗУТ урежда как се планира и застроява територията: устройствените планове, строителните книжа, строителството и въвеждането на сградите в експлоатация.'),
  ('zut-1-02', 'zut', 1, null, 'Кой акт се съставя, когато е завършен грубият строеж (конструкцията) на сградата?', array['Акт 14', 'Акт 15', 'Акт 16', 'Акт 2'], 0, 'Акт обр. 14 е за приемане на конструкцията — това е „грубият строеж“. Акт 15 се съставя, когато строежът е завършен, а след него идва разрешението за ползване или удостоверението за въвеждане в експлоатация („Акт 16“).'),
  ('zut-1-03', 'zut', 1, null, 'Кой документ доказва, че новата сграда може законно да се обитава?', array['Разрешението за ползване или удостоверението за въвеждане в експлоатация („Акт 16“)', 'Разрешението за строеж', 'Акт 14 за приемане на конструкцията', 'Договорът между строителя и купувача'], 0, 'Сградата може да се ползва едва след като е въведена в експлоатация. Без този документ банките обикновено не кредитират, а нанасянето е незаконно.'),
  ('zut-1-04', 'zut', 1, null, 'Какво е РЗП?', array['Разгъната застроена площ — сборът от застроените площи на надземните етажи', 'Застроената площ само на първия етаж', 'Площта на целия парцел', 'Чистата жилищна площ на всички апартаменти'], 0, 'РЗП е сборът от застроените площи на всички надземни етажи. С нея се изчислява Кинт (РЗП ÷ площта на парцела).'),
  ('zut-1-05', 'zut', 1, null, 'Какво е УПИ?', array['Урегулиран поземлен имот — имот, за който има отреждане по план за регулация', 'Удостоверение за принадлежност на имот', 'Уникален поземлен идентификатор в кадастъра', 'Устройствен план на конкретен имот'], 0, 'УПИ е имот, на който с подробния устройствен план е дадено отреждане (например „за жилищно строителство“) и има регулационни граници.'),
  ('zut-1-06', 'zut', 1, null, 'Откъде се вади схема на апартамент (самостоятелен обект)?', array['От Службата по геодезия, картография и кадастър (АГКК) — и онлайн през КАИС', 'От Агенцията по вписванията', 'От общината, отдел „Местни данъци“', 'От нотариуса по местонахождение на имота'], 0, 'Схемите и скиците се издават от кадастъра (СГКК към АГКК). Онлайн през kais.cadastre.bg с електронен подпис излизат по-евтино.'),
  ('zut-1-07', 'zut', 1, null, 'Какво показва идентификаторът на имот в кадастъра, например 10135.2555.123.1.15?', array['Населеното място, кадастралния район, поземления имот, сградата и самостоятелния обект', 'Номера на нотариалния акт и годината на вписване', 'Данъчния номер на собственика и партидата му', 'Пощенския код, улицата, номера, входа и апартамента'], 0, 'Първото число е кодът по ЕКАТТЕ на населеното място (10135 е Варна), следват кадастралният район, номерът на поземления имот, сградата и самостоятелният обект в нея.'),
  ('zut-1-08', 'zut', 1, null, 'Какво значи „купуване на зелено“?', array['Покупка на имот в сграда, която още не е построена или се строи', 'Покупка на имот в зелена зона или до парк', 'Покупка на земеделска земя', 'Покупка с отстъпка при плащане в брой'], 0, '„На зелено“ се купува преди или по време на строителството — обикновено по-евтино, но с риск от забавяне. Затова е важно да се проверят разрешението за строеж, собствеността на земята и строителят.'),
  ('zut-1-09', 'zut', 1, null, 'Какво означава устройствената зона „Жм“?', array['Жилищна зона с малкоетажно застрояване (до 10 м височина)', 'Жилищна зона с многоетажно застрояване', 'Жилищна зона за младежко строителство', 'Жилищна зона с междублокови пространства'], 0, 'Жм е жилищна зона с преобладаващо застрояване с малка височина (до 10 м), Жс — със средна (до 15 м), Жг — с голяма (над 15 м). Конкретните показатели се четат в плана на общината.'),
  ('zut-1-10', 'zut', 1, null, 'Какво представляват идеалните части от общите части, които се продават с апартамента?', array['Делът на апартамента в общите части на сградата — стълбища, покрив, фоайе, асансьор', 'Мебелите и уредите, които остават в апартамента', 'Част от двора, която е само на купувача', 'Площта на терасите и балконите'], 0, 'При етажна собственост всеки обект има дял в общите части. Той се посочва в документите и влиза в „общата площ“ на обявата.'),
  ('zut-2-01', 'zut', 2, null, 'Какво показва коефициентът на интензивност (Кинт)?', array['Отношението между РЗП на сградите и площта на парцела', 'Каква част от парцела може да се застрои, в %', 'Височината на сградата в етажи', 'Колко от парцела трябва да е озеленено'], 0, 'Кинт = РЗП ÷ площта на УПИ. При Кинт 1,5 и парцел 1 000 м² може да се построят най-много 1 500 м² РЗП.'),
  ('zut-2-02', 'zut', 2, null, 'Какво показва плътността на застрояване?', array['Каква част от площта на парцела (в %) може да е заета от сградата', 'Колко апартамента може да има на етаж', 'Отношението на РЗП към площта на парцела', 'Колко сгради има на хектар в квартала'], 0, 'Плътността е застроената площ (ЗП) като процент от площта на парцела. Тя ограничава „отпечатъка“ на сградата върху терена.'),
  ('zut-2-03', 'zut', 2, null, 'Парцел от 600 м² е с Кинт 1,2. Каква е най-голямата РЗП, която може да се построи?', array['720 м²', '500 м²', '1 200 м²', '600 м²'], 0, 'РЗП = Кинт × площта на парцела = 1,2 × 600 = 720 м².'),
  ('zut-2-04', 'zut', 2, null, 'Парцел от 800 м² е с плътност на застрояване 40%. Колко най-много може да е застроената площ (ЗП)?', array['320 м²', '480 м²', '200 м²', '400 м²'], 0, 'ЗП = 40% × 800 м² = 320 м². Плътността ограничава площта, която сградата заема върху терена.'),
  ('zut-2-05', 'zut', 2, null, 'Кога губи сила разрешението за строеж?', array['Ако строежът не започне до 3 години или грубият строеж не завърши до 5 години от започването', 'Ако до 1 година не е платена таксата към общината', 'Никога — разрешението за строеж е безсрочно', 'Автоматично 10 години след издаването'], 0, 'По чл. 153 ЗУТ разрешението губи сила, ако в 3 години от влизането му в сила не е започнало строителството или в 5 години от започването не е завършен грубият строеж.'),
  ('zut-2-06', 'zut', 2, null, 'Какво е ПУП-ПРЗ?', array['Подробен устройствен план — план за регулация и застрояване на конкретни имоти', 'Общият устройствен план на цялата община', 'Проект за узаконяване на незаконни постройки', 'Протокол за установяване на подземни работи'], 0, 'ПРЗ определя границите на УПИ (регулацията) и как може да се строи в тях — строителни линии, височина, показатели.'),
  ('zut-2-07', 'zut', 2, null, 'Каква е разликата между регулационна и строителна линия?', array['Регулационната е границата на имота към улицата, а строителната — докъде може да се строи сградата', 'Регулационната показва височината, а строителната — плътността', 'Няма разлика — това са две имена на едно и също', 'Строителната е границата между два съседни имота'], 0, 'Регулационната линия отделя имота от улицата (или от съседа). Строителната линия е линията, до която (или на която) може да се постави сградата.'),
  ('zut-2-08', 'zut', 2, null, 'За какво служи Акт 15?', array['Установява, че строежът е завършен и годен за приемане преди въвеждането в експлоатация', 'Разрешава започването на строежа', 'Приема конструкцията — грубия строеж', 'Вписва сградата в Агенцията по вписванията'], 0, 'Акт обр. 15 се съставя, когато строежът е изпълнен по проекта. С него възложителят иска въвеждане в експлоатация.'),
  ('zut-2-09', 'zut', 2, null, 'Кой въвежда в експлоатация сграда от I–III категория (издава разрешение за ползване)?', array['ДНСК — Дирекцията за национален строителен контрол', 'Главният архитект на общината', 'Областният управител', 'Агенцията по геодезия, картография и кадастър'], 0, 'За I–III категория разрешението за ползване се издава от ДНСК, а за IV и V категория удостоверението за въвеждане в експлоатация — от общината.'),
  ('zut-2-10', 'zut', 2, null, 'Какво е търпим строеж?', array['Стар строеж без строителни книжа, който не подлежи на премахване, защото е бил допустим по правилата', 'Строеж, който в момента се узаконява', 'Временна постройка, разрешена до 2 години', 'Строеж с изтекло разрешение за строеж'], 0, 'Търпимите строежи (§16 от ПР на ЗУТ и сходни разпоредби) не се премахват. За продажба често е нужно удостоверение за търпимост от общината.'),
  ('zut-2-11', 'zut', 2, null, 'Какво е право на строеж?', array['Право да построиш сграда върху чужда земя и да станеш собственик на сградата', 'Разрешението от общината, че може да се строи', 'Правото на съседа да надстрои етаж', 'Правото да ползваш чужда сграда срещу наем'], 0, 'Правото на строеж (суперфиция) е ограничено вещно право по Закона за собствеността. Така работят повечето сделки „обезщетение срещу строеж“ със собствениците на земя.'),
  ('zut-2-12', 'zut', 2, null, 'Кой закон урежда общото събрание, управителя и фонд „Ремонт и обновяване“ в една сграда?', array['Законът за управление на етажната собственост (ЗУЕС)', 'Законът за устройство на територията (ЗУТ)', 'Законът за задълженията и договорите (ЗЗД)', 'Законът за местните данъци и такси (ЗМДТ)'], 0, 'ЗУЕС урежда управлението на сградите в режим на етажна собственост. Купувачът е добре да попита за задълженията към етажната собственост и за предстоящи ремонти.'),
  ('zut-3-01', 'zut', 3, null, 'След колко години се погасява по давност неупражнено право на строеж?', array['5 години', '3 години', '10 години', 'Не се погасява'], 0, 'По чл. 67 от Закона за собствеността правото на строеж се погасява в полза на собственика на земята, ако не се упражни в продължение на 5 години.'),
  ('zut-3-02', 'zut', 3, null, 'Според §16 от ПР на ЗУТ строежите без книжа, изградени до коя дата, могат да са търпими (ако са били допустими)?', array['До 7 април 1987 г.', 'До 10 ноември 1989 г.', 'До 31 декември 1999 г.', 'До 1 януари 2007 г.'], 0, 'Строежи, изградени до 7 април 1987 г. без строителни книжа, но допустими по плановете и правилата тогава или сега, са търпими и не се премахват.'),
  ('zut-3-03', 'zut', 3, null, 'Парцел от 500 м² е с Кинт 1,2 и плътност 60%. Колко етажа при пълна плътност позволява Кинт?', array['2 етажа', '3 етажа', '4 етажа', '1 етаж'], 0, 'РЗП = 1,2 × 500 = 600 м². ЗП = 60% × 500 = 300 м². 600 ÷ 300 = 2 етажа. При по-малка ЗП етажите могат да са повече, ако височината по плана позволява.'),
  ('zut-3-04', 'zut', 3, null, 'Включват ли се подземните етажи (гаражи, мазета) в РЗП при изчисляването на Кинт?', array['Не — в РЗП влизат застроените площи на надземните етажи', 'Да — влизат всички етажи на сградата', 'Да, но с коефициент 0,5', 'Само ако в тях има жилища'], 0, 'РЗП е сборът от застроените площи на надземните етажи. Затова подземните гаражи не „изяждат“ Кинт — важно при оценка на парцел за строеж.'),
  ('zut-3-05', 'zut', 3, null, 'Парцел от 1 000 м² с Кинт 2,0. Строителят дава на собственика на земята 40% от построеното. Колко м² РЗП получава собственикът?', array['800 м²', '400 м²', '1 200 м²', '2 000 м²'], 0, 'Общата РЗП е 2,0 × 1 000 = 2 000 м². 40% от нея са 800 м² за собственика на земята.'),
  ('zut-3-06', 'zut', 3, null, 'Каква е разликата между поземлен имот и УПИ?', array['Поземленият имот е по кадастъра, а УПИ — по плана за регулация; границите им може да не съвпадат', 'Няма разлика — двете означават едно и също', 'Поземлен имот е само земеделска земя, а УПИ — само градска', 'УПИ е частта от имота, върху която вече има сграда'], 0, 'Кадастърът описва имотите такива, каквито са. Регулацията определя каквито трябва да станат. При несъвпадение може да са нужни придаване на части или изменение на плана.'),
  ('zut-3-07', 'zut', 3, null, 'Кой издава заповед за премахване на незаконен строеж от IV–VI категория?', array['Кметът на общината', 'Началникът на ДНСК', 'Областният управител', 'Районният съд'], 0, 'За незаконни строежи от IV–VI категория заповедта е на кмета (чл. 225а ЗУТ), а за I–III категория — на началника на ДНСК (чл. 225 ЗУТ).'),
  ('zut-3-08', 'zut', 3, null, 'Строител продава апартамент „на Акт 14“. Какво проверявате задължително?', array['Разрешението за строеж, одобрените проекти, Акт 14 и правото на строителя върху земята', 'Само Акт 14 — щом го има, всичко е наред', 'Само дали строителят е регистриран по ДДС', 'Само рекламната брошура и разпределението'], 0, 'Разрешението за строеж и проектите показват какво точно се строи законно. Документът за земята или за правото на строеж показва, че строителят има право да продава.'),
  ('zut-3-09', 'zut', 3, null, 'Какво е ОУП?', array['Общ устройствен план — определя предназначението на териториите в цялата община', 'Отделен устройствен план за всяка сграда', 'Опис на урегулираните парцели в квартала', 'Одобрен устройствен проект на конкретна сграда'], 0, 'ОУП определя зоните (жилищни, смесени, производствени и т.н.) и общите показатели. Подробните планове (ПУП) трябва да са в съответствие с него.'),
  ('zut-3-10', 'zut', 3, null, 'Купувач иска къща в Жм зона и пита дали може да вдигне още един етаж. Откъде започвате проверката?', array['От действащия ПУП и ОУП — пределната височина, Кинт, плътност и вече използваната РЗП', 'От съседите — ако те не възразяват, може', 'От нотариалния акт — там пише колко етажа може да има', 'От данъчната оценка на имота'], 0, 'Какво може да се строи определят устройственият план и показателите му. Нужни са и проект, и разрешение за строеж. Добре е да се прецени дали показателите вече не са изчерпани.'),
  ('zut-3-11', 'zut', 3, null, 'Нова сграда има Акт 15, но още няма разрешение за ползване. Кое е вярно за купувача?', array['Сградата още не може законно да се ползва и банките обикновено чакат въвеждането в експлоатация', 'Може да се нанесе веднага — Акт 15 е достатъчен', 'Сградата е незаконна и сделката е нищожна', 'Акт 15 замества разрешението за ползване'], 0, 'Акт 15 е стъпка към въвеждането в експлоатация, но не я замества. Нанасянето и много банкови условия зависят от разрешението за ползване или удостоверението.'),
  ('law-1-01', 'law', 1, null, 'В каква форма трябва да е договорът за продажба на недвижим имот, за да прехвърли собствеността?', array['Нотариален акт', 'Писмен договор с нотариално заверени подписи', 'Писмен договор между страните', 'Договор, регистриран в общината'], 0, 'По чл. 18 ЗЗД договорите за прехвърляне на собственост върху недвижим имот се сключват с нотариален акт. Иначе са нищожни.'),
  ('law-1-02', 'law', 1, null, 'Кой плаща местния данък при придобиване на имот, ако не е уговорено друго?', array['Купувачът', 'Продавачът', 'Брокерът', 'Двамата поравно'], 0, 'Данъкът при придобиване се плаща от приобретателя — купувача. Страните могат да уговорят друго.'),
  ('law-1-03', 'law', 1, null, 'Колко е местният данък при придобиване на имот?', array['Между 0,1% и 3% — определя го общинският съвет', 'Винаги 2% от цената', '10% от печалбата на продавача', 'Фиксирани 500 € на сделка'], 0, 'Всяка община определя размера между 0,1% и 3%. В повечето големи градове е 3%. Основата е по-високата от договорената цена и данъчната оценка.'),
  ('law-1-04', 'law', 1, null, 'Откъде се вади удостоверение за данъчна оценка на имот?', array['От общината, в която се намира имотът', 'От общината по постоянния адрес на собственика', 'От НАП', 'От Агенцията по вписванията'], 0, 'Удостоверението (по чл. 264, ал. 1 ДОПК) се вади от общината по местонахождение на имота. То показва и дали данъкът и таксата за смет са платени.'),
  ('law-1-05', 'law', 1, null, 'Какво показва удостоверението за тежести?', array['Дали имотът има ипотеки, възбрани, искови молби и други вписвания', 'Колко тежи носещата конструкция на сградата', 'Дали има неплатени сметки за ток и вода', 'Каква е данъчната оценка на имота'], 0, 'Издава се от Службата по вписванията. Купувачът и банката винаги го искат — добре е да е проверено преди капаро.'),
  ('law-1-06', 'law', 1, null, 'Какво е капаро?', array['Сума, която обезпечава сделката: ако купувачът се откаже, я губи; ако продавачът се откаже, връща двойно', 'Безвъзмездна такса за брокера', 'Аванс, който винаги се връща изцяло', 'Задължителна вноска към нотариуса'], 0, 'По чл. 93 ЗЗД: ако неизправна е страната, дала капарото, другата може да го задържи; ако неизправна е получилата капарото, тя дължи двойния му размер.'),
  ('law-1-07', 'law', 1, null, 'Апартаментът е купен по време на брака на продавачите. Кой подписва продажбата?', array['И двамата съпрузи (или единият с пълномощно от другия)', 'Само този, който е посочен в нотариалния акт', 'Само съпругът, който е плащал кредита', 'Само единият, ако другият не възразява писмено'], 0, 'Имотите, купени по време на брака, обикновено са съпружеска имуществена общност — разпореждат се двамата съпрузи заедно.'),
  ('law-1-08', 'law', 1, null, 'Къде се вписва нотариалният акт за продажба?', array['В Службата по вписванията към Агенцията по вписванията', 'В общината, отдел „Местни данъци“', 'В НАП', 'В кадастъра'], 0, 'Нотариусът изпраща акта за вписване в Имотния регистър. Вписването прави сделката противопоставима на трети лица.'),
  ('law-1-09', 'law', 1, null, 'Какво е предварителен договор?', array['Писмен договор, с който страните се задължават да сключат окончателния договор при уговорените условия', 'Нотариален акт, който прехвърля собствеността', 'Устна уговорка между купувача и продавача', 'Договорът за посредничество с брокера'], 0, 'Предварителният договор е писмен (чл. 19 ЗЗД) и описва цената, сроковете, капарото и условията. Собствеността минава едва с нотариалния акт.'),
  ('law-1-10', 'law', 1, null, 'Откъде се вади удостоверение за наследници?', array['От общината по последния постоянен адрес на починалия', 'От общината, в която е имотът', 'От нотариуса', 'От районния съд'], 0, 'Удостоверението показва кои са наследниците. Вади се по последния постоянен адрес на починалия — не непременно там, където е имотът.'),
  ('law-1-11', 'law', 1, null, 'Каква е основната цел на договора за посредничество с клиента?', array['Да уреди писмено какво прави брокерът, срещу каква комисионна и кога тя се дължи', 'Да прехвърли собствеността върху имота', 'Да замени предварителния договор', 'Да даде на брокера право да подписва вместо клиента'], 0, 'Писменият договор предпазва и клиента, и брокера: ясни са услугата, комисионната, срокът и случаите, в които тя се дължи.'),
  ('law-2-01', 'law', 2, null, 'Какво е правото на ползване?', array['Право да ползваш чужд имот и да получаваш добивите от него, без да си собственик', 'Правото на собственика да живее в имота си', 'Договор за наем с нотариална заверка', 'Правото на съседите да минават през двора'], 0, 'Правото на ползване е ограничено вещно право. Учредено в полза на човек, най-често е пожизнено, ако не е уговорен срок.'),
  ('law-2-02', 'law', 2, null, 'Купувач купува апартамент, в който продавачът си запазва пожизнено право на ползване. Какво получава купувачът?', array['Собствеността, но без правото да ползва имота, докато правото на ползване не се погаси', 'Пълна собственост — ползвателят трябва да напусне', 'Само право на ползване', 'Нищо — такава сделка е нищожна'], 0, 'Купувачът става собственик („гола собственост“), а ползвателят живее в имота до погасяването на правото — обикновено до смъртта си. Това се отразява силно на цената.'),
  ('law-2-03', 'law', 2, null, 'Какво дължи продавачът, ако се откаже от сделката без основание, след като е получил капаро?', array['Двойния размер на капарото', 'Само да върне капарото, без лихва', 'Половината от капарото', 'Нищо, ако се откаже до 30 дни'], 0, 'Чл. 93, ал. 2 ЗЗД: ако неизправна е страната, получила капарото, тя трябва да го върне в двоен размер.'),
  ('law-2-04', 'law', 2, null, 'Продавачът по предварителен договор отказва да подпише нотариалния акт. Какво може да направи купувачът?', array['Да предяви иск за обявяване на предварителния договор за окончателен (чл. 19, ал. 3 ЗЗД)', 'Нищо друго, освен да си поиска капарото', 'Да помоли нотариуса да подпише вместо продавача', 'Да впише имота на свое име в кадастъра'], 0, 'Съдът може да обяви предварителния договор за окончателен, ако купувачът изпълни своите задължения (например плати цената). Алтернативата е да развали договора и да търси капарото или обезщетение.'),
  ('law-2-05', 'law', 2, null, 'Апартамент е наследен от единия съпруг по време на брака. Чий е?', array['Личен — на съпруга, който го е наследил', 'Общ на двамата, защото е придобит по време на брака', 'Половината е на другия съпруг', 'Общ, ако семейството живее в него'], 0, 'Имуществото, придобито по наследство или дарение, е лично (чл. 22 от Семейния кодекс). Продава го само наследилият съпруг.'),
  ('law-2-06', 'law', 2, null, 'Съсобственик иска да продаде своята идеална част от имот на трето лице. Кой има право на изкупуване?', array['Другите съсобственици — първо трябва да им се предложи на същата цена', 'Общината', 'Съседите по регулация', 'Наемателят на имота'], 0, 'Чл. 33 от Закона за собствеността: съсобственикът първо предлага частта си на другите съсобственици. Ако не го направи, те могат да я изкупят по съдебен ред.'),
  ('law-2-07', 'law', 2, null, 'Колко е таксата за вписване на нотариален акт за продажба?', array['0,1% от цената (материалния интерес)', '1% от цената', '3% от цената', 'Фиксирана такса от 50 €'], 0, 'Агенцията по вписванията събира 0,1% от материалния интерес. Към нея се добавят нотариалната такса и местният данък.'),
  ('law-2-08', 'law', 2, null, 'С какво пълномощно може да се продаде имот от името на собственика?', array['Изрично нотариално заверено пълномощно — със заверка на подписа и съдържанието', 'Обикновено писмено пълномощно', 'Пълномощно с подпис, заверен в общината', 'Устно съгласие пред двама свидетели'], 0, 'Пълномощното трябва да е изрично за сделката и в нотариалната форма по чл. 37 ЗЗД. Пълномощно от чужбина — в българско консулство или с апостил и превод.'),
  ('law-2-09', 'law', 2, null, 'По кой закон брокерите на имоти са задължени да проверяват клиентите си?', array['Законът за мерките срещу изпирането на пари (ЗМИП)', 'Законът за защита на потребителите', 'Законът за счетоводството', 'Законът за кредитните институции'], 0, 'Лицата, които по занятие посредничат при сделки с имоти, са задължени лица по ЗМИП: идентифицират клиентите, правят комплексна проверка и пазят документите.'),
  ('law-2-10', 'law', 2, null, 'Каква декларация подписва купувачът при сделка, когато го изисква законът срещу изпирането на пари?', array['Декларация за произхода на средствата', 'Декларация за семейното положение на продавача', 'Декларация, че не притежава друг имот', 'Декларация за данъчната оценка'], 0, 'Декларацията за произхода на средствата се изисква по ЗМИП. Подписва се пред нотариуса, а при посредничеството — и пред брокера.'),
  ('law-2-11', 'law', 2, null, 'Каква е данъчната основа на местния данък при придобиване?', array['По-високата от договорената цена и данъчната оценка', 'Винаги данъчната оценка', 'Винаги договорената цена', 'Пазарната оценка на банката'], 0, 'Данъкът се изчислява върху по-високата от двете стойности. Затова деклариране на ниска цена не намалява данъка под този върху данъчната оценка.'),
  ('law-3-01', 'law', 3, null, 'Колко години трябва да се пазят документите от проверката на клиент по ЗМИП?', array['5 години', '1 година', '3 години', '10 години'], 0, 'ЗМИП изисква документите и информацията от комплексната проверка да се пазят 5 години.'),
  ('law-3-02', 'law', 3, null, 'До кого се съобщава съмнителна операция по ЗМИП?', array['До ДАНС — дирекция „Финансово разузнаване“', 'До НАП', 'До районното управление на МВР', 'До БНБ'], 0, 'Съмнения за изпиране на пари се съобщават на дирекция „Финансово разузнаване“ на ДАНС — преди сделката, когато е възможно, без да се уведомява клиентът.'),
  ('law-3-03', 'law', 3, null, 'Физическо лице продава единствения си апартамент, притежаван 4 години. Дължи ли данък върху печалбата?', array['Не — продажбата на един жилищен имот в годината, притежаван над 3 години, не се облага', 'Да — 10% от печалбата', 'Да — 10% от цялата цена', 'Да — 3% местен данък върху цената'], 0, 'По ЗДДФЛ доходът от продажба на един жилищен имот в годината не се облага, когато между придобиването и продажбата са минали над 3 години. При друг случай е добре клиентът да се посъветва със счетоводител.'),
  ('law-3-04', 'law', 3, null, 'Колко време запазва действието си вписаната ипотека?', array['10 години от вписването, ако не бъде подновена', '5 години', 'До изплащане на кредита, без срок', '20 години'], 0, 'По чл. 172 ЗЗД вписването на ипотеката запазва действието си 10 години. Банките я подновяват преди срока, ако кредитът още не е изплатен.'),
  ('law-3-05', 'law', 3, null, 'Имотът е под възбрана. Кое е вярно?', array['Продажбата не може да се противопостави на взискателя — възбраната трябва да се вдигне преди сделката', 'Нотариусът я заличава при продажбата', 'Възбраната отпада автоматично при продажба', 'Не е проблем, ако купувачът плати в брой'], 0, 'Възбраната е обезпечителна мярка: последващите сделки са непротивопоставими на кредитора. Нужна е проверка в Службата по вписванията и заличаване преди сделката.'),
  ('law-3-06', 'law', 3, null, 'Пълномощно за продажба е издадено в чужбина. Кое е правилно?', array['Заверено в българско консулство или от местен нотариус с апостил и превод на български', 'Всяко пълномощно от чужбина е валидно без заверка', 'Нужно е само да е преведено на български', 'Пълномощно от чужбина не се приема за имоти'], 0, 'Пълномощното трябва да е в нотариалната форма. От чужбина — в българско консулство или от местния нотариус с апостил и легализиран превод.'),
  ('law-3-07', 'law', 3, null, 'Наследниците не са подали декларация по чл. 32 ЗМДТ. Какво пречи на продажбата?', array['Общината не може да издаде удостоверение за данъчна оценка на тяхно име', 'Нотариусът не може да състави удостоверение за наследници', 'Имотът се смята за общинска собственост', 'Нищо — декларацията не е нужна за продажбата'], 0, 'Наследниците подават декларацията в общината по последния адрес на починалия до 6 месеца от смъртта. Без нея няма данъчна оценка на тяхно име, а без нея няма сделка.'),
  ('law-3-08', 'law', 3, null, 'Строител, регистриран по ДДС, продава апартамент в нова сграда. Кое е вярно?', array['Продажбата е облагаема с 20% ДДС, обикновено включен в цената', 'Продажбите на жилища винаги са освободени от ДДС', 'ДДС плаща купувачът отделно на НАП', 'ДДС се начислява само върху паркоместата'], 0, 'Доставката на нова сграда е облагаема по ЗДДС. Продажбата на сграда, която вече не е „нова“ по смисъла на закона, обикновено е освободена от ДДС.'),
  ('law-3-09', 'law', 3, null, 'Купувачът иска в нотариалния акт да се впише по-ниска цена от реалната. Как реагирате?', array['Отказвате — това е невярно деклариране, рисково за двете страни, а данъкът се плаща поне върху данъчната оценка', 'Съгласявате се — така купувачът спестява данък', 'Съгласявате се, ако и продавачът е съгласен', 'Предлагате разликата да се плати като комисионна'], 0, 'Невярната цена създава риск при спор (купувачът доказва по-малко платено), при проверка от НАП и по ЗМИП. Професионалният брокер не участва в това.'),
  ('law-3-10', 'law', 3, null, 'Купувачът е фирма. Какво допълнително се проверява?', array['Кой представлява фирмата по Търговския регистър и кой е действителният ѝ собственик по ЗМИП', 'Само дали фирмата е регистрирана по ДДС', 'Само личната карта на управителя', 'Нищо — фирмите не се проверяват'], 0, 'Проверява се актуалното състояние в Търговския регистър (кой подписва) и действителният собственик — изискване по ЗМИП.'),
  ('law-3-11', 'law', 3, null, 'Купувач — гражданин на държава извън ЕС — иска къща с двор. Кое е вярно?', array['Не може да придобие земята; може да купи сградата с право на строеж или чрез българска фирма', 'Може да купи всичко без ограничения', 'Не може да купи никакъв имот в България', 'Може, ако плати двоен данък при придобиване'], 0, 'Конституцията не позволява на чужденци извън ЕС (без международен договор) да придобиват земя, освен по наследство по закон. Апартаменти и сгради могат да купуват.'),
  ('buyers-1-01', 'buyers', 1, null, 'Кое е най-важно да разберете от купувача още в първия разговор?', array['Какво търси, защо купува, какъв е бюджетът и кога иска да купи', 'Само любимия му квартал', 'Какви имоти е гледал при колегите', 'Дали има деца в училищна възраст'], 0, 'Нуждата, мотивът, бюджетът и срокът определят дали и как да работите с купувача. Без тях огледите са на сляпо.'),
  ('buyers-1-02', 'buyers', 1, null, 'Кога е най-добре да се обадите на нов купувач, който е пратил запитване?', array['Веднага — до 5 минути', 'До края на деня', 'На следващата сутрин', 'След като му пратите оферти по имейл'], 0, 'Speed to lead: шансът да го спечелите пада рязко с всяка минута. Първият брокер, който се обади, най-често води клиента.'),
  ('buyers-1-03', 'buyers', 1, null, 'Купувач казва: „Покажете ми всички тристайни в града.“ Какво правите?', array['Задавате въпроси, за да стесните търсенето, и показвате само подходящите', 'Изпращате му всички налични обяви', 'Казвате му да разгледа сайтовете сам', 'Насрочвате 10 огледа за един ден'], 0, 'Повече огледи не значи повече сделки. Квалификацията спестява време и показва на купувача, че разбирате какво му трябва.'),
  ('buyers-1-04', 'buyers', 1, null, 'Какво подписва купувачът при оглед?', array['Протокол (огледен лист) с имотите, които е видял с вас', 'Предварителен договор', 'Пълномощно за брокера', 'Декларация за произхода на средствата'], 0, 'Огледният лист доказва, че имотът е показан от вас. Той пази комисионната, ако купувачът се опита да заобиколи брокера.'),
  ('buyers-1-05', 'buyers', 1, null, 'Купувачът ще ползва кредит. Каква е първата стъпка преди огледите?', array['Предварително одобрение от банка — за да знае реалния си бюджет', 'Да даде капаро за подходящ имот', 'Да избере нотариус', 'Да поиска оценка на имота'], 0, 'С предварителното одобрение купувачът знае колко може да вземе. Вие показвате имоти в реалния бюджет и не губите сделки на финала.'),
  ('buyers-1-06', 'buyers', 1, null, 'Кой купувач е „горещ“ (лента A)?', array['Този, който ще купи в следващите 14–30 дни', 'Този, който ще купи след 3–6 месеца', 'Този, който само следи пазара', 'Всеки купувач с бюджет над 100 000 €'], 0, 'Лентите в BRIXA са по срока: A — до 30 дни, B — 30–90 дни, C — над 90 дни. Срокът определя колко често и как се чувате.'),
  ('buyers-1-07', 'buyers', 1, null, 'Колко често да се чувате с горещ купувач (лента A)?', array['Поне два пъти седмично', 'Веднъж месечно', 'Само когато излезе нов имот', 'Веднъж на 3 месеца'], 0, 'Горещият купувач решава сега. Ако не го държите информиран, ще купи чрез някой, който го прави.'),
  ('buyers-1-08', 'buyers', 1, null, 'Купувачът пита какви разходи има освен цената. Какво включвате?', array['Местния данък при придобиване, нотариалната такса, таксата за вписване и комисионната, ако е уговорена', 'Само комисионната', 'Само нотариалната такса', 'ДДС върху цената при всеки имот'], 0, 'Разходите обикновено са около 3–5% от цената. Купувачът трябва да ги знае предварително, особено при кредит, който покрива само цената.'),
  ('buyers-1-09', 'buyers', 1, null, 'Какво значи „двустаен апартамент“ в България?', array['Дневна и една спалня (две стаи), плюс кухня или кухненски бокс и баня', 'Две спални и отделна дневна', 'Апартамент с две бани', 'Апартамент на два етажа'], 0, 'Броят стаи включва дневната. Тристайният има дневна и две спални. Купувачите от чужбина често броят само спалните — уточнете.'),
  ('buyers-1-10', 'buyers', 1, null, 'Какво правите в същия ден след оглед?', array['Чувате се с купувача за впечатленията и записвате обратната връзка', 'Нищо — купувачът ще се обади, ако хареса', 'Пращате на собственика фактура', 'Пускате имота отново в рекламата'], 0, 'Обратната връзка показва накъде да продължите и е ценна за собственика. Записана в BRIXA, тя влиза и в отчета му.'),
  ('buyers-2-01', 'buyers', 2, null, 'Купувачът харесва имота, но казва „Ще помисля.“ Кой е най-добрият следващ въпрос?', array['„Какво точно ви кара да се колебаете?“', '„Добре, обадете ми се, когато решите.“', '„Имотът няма да чака — решете сега!“', '„Да ви покажа ли още десет имота?“'], 0, '„Ще помисля“ обикновено крие конкретно възражение — цена, локация, партньор, финансиране. Като го научите, можете да работите с него.'),
  ('buyers-2-02', 'buyers', 2, null, 'Какво проверявате с квалификацията BANT?', array['Бюджета, кой взима решението, нуждата и срока', 'Банката, адреса, номера и телефона', 'Бюджета, агенцията, нотариуса и таксите', 'Броя стаи, асансьора, новото строителство и терасата'], 0, 'BANT: Budget, Authority, Need, Timeline. Ако едно от тях липсва, купувачът още не е готов за огледи.'),
  ('buyers-2-03', 'buyers', 2, null, 'Купувач идва чрез колега от друга агенция. Какво уточнявате преди огледа?', array['Писмено как се дели комисионната и кой какво поема', 'Нищо — ще го уточните след сделката', 'Само телефона на купувача', 'Дали колегата ще присъства на огледа'], 0, 'Споразумението между агенциите, договорено писмено предварително, предотвратява спорове на финала.'),
  ('buyers-2-04', 'buyers', 2, null, 'Купувачът иска да предложи 20% под цената. Какво правите?', array['Показвате му сравними продажби и предавате писмена оферта на собственика', 'Отказвате да предадете офертата', 'Предавате я устно, без да коментирате', 'Казвате му, че собственикът ще се обиди'], 0, 'Всяка сериозна оферта се предава. Данните помагат на купувача да е реалист, а писмената оферта показва сериозност.'),
  ('buyers-2-05', 'buyers', 2, null, 'Кога купувачът трябва да види удостоверението за тежести?', array['Преди да даде капаро или да подпише предварителен договор', 'След нотариалния акт', 'Не е нужно — нотариусът проверява', 'Само ако купува с кредит'], 0, 'Ипотека или възбрана, открити след капарото, водят до спор и забавяне. Проверката е проста и евтина — направете я рано.'),
  ('buyers-2-06', 'buyers', 2, null, 'Купувач на ново строителство: какво проверявате за строителя?', array['Разрешението за строеж, собствеността на земята и завършените му сгради', 'Само рекламата и визуализациите', 'Само цената на кв. м', 'Само дали има офис продажби'], 0, 'Добрият строител има история, законни книжа и право да строи. Предишните му сгради показват качеството и сроковете.'),
  ('buyers-2-07', 'buyers', 2, null, 'Купувачът иска втори оглед с родителите си. Как реагирате?', array['Насрочвате го бързо — това е силен сигнал за интерес', 'Отказвате — един оглед стига', 'Казвате му да дойдат сами, без вас', 'Изчаквате седмица, за да не изглеждате нетърпеливи'], 0, 'Вторият оглед с хората, които влияят на решението, често е последната стъпка преди оферта.'),
  ('buyers-2-08', 'buyers', 2, null, 'Купувачът се колебае между два имота. Кое помага най-много?', array['Сравнение по критериите, които той сам е посочил като най-важни', 'Да му кажете кой имот ви носи по-голяма комисионна', 'Да му покажете трети имот', 'Да го оставите да реши сам след месец'], 0, 'Върнете купувача към собствените му приоритети — това е честно и ускорява решението.'),
  ('buyers-2-09', 'buyers', 2, null, 'Защо е важно офертата на купувача да е писмена?', array['Показва сериозност, условията са ясни и собственикът може да отговори конкретно', 'Защото устните оферти са незаконни', 'Защото така брокерът получава комисионна', 'Не е важно — устната оферта е същото'], 0, 'Писмената оферта описва цена, капаро, срокове и условия. Тя предотвратява недоразумения и е основа за насрещно предложение.'),
  ('buyers-2-10', 'buyers', 2, null, 'Купувач от друга държава от ЕС иска да купи апартамент. Може ли?', array['Да — при същите условия като българските граждани', 'Не — само чрез българска фирма', 'Само ако има постоянен адрес в България', 'Само с разрешение от общината'], 0, 'Гражданите на ЕС могат да придобиват имоти, включително земя, както българските граждани.'),
  ('buyers-3-01', 'buyers', 3, null, 'Двама купувачи искат един и същ имот. Как постъпвате правилно?', array['Информирате собственика за двете оферти и той решава, без да издавате условията на единия на другия', 'Давате имота на първия, без да казвате на собственика', 'Казвате на всеки офертата на другия, за да вдигнат цената', 'Избирате купувача, с когото комисионната е по-голяма'], 0, 'Собственикът решава. Брокерът е честен с двете страни и пази поверителността на всяка оферта.'),
  ('buyers-3-02', 'buyers', 3, null, 'Купувачът дава 10% капаро, но кредитът му още не е одобрен. Как да е уредено, за да не загуби капарото?', array['С изрично условие в предварителния договор, че при отказ на банката капарото се връща', 'Не може да се уреди — капарото винаги се губи', 'Достатъчно е устно обещание на продавача', 'Чрез по-малко капаро без договор'], 0, 'Условие за финансиране (с краен срок) пази купувача. Продавачът пък знае докога чака.'),
  ('buyers-3-03', 'buyers', 3, null, 'Купувач иска да купи на името на фирмата си. Какво се променя за сделката?', array['Подписва представителят по Търговския регистър, проверява се действителният собственик по ЗМИП и се обсъждат данъчните последици', 'Нищо не се променя', 'Сделката може да е само с кредит', 'Фирмите не плащат данък при придобиване'], 0, 'Покупката от фирма има своя логика — данъци, амортизация, ДДС. Клиентът е добре да се посъветва със счетоводител преди сделката.'),
  ('buyers-3-04', 'buyers', 3, null, 'Оценката на банката излиза по-ниска от договорената цена. Какво значи това за купувача?', array['Банката ще кредитира процент от по-ниската оценка — разликата трябва да се покрие от него или да се договори по-ниска цена', 'Банката автоматично ще отпусне повече', 'Сделката е невалидна', 'Нищо — банката гледа само договорената цена'], 0, 'Банката кредитира процент от по-ниската от двете стойности. Предупредете купувача рано и имайте резервен план.'),
  ('buyers-3-05', 'buyers', 3, null, 'Купувач-инвеститор сравнява имот с 6% доходност от наем и имот с 4,5%, но в квартал с бърз ръст на цените. Кое е вярно?', array['Общата възвръщаемост е доходността от наема плюс ръста на цената — вторият може да е по-добър дългосрочно', 'Винаги е по-добър имотът с по-висока доходност от наем', 'Ръстът на цените не е от значение за инвеститора', 'Двата имота са равностойни'], 0, 'Инвеститорът гледа и паричния поток (наема), и ръста на стойността — и риска при двете.'),
  ('buyers-3-06', 'buyers', 3, null, 'Купувачът казва, че максимумът му е 150 000 €, но предлага 140 000 €. Какво правите с тази информация?', array['Пазите я — не я казвате на продавача без съгласието на купувача', 'Казвате на продавача, за да вдигне цената', 'Записвате я в обявата', 'Казвате на всички колеги'], 0, 'Поверителната информация на клиента не се споделя с другата страна. Това е основа на доверието.'),
  ('buyers-3-07', 'buyers', 3, null, 'Купувачът иска да плати част от цената в брой извън нотариалния акт. Кое е най-правилно?', array['Цялата цена да е в акта и да се плати по банков път', 'Да, ако продавачът е съгласен', 'Да, ако сумата е под 10% от цената', 'Да, ако бъде платена при брокера'], 0, 'Плащането по сметка оставя следа и пази купувача при спор. Неописаните суми са риск и по ЗМИП, и пред НАП.'),
  ('buyers-3-08', 'buyers', 3, null, 'Купувачът е видял 25 имота и не купува. Какъв е най-вероятният проблем?', array['Квалификацията — критериите или бюджетът не са реалистични, или той не е готов да купи', 'Купувачът просто не е видял правилния имот', 'Пазарът е твърде малък', 'Купувачът има нужда от още огледи'], 0, 'Много огледи без оферта значат, че трябва да се върнете към нуждата, бюджета и мотива — или да приемете, че купувачът е в лента C.'),
  ('buyers-3-09', 'buyers', 3, null, 'Купувачът иска да продаде своя имот, за да купи нов. Как подреждате процеса?', array['Продажбата и покупката се синхронизират — с условия и срокове в предварителните договори', 'Първо купува, после мисли за продажбата', 'Първо продава, а после търси, дори да остане без жилище', 'Не е работа на брокера'], 0, 'Синхронизираната сделка (продажба и покупка) иска условия за срокове и плащания. Така клиентът не остава без жилище или без пари.'),
  ('buyers-3-10', 'buyers', 3, null, 'Купувач иска да види имот, но не иска да подпише огледен лист. Какво правите?', array['Обяснявате, че листът пази и двете страни, и не показвате без него', 'Показвате имота и се надявате на коректност', 'Пращате му адреса, за да отиде сам', 'Отказвате да работите с него завинаги'], 0, 'Огледният лист е стандарт и не задължава купувача да купи. Без него не можете да докажете работата си.'),
  ('sellers-1-01', 'sellers', 1, null, 'Кой е първият документ, който искате от продавача?', array['Документът за собственост — нотариален акт или друг', 'Личната му карта и банкова сметка', 'Сметките за ток и вода', 'Скица от общината'], 0, 'Документът за собственост показва кой може да продава, какво точно се продава и на какво основание е придобит имотът.'),
  ('sellers-1-02', 'sellers', 1, null, 'Как определяте правилната обявена цена?', array['По сравними продадени и активни имоти в района (сравнителен анализ)', 'По цената, която собственикът иска', 'Като добавите 20% отгоре за пазарене', 'По данъчната оценка'], 0, 'Пазарът определя цената. Сравнителният анализ с реално продадени имоти е най-силният аргумент пред собственика.'),
  ('sellers-1-03', 'sellers', 1, null, 'Какво се случва с имот, обявен на твърде висока цена?', array['Стои дълго на пазара, губи интерес и накрая се продава по-евтино', 'Продава се по-бързо, защото изглежда луксозен', 'Привлича повече купувачи', 'Нищо — купувачите винаги пазаряват'], 0, 'Първите седмици са най-силни. Надцененият имот ги пропилява и после „изтърканата“ обява се продава под пазарната цена.'),
  ('sellers-1-04', 'sellers', 1, null, 'Кое е най-важно за снимките на имота?', array['Подреден и светъл имот, снимки на дневна светлина, от правилни ъгли', 'Много снимки на мебелите отблизо', 'Само снимки на фасадата', 'Филтри, които карат стаите да изглеждат по-големи'], 0, 'Снимките продават огледа. Те трябва да са истински — подвеждащата снимка губи купувача на място.'),
  ('sellers-1-05', 'sellers', 1, null, 'Какво е ексклузивен договор?', array['Договор, с който собственикът възлага продажбата само на вашата агенция за определен срок', 'Договор с най-висока комисионна', 'Договор, при който собственикът продава сам', 'Договор само за луксозни имоти'], 0, 'При ексклузивност има един отговорен брокер, една цена на пазара и пълна инвестиция в продажбата.'),
  ('sellers-1-06', 'sellers', 1, null, 'Защо ексклузивният договор е по-добър и за продавача?', array['Брокерът инвестира в реклама и има един ясен отговорен човек и една цена на пазара', 'Защото така продавачът плаща по-малко данъци', 'Защото купувачите плащат по-висок данък', 'Няма полза за продавача'], 0, 'Имот, обявен от пет агенции на пет цени, изглежда отчаян. Един брокер с план продава по-бързо и на по-добра цена.'),
  ('sellers-1-07', 'sellers', 1, null, 'Какво подготвя продавачът преди огледите?', array['Почистване, подреждане, светлина, дребни ремонти и прибиране на личните вещи', 'Нищо — купувачите гледат само цената', 'Нов скъп ремонт на целия имот', 'Списък с цените на мебелите'], 0, 'Първото впечатление се създава за секунди. Чист, светъл и подреден имот се продава по-бързо и по-скъпо.'),
  ('sellers-1-08', 'sellers', 1, null, 'Колко често да информирате продавача какво става с имота?', array['Редовно — поне веднъж седмично: огледи, обратна връзка, интерес', 'Само когато има купувач', 'Веднъж месечно', 'Не е нужно, ако имотът е обявен'], 0, 'Собствениците най-често сменят брокера, защото „не знаят какво се случва“. Отчетът за собственика в BRIXA решава това.'),
  ('sellers-1-09', 'sellers', 1, null, 'Каква е комисионната при 3% от продажна цена 120 000 €?', array['3 600 €', '3 000 €', '4 000 €', '360 €'], 0, '3% × 120 000 € = 3 600 €. В BRIXA комисионната се изчислява автоматично от процента и цената.'),
  ('sellers-1-10', 'sellers', 1, null, 'Кое описание на обява работи най-добре?', array['Конкретни факти и ползи: площ, разпределение, изложение, близост до важни места', 'Само превъзходни степени: „уникален“, „невероятен“, „луксозен“', 'Само цената и телефона', 'Целият текст с главни букви'], 0, 'Купувачът търси информация. Конкретните факти печелят доверие и носят по-качествени запитвания.'),
  ('sellers-2-01', 'sellers', 2, null, 'Какво включва добрият сравнителен пазарен анализ за продавача?', array['Сравними продадени, активни и изтеглени имоти, отстъпката от обявената цена и времето за продажба', 'Само обявите в най-големия сайт', 'Само данъчната оценка', 'Само цената, която продавачът иска'], 0, 'Продадените показват реалната цена, активните — конкуренцията, а изтеглените — какво пазарът е отказал.'),
  ('sellers-2-02', 'sellers', 2, null, 'Имотът е 60 дни на пазара с много огледи, но без нито една оферта. Кой е най-вероятният проблем?', array['Цената спрямо това, което купувачите виждат на място', 'Рекламата', 'Снимките', 'Купувачите не са сериозни'], 0, 'Много огледи значат, че рекламата работи. Липсата на оферти показва, че на място имотът не оправдава цената.'),
  ('sellers-2-03', 'sellers', 2, null, 'Имотът има малко запитвания и огледи. Кое проверявате първо?', array['Цената и представянето в обявата — снимки, заглавие, описание', 'Дали купувачите са на почивка', 'Дали собственикът е учтив', 'Броя на сайтовете — трябват поне 20'], 0, 'Малкото запитвания значат, че обявата не впечатлява на фона на конкуренцията — заради цената или заради представянето.'),
  ('sellers-2-04', 'sellers', 2, null, 'Защо пращате на собственика редовен отчет за огледите и обратната връзка?', array['Показва работата ви и подготвя разговора за цената с факти', 'За да запълните пощата му', 'Защото законът го изисква', 'За да му поискате още комисионна'], 0, 'Когато собственикът сам вижда, че 12 купувачи казват „скъпо“, корекцията на цената е негово решение, а не ваш натиск.'),
  ('sellers-2-05', 'sellers', 2, null, 'Продавачът има ипотечен кредит върху имота. Как става продажбата?', array['Остатъкът по кредита се изплаща от цената при сделката и ипотеката се заличава', 'Не може да се продава, докато кредитът не е изплатен изцяло', 'Купувачът поема кредита автоматично', 'Ипотеката остава, но не е проблем'], 0, 'Банката на продавача дава писмо за точния остатък. Обикновено той се плаща от цената при нотариуса, а после ипотеката се заличава.'),
  ('sellers-2-06', 'sellers', 2, null, 'Продавачът иска да скрие от купувача, че има теч. Как реагирате?', array['Обяснявате, че за скрит недостатък продавачът отговаря — по-добре честно разкриване и цена според състоянието', 'Съгласявате се — не е ваша работа', 'Казвате на купувача след сделката', 'Ремонтирате го набързо с боя'], 0, 'По ЗЗД продавачът отговаря за скритите недостатъци. Скритият проблем почти винаги излиза и води до спор, развалена сделка и загубена репутация.'),
  ('sellers-2-07', 'sellers', 2, null, 'Имотът е наследен от трима наследници, единият е в чужбина. Какво подготвяте?', array['Удостоверение за наследници и пълномощно от наследника в чужбина (консулство или апостил)', 'Само личните карти на двамата в България', 'Нищо — подписва само най-големият наследник', 'Решение на съда за делба'], 0, 'Подписват всички наследници — лично или чрез пълномощник. Пълномощното от чужбина отнема време, затова се поръчва рано.'),
  ('sellers-2-08', 'sellers', 2, null, 'Как предлагате намаление на цената на продавача?', array['С данните от отчета — огледи, обратна връзка, сравними продажби — и конкретна нова цена', 'Казвате му, че иначе спирате да работите', 'Намалявате я в обявата, без да го питате', 'Чакате той да се сети'], 0, 'Фактите превръщат неприятния разговор в бизнес решение. Конкретната цена с аргументи се приема по-лесно от „трябва да свалим“.'),
  ('sellers-2-09', 'sellers', 2, null, 'Продавачът иска 150 000 €, а анализът показва 135 000 €. Каква е честната стратегия?', array['Показвате данните и се договаряте за начална цена и срок, след който тя се преразглежда', 'Приемате 150 000 € и мълчите', 'Обещавате му 160 000 €, за да вземете имота', 'Отказвате имота без обяснение'], 0, 'Ясната уговорка („ако до 30 дни няма оферта, коригираме“) пази времето и на двама ви.'),
  ('sellers-2-10', 'sellers', 2, null, 'Продавачът иска имотът да се предлага „от ръкава“ — без публична обява. Как работите?', array['Предлагате го дискретно на подходящи купувачи и колеги, без публична реклама', 'Пускате го във всички сайтове', 'Отказвате — без реклама не се продава', 'Публикувате го без снимки'], 0, 'Дискретната продажба е удачна за собственици, които не искат публичност. Работите със собствената си база купувачи и с доверени колеги.'),
  ('sellers-3-01', 'sellers', 3, null, 'Цена 180 000 €, остатък по кредита на продавача 60 000 €, комисионна 3%. Колко получава продавачът (без други разходи)?', array['114 600 €', '120 000 €', '174 600 €', '125 400 €'], 0, 'Комисионна: 3% × 180 000 = 5 400 €. 180 000 − 60 000 − 5 400 = 114 600 €.'),
  ('sellers-3-02', 'sellers', 3, null, 'Продавачът има оферта A: 145 000 € с кредит и срок 60 дни, и оферта B: 140 000 € собствени средства до 15 дни. Как го съветвате?', array['Сравнявате сигурността, сроковете и нетния резултат — по-ниската сигурна оферта може да е по-добра', 'Винаги приемате по-високата цена', 'Винаги приемате плащането в брой', 'Отхвърляте и двете и чакате повече'], 0, 'Кредитът носи риск от отказ или ниска оценка. Разликата от 5 000 € може да струва по-малко от два месеца несигурност.'),
  ('sellers-3-03', 'sellers', 3, null, 'Кои клаузи в договора за посредничество са най-важни?', array['Срокът, цената, комисионната, какво прави брокерът и кога се дължи комисионната', 'Само телефонът на собственика', 'Само цената на имота', 'Само подписът на брокера'], 0, 'Ясните условия предотвратяват спорове — особено кога комисионната се дължи, ако купувачът се появи след края на договора.'),
  ('sellers-3-04', 'sellers', 3, null, 'Кога брокерът има право на комисионна по договор за посредничество?', array['Когато сделката е сключена в резултат на неговото посредничество, при условията на договора', 'Само ако имотът се продаде на обявената цена', 'Още при подписването на договора', 'Само при ексклузивен договор'], 0, 'Комисионната се дължи за резултата от посредничеството — договорът казва кога и колко. Затова огледните листове и записите са важни.'),
  ('sellers-3-05', 'sellers', 3, null, 'Защо първите 2–3 седмици на имота на пазара са най-важни?', array['Тогава го виждат всички активни купувачи — правилната цена от началото носи най-много оферти', 'Защото сайтовете са безплатни тогава', 'Защото тогава данъците са по-ниски', 'Не са важни — важни са последните седмици'], 0, 'Новата обява получава най-много внимание. Ако цената е грешна, най-добрите купувачи вече са я видели и отминали.'),
  ('sellers-3-06', 'sellers', 3, null, 'Продава се къща с двор в регулация. Кои документи са специфични?', array['Скица на поземления имот (и на сградата) и строителни книжа или удостоверение за търпимост', 'Само схема на самостоятелен обект', 'Само удостоверение за данъчна оценка', 'Само разрешение от съседите'], 0, 'За къща и парцел вместо схема на апартамент се вади скица. Старите сгради без книжа искат удостоверение за търпимост, иначе нотариусът или банката може да откажат.'),
  ('sellers-3-07', 'sellers', 3, null, 'Продавачът иска в обявата да пише по-голяма площ от тази в документите. Как постъпвате?', array['Обявявате площта по документите, като идеалните части посочвате отделно', 'Пишете каквото иска — купувачът сам ще провери', 'Закръгляте нагоре с 10%', 'Не пишете площ изобщо'], 0, 'Невярната площ подвежда купувачите и излиза при сделката. Точната информация пази репутацията ви.'),
  ('sellers-3-08', 'sellers', 3, null, 'Собственикът казва: „Ще продам сам, без брокер, и ще спестя комисионната.“ Кой е най-силният отговор?', array['Показвате какво му носи брокерът — по-добра цена, проверени купувачи, сигурна сделка — и предлагате план с цифри', 'Казвате, че няма да успее', 'Веднага намалявате комисионната наполовина', 'Спирате да се чувате с него'], 0, 'Продавачите, които продават сами, често губят повече от комисионната — от цената, от времето и от грешки в документите.'),
  ('sellers-3-09', 'sellers', 3, null, 'Продавачът е подписал ексклузивен договор, но получава купувач директно. Какво казва обикновено договорът?', array['Комисионната се дължи и при продажба на намерен от него купувач, ако така е уговорено', 'Комисионната никога не се дължи в този случай', 'Договорът автоматично отпада', 'Купувачът плаща двойна комисионна'], 0, 'Затова клаузата трябва да е ясна и обяснена при подписването — без изненади после.'),
  ('sellers-3-10', 'sellers', 3, null, 'Как се справяте с продавач, който сменя цената всяка седмица (нагоре и надолу)?', array['Договаряте ясна стратегия с периоди за преглед по данни, а не по настроение', 'Сменяте я в обявата всеки път', 'Махате обявата без обяснение', 'Съветвате го да продаде на най-ниската цена'], 0, 'Честите промени объркват купувачите и показват несигурност. Стратегията с дати за преглед дава спокойствие и на двама ви.'),
  ('banks-1-01', 'banks', 1, null, 'Какво е предварителното одобрение за кредит?', array['Становище на банката до каква сума може да кредитира купувача, преди да е избран имот', 'Окончателният договор за кредит', 'Оценката на имота от банката', 'Съгласието на продавача да чака'], 0, 'С предварителното одобрение купувачът знае бюджета си. Окончателното одобрение идва след избора на имот и оценката.'),
  ('banks-1-02', 'banks', 1, null, 'Какво е ГПР?', array['Годишен процент на разходите — лихвата плюс всички такси, изразени като годишен процент', 'Годишната лихва без таксите', 'Главницата по погасителния план', 'Гаранционен процент за риска'], 0, 'ГПР показва реалната цена на кредита. С него се сравняват оферти на различни банки.'),
  ('banks-1-03', 'banks', 1, null, 'Какво обикновено иска банката като обезпечение по жилищен кредит?', array['Ипотека върху купувания имот', 'Запор на заплатата', 'Винаги двама поръчители', 'Нищо'], 0, 'Банката става ипотекарен кредитор: ако кредитът не се плаща, тя се удовлетворява от имота с предимство.'),
  ('banks-1-04', 'banks', 1, null, 'Кой прави оценката на имота за банката?', array['Лицензиран оценител, възложен или одобрен от банката', 'Брокерът', 'Нотариусът', 'Общината'], 0, 'Банката кредитира процент от оценката, не от договорената цена. Затова оценката е важна стъпка.'),
  ('banks-1-05', 'banks', 1, null, 'До колко процента от стойността на имота може да е жилищният кредит по правилата на БНБ?', array['До 85%', 'До 100%', 'До 60%', 'До 95%'], 0, 'БНБ ограничи съотношението кредит към стойност (LTV) до 85%. Купувачът трябва да има поне 15% собствени средства плюс разходите.'),
  ('banks-1-06', 'banks', 1, null, 'Какво е „самоучастие“?', array['Частта от цената, която купувачът плаща със собствени пари', 'Таксата за разглеждане на кредита', 'Вноската по кредита за първия месец', 'Сумата, която банката плаща на брокера'], 0, 'Самоучастието плюс кредитът дават цената. Разходите по сделката обикновено също са от собствени средства.'),
  ('banks-1-07', 'banks', 1, null, 'Защо купувачът с кредит трябва да има пари и за разходите по сделката?', array['Банката финансира част от цената, а не данъка, нотариуса и комисионната', 'Защото банката взима двойна такса', 'Не е нужно — банката финансира всичко', 'Защото ипотеката се плаща в брой'], 0, 'Данъкът при придобиване, нотариалната такса, вписването и комисионната обикновено са около 3–5% от цената.'),
  ('banks-1-08', 'banks', 1, null, 'Какво значи променлива (плаваща) лихва?', array['Лихва, която се променя според референтен индекс плюс фиксирана надбавка', 'Лихва, която банката сменя, когато пожелае', 'Лихва, която е еднаква за целия срок', 'Лихва само за първата година'], 0, 'При променлива лихва вноската може да се промени. Договорът казва по кой индекс и колко често.'),
  ('banks-1-09', 'banks', 1, null, 'Кога банката обикновено превежда сумата по кредита на продавача?', array['След подписването на нотариалния акт и вписването на ипотеката', 'Преди нотариуса, за да е сигурен продавачът', 'При подписването на предварителния договор', 'Една година след сделката'], 0, 'Банката плаща, когато ипотеката ѝ е вписана. Продавачът трябва да знае това предварително, за да няма напрежение в деня на сделката.'),
  ('banks-1-10', 'banks', 1, null, 'Каква застраховка е задължителна при жилищен кредит?', array['Застраховка на имота в полза на банката', 'Застраховка „Живот“ на продавача', 'Застраховка на мебелите', 'Застраховка на автомобила'], 0, 'Имотът е обезпечението, затова банката изисква да е застрахован в нейна полза. Застраховката „Живот“ обикновено е по желание или според офертата.'),
  ('banks-2-01', 'banks', 2, null, 'Имот за 150 000 €, оценката също е 150 000 €, кредит до 85%. Колко е минималното самоучастие (без разходите)?', array['22 500 €', '15 000 €', '30 000 €', '45 000 €'], 0, 'Кредит: 85% × 150 000 = 127 500 €. Самоучастие: 150 000 − 127 500 = 22 500 €. Разходите по сделката са отгоре.'),
  ('banks-2-02', 'banks', 2, null, 'Каква част от месечния доход може да отива за вноски по кредити по правилата на БНБ?', array['До 50%', 'До 30%', 'До 70%', 'Няма ограничение'], 0, 'БНБ ограничи съотношението вноски към доход (DSTI) до 50% от разполагаемия доход.'),
  ('banks-2-03', 'banks', 2, null, 'Какъв е максималният срок на жилищен кредит по правилата на БНБ?', array['30 години', '20 години', '35 години', '40 години'], 0, 'БНБ ограничи срока на жилищните кредити до 30 години.'),
  ('banks-2-04', 'banks', 2, null, 'Купувач с нетен доход 2 000 € и други вноски 300 € на месец. Каква най-голяма нова вноска допуска правилото за 50%?', array['700 €', '1 000 €', '1 700 €', '500 €'], 0, '50% × 2 000 = 1 000 € за всички вноски. 1 000 − 300 = 700 € за новия кредит.'),
  ('banks-2-05', 'banks', 2, null, 'Защо е добре клиентът да кандидатства в 2–3 банки?', array['Сравнява ГПР, таксите и условията и има резерв при отказ', 'Защото така кредитът става по-голям', 'Защото е задължително по закон', 'Не е добре — банките се обиждат'], 0, 'Условията се различават. Резервната банка спасява сделката, ако първата откаже или се забави.'),
  ('banks-2-06', 'banks', 2, null, 'Какво е рефинансиране?', array['Нов кредит, обикновено в друга банка, с който се изплаща старият при по-добри условия', 'Отлагане на вноските за 6 месеца', 'Кредит за ремонт на имота', 'Увеличаване на лихвата при закъснение'], 0, 'При падащи лихви рефинансирането може да намали вноската. Сметнете таксите, преди да го препоръчате.'),
  ('banks-2-07', 'banks', 2, null, 'Купувач на свободна практика с непостоянни доходи. Какво помага най-много за одобрение?', array['Документирани доходи за 1–2 години — данъчни декларации и банкови извлечения', 'Устна декларация за доходите', 'Повече снимки на имота', 'По-висока цена в предварителния договор'], 0, 'Банката гледа доказаните и устойчиви доходи. Подгответе клиента рано — документите отнемат време.'),
  ('banks-2-08', 'banks', 2, null, 'Как се отразява по-дългият срок на кредита?', array['Вноската намалява, но общо платената лихва се увеличава', 'Вноската и лихвата намаляват', 'Вноската се увеличава', 'Няма разлика'], 0, 'По-дългият срок улеснява вноската, но кредитът става по-скъп общо. Покажете на клиента и двете числа.'),
  ('banks-2-09', 'banks', 2, null, 'Кредит с фиксирана лихва за първите 5 години. Кое е вярно?', array['Вноската е сигурна 5 години, после лихвата става според договора (обикновено променлива)', 'Лихвата е фиксирана за целия срок', 'Лихвата се сменя всеки месец', 'Вноската е еднаква само първата година'], 0, 'Комбинираните условия са честа оферта. Проверете какво става след фиксирания период.'),
  ('banks-2-10', 'banks', 2, null, 'Какво значи, че кредитът и доходът на купувача са в една и съща валута (евро)?', array['Няма валутен риск — вноската не зависи от курса', 'Лихвата е винаги по-ниска', 'Банката не иска оценка', 'Кредитът е без ипотека'], 0, 'Когато доходът и кредитът са в различни валути, промяната на курса може да вдигне вноската. В една валута този риск го няма.'),
  ('banks-3-01', 'banks', 3, null, 'Цена 150 000 €, оценка на банката 140 000 €, кредит 85% от оценката. Колко собствени пари добавя купувачът към цената (без разходите)?', array['31 000 €', '22 500 €', '21 000 €', '10 000 €'], 0, 'Кредит: 85% × 140 000 = 119 000 €. Самоучастие: 150 000 − 119 000 = 31 000 €.'),
  ('banks-3-02', 'banks', 3, null, 'Кредит 100 000 € за 25 години при 3% годишна лихва. Каква е приблизително месечната вноска (анюитет)?', array['≈ 474 €', '≈ 333 €', '≈ 600 €', '≈ 250 €'], 0, 'При анюитет вноската е около 474 €. 333 € е само главницата (100 000 ÷ 300 месеца), без лихвата.'),
  ('banks-3-03', 'banks', 3, null, 'Купувачът иска 100% финансиране. Какво е реалистично да му кажете?', array['Банките кредитират до 85% от оценката — останалото трябва да е от собствени средства или от обезпечение с друг имот', 'Няма проблем — всички банки дават 100%', 'Ако цената в договора е по-висока, банката ще даде 100%', 'Брокерът може да гарантира 100%'], 0, 'Изкуственото вдигане на цената, за да се вземе по-голям кредит, е измама. Правилният път е самоучастие или допълнително обезпечение.'),
  ('banks-3-04', 'banks', 3, null, 'Кой трябва да е регистриран в БНБ, за да посредничи по ипотечни кредити срещу възнаграждение?', array['Кредитният посредник', 'Всеки брокер на имоти', 'Нотариусът', 'Оценителят'], 0, 'По Закона за кредитите за недвижими имоти на потребители кредитните посредници се регистрират в БНБ.'),
  ('banks-3-05', 'banks', 3, null, 'Строителят иска 30% при предварителния договор, 60% на Акт 14 и 10% при въвеждане в експлоатация. Как обикновено се финансира покупка с кредит?', array['Първо се плаща самоучастието, а банката кредитира по-късните вноски, когато строежът е напреднал (често след Акт 14)', 'Банката плаща всичко при предварителния договор', 'Кредит не е възможен при строителство', 'Строителят взима кредита вместо купувача'], 0, 'Схемите са различни при различните банки — съгласувайте плащанията по договора с банката, преди клиентът да подпише.'),
  ('banks-3-06', 'banks', 3, null, 'Какво се случва с ипотекирания имот, ако длъжникът спре да плаща?', array['Банката може да се удовлетвори от продажбата на имота с предимство пред другите кредитори', 'Нищо — ипотеката е само формалност', 'Имотът става собственост на банката веднага', 'Брокерът трябва да намери нов купувач'], 0, 'Ипотеката дава на банката право на предпочтително удовлетворяване — чрез принудително изпълнение, ако кредитът не се плаща.'),
  ('banks-3-07', 'banks', 3, null, 'Каква е правилната роля на брокера при кредита на купувача?', array['Насочва и подготвя клиента, координира сроковете с банката, но не обещава одобрение', 'Гарантира, че кредитът ще бъде одобрен', 'Подписва кредита вместо клиента', 'Решава вместо клиента коя банка'], 0, 'Помощта при кредита ускорява сделката, но решението е на банката и на клиента.'),
  ('banks-3-08', 'banks', 3, null, 'Лихвите по жилищните кредити падат. Какво обикновено става на пазара?', array['Търсенето расте — повече купувачи могат да си позволят кредит', 'Търсенето пада', 'Цените падат веднага', 'Нищо не се променя'], 0, 'По-ниската лихва значи по-ниска вноска за същата сума. Това е добър повод да се чуете с купувачите от лентите B и C.'),
  ('banks-3-09', 'banks', 3, null, 'Купувачът има одобрен кредит, но получава оферта от друга банка с по-нисък ГПР. Какво трябва да внимава?', array['Сроковете — смяната на банката може да забави сделката отвъд срока в предварителния договор', 'Нищо — винаги сменя банката', 'Да не казва на първата банка', 'Да вдигне цената в договора'], 0, 'По-евтиният кредит е добре, но не на цената на развалена сделка. Сверете сроковете с продавача.'),
  ('banks-3-10', 'banks', 3, null, 'Купувачът вече има жилищен кредит и иска втори за инвестиция. Кое ограничение важи за всичките му кредити?', array['Общите вноски по всички кредити не бива да надвишават 50% от дохода му', 'Важи само за новия кредит', 'Няма ограничение за втори кредит', 'Вторият кредит не може да е над 50 000 €'], 0, 'Правилото на БНБ (DSTI до 50%) гледа всички задължения на длъжника, а не само новия кредит.'),
  ('sales-1-01', 'sales', 1, null, 'Кое е най-важното умение в първия разговор с клиент?', array['Да задавате въпроси и да слушате повече, отколкото говорите', 'Да говорите бързо за всички свои имоти', 'Да кажете веднага комисионната си', 'Да убедите клиента да подпише днес'], 0, 'Клиентът ви се доверява, когато усети, че го разбирате. Добрите въпроси показват нуждата и мотива му.'),
  ('sales-1-02', 'sales', 1, null, 'Какво е „сфера на влияние“?', array['Хората, които ви познават — приятели, роднини, бивши клиенти, познати', 'Районът, в който работите', 'Колегите от другите агенции', 'Последователите в социалните мрежи, които не познавате'], 0, 'Сферата е най-евтиният източник на сделки и препоръки. Затова в BRIXA има програма „33 контакта“ за нея.'),
  ('sales-1-03', 'sales', 1, null, 'Защо записвате всеки разговор и контакт с клиента в BRIXA?', array['За да знаете историята, да не изпуснете следващата стъпка и екипът да може да поеме клиента', 'Защото така се трупат точки', 'Защото клиентът може да ги прочете', 'Не е нужно, ако помните'], 0, 'Паметта лъже, а записът остава. Бележката прави следващия разговор личен и професионален.'),
  ('sales-1-04', 'sales', 1, null, 'Клиент казва: „Комисионната ви е висока.“ Кой отговор е най-добър?', array['Обяснявате какво получава срещу нея и как влияе на крайния резултат', 'Веднага я намалявате наполовина', 'Казвате „така е навсякъде“', 'Спирате да работите с него'], 0, 'Клиентите не плащат за време, а за резултат: цена, сигурност, спокойствие. Покажете стойността с факти.'),
  ('sales-1-05', 'sales', 1, null, 'Какво е follow-up?', array['Планирано, редовно връщане към клиента, докато вземе решение', 'Еднократно обаждане след първата среща', 'Реклама на имот в социалните мрежи', 'Последният оглед преди сделката'], 0, 'Повечето сделки идват след няколко контакта. BRIXA напомня кога да се чуете с всеки клиент според лентата му.'),
  ('sales-1-06', 'sales', 1, null, 'За какво е програмата „33 контакта“ в BRIXA?', array['За сферата — 33 контакта през годината с хората, които ви познават', 'За 33 обаждания на ден', 'За 33 обяви на месец', 'За 33 огледа преди сделка'], 0, 'Редовните контакти през годината (обаждания, съобщения, поводи) ви държат в съзнанието на сферата, когато някой от тях реши да купува или продава.'),
  ('sales-1-07', 'sales', 1, null, 'За какво е програмата „8 × 8“ в BRIXA?', array['За нов контакт — 8 докосвания за 8 седмици, за да ви запомни', 'За 8 огледа на 8 имота', 'За 8 обяви в 8 сайта', 'За 8 часа работа и 8 часа сън'], 0, 'Новият контакт ви забравя бързо. Осем докосвания за осем седмици ви превръщат в „неговия брокер“.'),
  ('sales-1-08', 'sales', 1, null, 'Каква е целта на първото обаждане до собственик, който продава сам?', array['Да си уговорите среща, а не да продадете услугата по телефона', 'Да му кажете, че цената му е грешна', 'Да научите адреса и да изпратите купувачи без договор', 'Да го убедите веднага да подпише ексклузивен договор'], 0, 'По телефона се продава срещата. На срещата показвате плана, данните и стойността си.'),
  ('sales-1-09', 'sales', 1, null, 'Кой въпрос е отворен?', array['„Какво е най-важно за вас в новия дом?“', '„Искате ли тераса?“', '„Бюджетът ви 100 000 € ли е?“', '„В този квартал ли търсите?“'], 0, 'Отворените въпроси („какво“, „как“, „защо“) карат клиента да разказва. Затворените дават само „да“ или „не“.'),
  ('sales-1-10', 'sales', 1, null, 'Как реагирате на отказ при студено обаждане?', array['Приемате го спокойно, благодарите и записвате следваща стъпка — например след 3 месеца', 'Настоявате, докато се съгласи', 'Затваряте и изтривате контакта', 'Обаждате се пак след 10 минути'], 0, 'Отказът днес често е „не сега“. Записаната следваща стъпка превръща студения контакт в бъдещ клиент.'),
  ('sales-2-01', 'sales', 2, null, 'Какво е „котва“ в преговорите?', array['Първото споменато число, което влияе на очакванията на другата страна', 'Последната отстъпка преди сделката', 'Капарото по предварителния договор', 'Клаузата за неустойка'], 0, 'Котвата задава рамката на разговора. Добре обоснованата първа цена от ваша страна работи във ваша полза.'),
  ('sales-2-02', 'sales', 2, null, 'Купувачът предлага 10% под цената. Как предавате офертата на собственика?', array['Писмено, с аргументите на купувача и пазарните данни, без лична оценка, която я подкопава', 'Устно и набързо — „дават малко“', 'Не я предавате, защото е ниска', 'Като казвате, че купувачът не е сериозен'], 0, 'Предаването на всяка оферта е задължение на брокера. Професионалното представяне често води до насрещно предложение и сделка.'),
  ('sales-2-03', 'sales', 2, null, 'За какво служи техниката „разбирам — и други се чувстваха така — и откриха, че…“?', array['За работа с възражения: разбиране, пример и решение', 'За първото обаждане до нов клиент', 'За определяне на цената', 'За писане на обява'], 0, 'Тя показва на клиента, че е разбран и не е сам, а после дава доказателство, че има решение.'),
  ('sales-2-04', 'sales', 2, null, 'Защо е добре да предлагате два варианта за среща („вторник в 10 или сряда в 17?“)?', array['Улеснява решението и води директно към конкретна дата', 'Защото така изглеждате по-зает', 'Защото клиентът задължително трябва да избере вторник', 'Не е добре — клиентът трябва сам да предложи'], 0, 'Изборът между две конкретни възможности е по-лесен от отворения въпрос „кога ви е удобно?“.'),
  ('sales-2-05', 'sales', 2, null, 'Какво е съобщението „за раздяла“ след 6 месеца мълчание на клиента?', array['Учтиво затваряне на досието — често точно тогава клиентът отговаря', 'Грубо съобщение, че губи времето ви', 'Изтриване на клиента без съобщение', 'Реклама на нов имот'], 0, '„Приемам, че имотните въпроси не са приоритет. Затварям досието Ви, за да не досаждам.“ Учтивото затваряне често събужда интереса.'),
  ('sales-2-06', 'sales', 2, null, 'Кое е ключово при „Отворени врати“ (open house)?', array['Да регистрирате всеки посетител и да се свържете с него след това', 'Да има почерпка за всички', 'Да покажете имота за 5 минути', 'Да не каните съседите'], 0, 'Регистрацията (например с QR код на вратата) превръща посетителите в клиенти — купувачи на този или на друг имот.'),
  ('sales-2-07', 'sales', 2, null, 'Кое е най-силното доказателство на среща с продавач?', array['Реални резултати — продадени имоти в района, срокове и постигнати цени', 'Колко години сте в бранша', 'Колко имота имате обявени', 'Колко хубав е офисът ви'], 0, 'Продавачът иска да знае дали ще продадете неговия имот добре. Резултатите в неговия район го убеждават най-много.'),
  ('sales-2-08', 'sales', 2, null, 'Клиентът казва: „Не бързам.“ Какво правите?', array['Слагате го в лента B или C и го водите по план с полезна информация, без натиск', 'Изтривате го', 'Звъните му всеки ден', 'Казвате му, че ще изпусне всички имоти'], 0, 'Клиентът, който не бърза днес, ще купи или продаде утре — с брокера, който е бил полезен през цялото време.'),
  ('sales-2-09', 'sales', 2, null, 'Целта е 10 сделки годишно. За една сделка трябват 10 огледа, за един оглед — 8 обаждания. Колко обаждания годишно трябват?', array['800', '100', '80', '180'], 0, '10 сделки × 10 огледа = 100 огледа. 100 × 8 = 800 обаждания. Така работи планът в „Моят план“ — от целта към дневните действия.'),
  ('sales-2-10', 'sales', 2, null, 'Каква е разликата между характеристика и полза?', array['Характеристиката е какво има имотът, а ползата — какво печели купувачът от това', 'Няма разлика', 'Ползата е цената, а характеристиката — площта', 'Характеристиката е за продавача, а ползата — за брокера'], 0, '„Южно изложение“ е характеристика. „Слънце в дневната целия ден и по-ниска сметка за ток“ е полза.'),
  ('sales-3-01', 'sales', 3, null, 'Какво е BATNA в преговорите?', array['Най-добрата ви алтернатива, ако не се стигне до споразумение', 'Максималната отстъпка, която давате', 'Срокът на офертата', 'Клауза за неустойка в договора'], 0, 'Който знае своята BATNA (и тази на другата страна), преговаря спокойно и не приема лоша сделка от страх.'),
  ('sales-3-02', 'sales', 3, null, 'Страните са заседнали на разлика от 5 000 €. Кое е професионално решение?', array['Търсите стойност извън цената — срок за освобождаване, обзавеждане, начин на плащане', 'Предлагате да делите разликата от комисионната си, без да мислите', 'Прекратявате преговорите', 'Казвате на всяка страна, че другата е готова да отстъпи'], 0, 'Често страните ценят различни неща. Гъвкав срок или оставено обзавеждане струват повече на едната страна, отколкото на другата.'),
  ('sales-3-03', 'sales', 3, null, 'Как постъпвате при няколко оферти за един имот?', array['Уведомявате всички купувачи, че има няколко оферти, и искате най-добрата писмена оферта до срок', 'Казвате на всеки купувач точната оферта на другия', 'Приемате първата и не казвате на другите', 'Избирате купувача, който ви харесва'], 0, 'Прозрачният процес с краен срок е честен към всички и обикновено носи най-добрата цена за собственика.'),
  ('sales-3-04', 'sales', 3, null, 'Каква е ролята на мълчанието след като сте направили предложение?', array['Дава време на другата страна да отговори — често тя пръв прави отстъпка', 'Изглежда непрофесионално — трябва да говорите веднага', 'Показва, че не сте сигурни', 'Трябва веднага да предложите отстъпка'], 0, 'Който пръв наруши мълчанието, често отстъпва. Направете предложението и изчакайте.'),
  ('sales-3-05', 'sales', 3, null, 'Представлявате и купувача, и продавача (двустранна сделка). Кое е правилно?', array['Информирате двете страни писмено и сте честни и неутрални към двамата', 'Работите в интерес само на продавача', 'Не казвате на купувача, че представлявате и продавача', 'Двустранните сделки са забранени'], 0, 'Двустранната сделка е честа и законна, но изисква прозрачност и еднакво отношение към двете страни.'),
  ('sales-3-06', 'sales', 3, null, 'Как изчислявате „стойността на часа ви“ в BRIXA?', array['Комисионните за последните 12 месеца, разделени на работните часове', 'Комисионната от последната сделка, разделена на 8', 'Средната заплата в града', 'Годишната цел, разделена на 365'], 0, 'Като знаете колко струва часът ви, по-лесно решавате на какво да не губите време и какво да делегирате.'),
  ('sales-3-07', 'sales', 3, null, 'Клиент ви сравнява с брокер, който обещава по-висока цена за същия имот. Какво правите?', array['Показвате данните си и обяснявате, че обещаната цена не е реалната цена на пазара', 'Обещавате още по-висока цена', 'Казвате, че другият брокер лъже, без доказателства', 'Веднага се отказвате от имота'], 0, 'Обещанието за цена, без пазарни данни, е стара тактика. Данните и планът ви са по-силни от думите на конкурента.'),
  ('sales-3-08', 'sales', 3, null, 'Кой е най-добрият момент да поискате препоръка от клиент?', array['Когато е доволен — например след успешна сделка или решен проблем', 'Още на първата среща', 'Никога — препоръките идват сами', 'Когато имате нужда от сделки'], 0, 'Доволният клиент най-лесно препоръчва. Конкретният въпрос („Познавате ли някой, който мисли да продава?“) работи по-добре от общия.'),
  ('sales-3-09', 'sales', 3, null, 'Купувачът иска отстъпка след огледа, защото „банята е стара“. Как преговаряте?', array['Обсъждате реалната цена на ремонта спрямо цената на имота и какво вече е отчетено в нея', 'Веднага приемате исканата отстъпка', 'Казвате, че банята е нова', 'Отказвате всякакъв разговор'], 0, 'Възражението по състоянието е честно. Дайте му реална цифра и сравнение с пазара — така отстъпката става разумна или излишна.'),
  ('sales-3-10', 'sales', 3, null, 'Колко време след нов имот, който пасва на горещ купувач, е най-добре да му се обадите?', array['До 5 минути — „speed to lead“', 'До края на седмицата', 'След като имотът събере огледи', 'Само по имейл'], 0, 'При горещите купувачи бързината решава. BRIXA известява брокера веднага, когато нов имот пасне на купувача.'),
  ('market-1-01', 'market', 1, null, 'Апартамент струва 90 000 € и е 75 м². Каква е цената на кв. м?', array['1 200 €/м²', '1 125 €/м²', '1 500 €/м²', '6 750 €/м²'], 0, '90 000 ÷ 75 = 1 200 €/м².'),
  ('market-1-02', 'market', 1, null, 'Какво е „обща площ“ на апартамент в обявите?', array['Застроената площ плюс идеалните части от общите части на сградата', 'Само площта на стаите', 'Само площта на пода без стените', 'Площта на апартамента и мазето'], 0, 'Купувачите често сравняват различни площи. Уточнявайте коя е посочена — застроена, обща или полезна.'),
  ('market-1-03', 'market', 1, null, 'Кое е по-надеждно за пазарната цена — обявените или реално продадените цени?', array['Реално продадените цени', 'Обявените цени', 'Двете са еднакво надеждни', 'Данъчните оценки'], 0, 'Обявената цена е желание, продадената е факт. Регистърът на сключените сделки в BRIXA пази реалните цени.'),
  ('market-1-04', 'market', 1, null, 'Кой фактор влияе най-много на цената на апартамента?', array['Местоположението', 'Цветът на фасадата', 'Името на сградата', 'Марката на домофона'], 0, 'Ремонтът се прави наново, а локацията не може да се смени. Затова е най-важна.'),
  ('market-1-05', 'market', 1, null, 'Какво е изложение и защо е важно?', array['Посоката, към която гледат прозорците — влияе на светлината и на цената', 'Колко дълго имотът е бил на пазара', 'Изложбата на мебелите в имота', 'Разстоянието до спирката'], 0, 'Южно и източно изложение обикновено се ценят повече, а северно — по-малко. Зависи и от гледката.'),
  ('market-1-06', 'market', 1, null, 'Кой тип конструкция купувачите в България обикновено ценят най-много?', array['Тухла (монолитна стоманобетонна конструкция)', 'Панел', 'ЕПК', 'Гредоред'], 0, 'Тухлените сгради се възприемат като по-качествени и по-добре изолирани. При еднакви други условия цената им е по-висока.'),
  ('market-1-07', 'market', 1, null, 'Защо партерът (първият етаж) обикновено е по-евтин?', array['По-малко светлина и уединение, повече шум и риск от влага', 'Защото е по-малък', 'Защото там не може да има кухня', 'Защото данъкът е по-висок'], 0, 'Има изключения — партер с двор или подходящ за офис или магазин може да струва повече.'),
  ('market-1-08', 'market', 1, null, 'Защо имотите със завършена сграда (въведена в експлоатация) обикновено струват повече от тези „на зелено“?', array['Рискът е по-малък и купувачът може да се нанесе веднага', 'Защото са по-големи', 'Защото са с по-ниски данъци', 'Не струват повече'], 0, 'Купувачът „на зелено“ плаща по-малко срещу риска и чакането.'),
  ('market-1-09', 'market', 1, null, 'Какво е ЕПК?', array['Едроплощен кофраж — монолитни бетонни сгради, строени главно през 70-те и 80-те години', 'Екологичен пасивен клас', 'Енергиен паспорт на конструкцията', 'Еднофамилна къща с паркинг'], 0, 'ЕПК сградите са монолитни и здрави. Купувачите обикновено ги поставят между панела и тухлата.'),
  ('market-1-10', 'market', 1, null, 'Какво е пазар на купувача?', array['Предлагането е по-голямо от търсенето — купувачите имат избор и сила да пазаряват', 'Пазар, на който купуват само инвеститори', 'Пазар, на който цените винаги растат', 'Пазар, на който продават само строители'], 0, 'При пазар на продавача е обратното — малко имоти, много купувачи, бързи сделки.'),
  ('market-2-01', 'market', 2, null, 'Апартамент от 80 м² се продава за 140 000 €, с включено паркомясто за 12 000 €. Каква е цената на кв. м без паркомястото?', array['1 600 €/м²', '1 750 €/м²', '1 900 €/м²', '1 450 €/м²'], 0, '(140 000 − 12 000) ÷ 80 = 1 600 €/м². Сравнявайте апартаментите без паркоместата.'),
  ('market-2-02', 'market', 2, null, 'Имот за 100 000 € се отдава за 500 € на месец. Каква е брутната доходност?', array['6%', '5%', '0,5%', '12%'], 0, 'Годишен наем 6 000 € ÷ 100 000 € = 6%.'),
  ('market-2-03', 'market', 2, null, 'Какво показва „времето на пазара“?', array['Дните от обявяването до сделката — показва дали цената е пазарна', 'Колко часа е отворен офисът', 'Колко време купувачът търси', 'Колко време трае нотариалната сделка'], 0, 'Дълго време на пазара обикновено значи висока цена или слабо представяне.'),
  ('market-2-04', 'market', 2, null, 'Имоти в квартала се продават средно за 95% от обявената цена. Какво значи това?', array['Продавачите отстъпват средно 5% от обявената цена', 'Цените растат с 5%', 'Купувачите плащат 5% комисионна', '5% от имотите се продават'], 0, 'Съотношението продадена/обявена цена показва колко място за пазарене реално има.'),
  ('market-2-05', 'market', 2, null, 'Колко сравними имота са добра основа за пазарен анализ?', array['Поне 3–5 сходни имота от района, продадени наскоро', 'Един — най-близкият', 'Всички имоти в града', 'Само обявите от последния ден'], 0, 'С няколко сравними сделки виждате диапазона и избягвате изкривяване от един необичаен случай.'),
  ('market-2-06', 'market', 2, null, 'Кои корекции правите, когато сравнявате имоти?', array['Етаж, състояние, изложение, площ, година и вид на строителството', 'Само цвета на стените', 'Само името на агенцията', 'Само цената на мебелите'], 0, 'Нито два имота не са еднакви. Корекциите правят сравнението честно.'),
  ('market-2-07', 'market', 2, null, 'Каква е разликата между застроена и полезна площ?', array['Застроената включва стените, а полезната е площта на пода в помещенията', 'Няма разлика', 'Полезната включва терасите и мазето', 'Застроената е само площта на стаите'], 0, 'Полезната площ обикновено е с около 10–20% по-малка от застроената. Купувачите от чужбина често мерят полезната.'),
  ('market-2-08', 'market', 2, null, 'Как ремонт за 20 000 € влияе на стойността на имота?', array['Не непременно я вдига с 20 000 € — зависи от пазара, от качеството и от вкуса на купувачите', 'Винаги я вдига с 20 000 €', 'Винаги я вдига двойно', 'Не влияе изобщо'], 0, 'Ремонтът рядко се връща изцяло. Освежаването често носи повече от скъпия ремонт по личен вкус.'),
  ('market-2-09', 'market', 2, null, 'Защо имотите около нова метростанция или голям нов път поскъпват по-бързо?', array['По-лесният достъп увеличава търсенето — особено при наемите', 'Защото данъците там падат', 'Защото строителите вдигат цените по закон', 'Не поскъпват'], 0, 'Инфраструктурата променя квартала. Следете плановете на общината — те подсказват бъдещото търсене.'),
  ('market-2-10', 'market', 2, null, 'Какво е медиана на цените и защо е полезна?', array['Средната стойност в подредения списък — не се влияе от единични много скъпи или много евтини имоти', 'Сборът от всички цени', 'Най-високата цена в квартала', 'Средноаритметичната стойност'], 0, 'При малко сделки един луксозен имот може да изкриви средната цена. Медианата е по-устойчива.'),
  ('market-3-01', 'market', 3, null, 'Имот за 120 000 €, наем 650 € на месец, годишни разходи (данък, ремонти, празни месеци) 1 300 €. Каква е нетната доходност?', array['≈ 5,4%', '6,5%', '≈ 4,3%', '7,8%'], 0, 'Годишен наем: 7 800 €. Нето: 7 800 − 1 300 = 6 500 €. 6 500 ÷ 120 000 ≈ 5,4%.'),
  ('market-3-02', 'market', 3, null, 'Наем 700 € на месец, инвеститорът иска 6% доходност. Каква е стойността по метода на дохода?', array['140 000 €', '116 667 €', '84 000 €', '42 000 €'], 0, 'Годишен наем: 8 400 €. 8 400 ÷ 0,06 = 140 000 €.'),
  ('market-3-03', 'market', 3, null, 'В квартала има 120 активни обяви и се продават по 20 имота на месец. Колко месеца е предлагането?', array['6 месеца', '2 месеца', '20 месеца', '12 месеца'], 0, '120 ÷ 20 = 6 месеца. По-малко месеци значи пазар на продавача, повече — пазар на купувача.'),
  ('market-3-04', 'market', 3, null, 'Пет сравними сделки са на 1 500, 1 550, 1 600, 1 650 и 2 400 €/м². Коя е разумната база за анализа?', array['≈ 1 600 €/м² — медианата; 2 400 е изключение', '1 740 €/м² — средното', '2 400 €/м² — най-високата', '1 500 €/м² — най-ниската'], 0, 'Средното (1 740) е изкривено от една сделка. Медианата (1 600) показва типичната цена. Проверете защо сделката за 2 400 е различна.'),
  ('market-3-05', 'market', 3, null, 'Двустаен 65 м² в квартал със средно 1 800 €/м², но на последен етаж без асансьор и с минал теч. Как подхождате?', array['Започвате от средната цена и коригирате надолу за етажа, асансьора и риска от теч', 'Обявявате го на средната цена', 'Обявявате го над средната, защото е с гледка', 'Не правите корекции — пазарът ще реши'], 0, 'Средната цена е отправна точка. Всяка особеност на имота се отразява с корекция — нагоре или надолу.'),
  ('market-3-06', 'market', 3, null, 'Цените в квартала са се вдигнали с 8% за година, а наемите — с 3%. Какво става с доходността от наем?', array['Пада — цената расте по-бързо от наема', 'Расте', 'Не се променя', 'Става отрицателна'], 0, 'Доходността е наем ÷ цена. Когато цената расте по-бързо, доходността намалява.'),
  ('market-3-07', 'market', 3, null, 'Апартамент от 70 м² се продава за 126 000 €, а данъчната му оценка е 45 000 €. Върху коя сума е данъкът при придобиване?', array['Върху 126 000 € — по-високата от двете', 'Върху 45 000 € — данъчната оценка', 'Върху средното от двете', 'Върху 70% от цената'], 0, 'Основата е по-високата от договорената цена и данъчната оценка.'),
  ('market-3-08', 'market', 3, null, 'Защо при анализ се гледат и изтеглените от пазара имоти?', array['Те показват цените, на които пазарът е отказал да купи', 'Защото те са най-евтините', 'Не се гледат — не са продадени', 'Защото са с най-добрите снимки'], 0, 'Изтеглените обяви са пазарът, който казва „не“ на дадена цена. Това е полезен аргумент пред амбициозен собственик.'),
  ('market-3-09', 'market', 3, null, 'Цената на сравним имот, продаден преди година, е 1 500 €/м². Цените в квартала са се вдигнали с 6%. Каква е днешната сравнима цена?', array['1 590 €/м²', '1 506 €/м²', '1 600 €/м²', '1 410 €/м²'], 0, '1 500 × 1,06 = 1 590 €/м². По-старите сделки се коригират с времето.'),
  ('market-3-10', 'market', 3, null, 'Инвеститор купува за 100 000 € с 30 000 € собствени пари и кредит, наемът покрива вноската, а имотът поскъпва с 5% за година. Каква е приблизителната възвръщаемост на собствените му пари само от поскъпването?', array['≈ 16,7%', '5%', '30%', '≈ 3,3%'], 0, 'Поскъпване: 5 000 €. 5 000 ÷ 30 000 ≈ 16,7%. Това е ефектът на кредита (лостът) — който работи и в обратната посока.'),
  ('city-varna-1-01', 'city', 1, 'Варна', 'Колко административни района има Варна?', array['5', '3', '7', '24'], 0, 'Районите са Одесос, Приморски, Младост, Владислав Варненчик и Аспарухово.'),
  ('city-varna-1-02', 'city', 1, 'Варна', 'Кой район на Варна обхваща центъра на града?', array['Одесос', 'Приморски', 'Младост', 'Аспарухово'], 0, 'Одесос е централният район — с центъра, Гръцка махала и пристанището.'),
  ('city-varna-1-03', 'city', 1, 'Варна', 'Кой мост свързва центъра на Варна с квартал Аспарухово?', array['Аспаруховият мост', 'Дунав мост', 'Мостът при Чайка', 'Галатският мост'], 0, 'Аспаруховият мост минава над канала между морето и Варненското езеро.'),
  ('city-varna-1-04', 'city', 1, 'Варна', 'Кой курортен комплекс е част от град Варна, на север?', array['Златни пясъци', 'Слънчев бряг', 'Албена', 'Обзор'], 0, 'Златни пясъци е в община Варна (район Приморски). Албена е в община Балчик, а Слънчев бряг — в община Несебър.'),
  ('city-varna-1-05', 'city', 1, 'Варна', 'Как се казва големият парк край морето в центъра на Варна?', array['Морската градина', 'Борисовата градина', 'Цар-Симеоновата градина', 'Южен парк'], 0, 'Морската градина е символът на Варна. Борисовата градина е в София, Цар-Симеоновата — в Пловдив.'),
  ('city-varna-1-06', 'city', 1, 'Варна', 'Как се казва старият квартал край Римските терми, близо до пристанището?', array['Гръцка махала', 'Капана', 'Старият град', 'Лозенец'], 0, 'Гръцка махала е историческата част на Варна. Капана и Старият град са в Пловдив.'),
  ('city-varna-1-07', 'city', 1, 'Варна', 'Кое езеро е на запад от Варна, свързано с морето чрез канал?', array['Варненското езеро', 'Атанасовското езеро', 'Мандренското езеро', 'Вая'], 0, 'Варненското езеро е свързано с морето с канал, над който минава Аспаруховият мост. Атанасовско, Мандренско и Вая са край Бургас.'),
  ('city-varna-2-01', 'city', 2, 'Варна', 'В кой район на Варна са к.к. „Св. Св. Константин и Елена“ и „Златни пясъци“?', array['Приморски', 'Одесос', 'Младост', 'Владислав Варненчик'], 0, 'Район Приморски обхваща северната част на града край морето — с кварталите и курортите там.'),
  ('city-varna-2-02', 'city', 2, 'Варна', 'Кой квартал на Варна е на южния бряг, след Аспарухово, и е известен с вилите и гледката към залива?', array['Галата', 'Виница', 'Изгрев', 'Бриз'], 0, 'Галата е на южния бряг на Варненския залив. Виница и Бриз са на север.'),
  ('city-varna-2-03', 'city', 2, 'Варна', 'Какво е Евксиноград?', array['Бивша царска резиденция на север от Варна, между Бриз и к.к. „Св. Св. Константин и Елена“', 'Нов жилищен комплекс в Аспарухово', 'Индустриална зона край езерото', 'Плаж в центъра на града'], 0, 'Евксиноград е дворец и парк край морето. Околните квартали са сред най-търсените за луксозни имоти.'),
  ('city-varna-2-04', 'city', 2, 'Варна', 'Виница е:', array['Бивше село, днес квартал на Варна на север, с много къщи и ново строителство', 'Квартал в центъра до катедралата', 'Курорт южно от Аспарухово', 'Индустриална зона край летището'], 0, 'Виница е част от район Приморски. Търси се от купувачи на къщи и апартаменти близо до морето.'),
  ('city-varna-2-05', 'city', 2, 'Варна', 'В кой район на Варна са кварталите Аспарухово и Галата?', array['Аспарухово', 'Одесос', 'Младост', 'Приморски'], 0, 'Южната част на Варна, след Аспаруховия мост, е район Аспарухово.'),
  ('city-sofia-1-01', 'city', 1, 'София', 'Колко административни района има Столична община?', array['24', '5', '12', '31'], 0, 'София е разделена на 24 района — от Средец и Лозенец до Панчарево и Нови Искър.'),
  ('city-sofia-1-02', 'city', 1, 'София', 'Коя планина е южно от София и прави търсени кварталите в подножието ѝ (Бояна, Драгалевци, Симеоново)?', array['Витоша', 'Рила', 'Люлин', 'Стара планина'], 0, 'Близостта до Витоша и гледката към планината вдигат цените в южните квартали.'),
  ('city-sofia-1-03', 'city', 1, 'София', 'Кой голям парк е в центъра на София?', array['Борисовата градина', 'Морската градина', 'Цар-Симеоновата градина', 'Парк „Росенец“'], 0, 'Борисовата градина е най-големият парк в центъра. Кварталите около нея (Лозенец, Изток) са сред най-скъпите.'),
  ('city-sofia-1-04', 'city', 1, 'София', 'Кой голям жилищен комплекс е в западната част на София?', array['Люлин', 'Младост', 'Дружба', 'Дианабад'], 0, 'Люлин е в западната част на града, а Младост, Дружба и Дианабад — в източната и югоизточната.'),
  ('city-sofia-1-05', 'city', 1, 'София', 'Коя линия на метрото стига до Летище София?', array['М4', 'М1', 'М2', 'М3'], 0, 'Линия М4 свързва Обеля с Летище София през Младост и Дружба.'),
  ('city-sofia-1-06', 'city', 1, 'София', 'Кой престижен квартал е южно от центъра, близо до НДК и Южния парк?', array['Лозенец', 'Надежда', 'Люлин', 'Красна поляна'], 0, 'Лозенец е сред най-търсените квартали — близо до центъра, парковете и с много ново строителство.'),
  ('city-sofia-2-01', 'city', 2, 'София', 'Кой булевард свързва центъра на София с летището, Младост и Дружба?', array['Цариградско шосе', 'Булевард „България“', 'Булевард „Сливница“', 'Булевард „Тодор Александров“'], 0, 'Цариградско шосе е главната ос на изток — с бизнес сгради, търговски центрове и жилищни комплекси.'),
  ('city-sofia-2-02', 'city', 2, 'София', 'Кой квартал в подножието на Витоша е известен с къщите и с Боянската църква?', array['Бояна', 'Овча купел', 'Подуяне', 'Връбница'], 0, 'Бояна е сред най-скъпите квартали за къщи в София.'),
  ('city-sofia-2-03', 'city', 2, 'София', 'Какво е „Манастирски ливади“?', array['Квартал в югозападна София с много ново строителство', 'Манастир в Рила', 'Парк в центъра на София', 'Курортно селище край Витоша'], 0, 'Манастирски ливади се разви бързо с новото строителство между бул. „България“ и Овча купел.'),
  ('city-plovdiv-1-01', 'city', 1, 'Пловдив', 'Как се казва историческият квартал на Пловдив върху хълмовете?', array['Старият град', 'Гръцка махала', 'Капана', 'Кършияка'], 0, 'Старият град е архитектурен резерват — имотите там имат специални режими за строеж и ремонт.'),
  ('city-plovdiv-1-02', 'city', 1, 'Пловдив', 'Кой квартал в центъра на Пловдив е известен като творческия квартал с малки улички?', array['Капана', 'Тракия', 'Смирненски', 'Остромила'], 0, 'Капана е популярен за заведения, ателиета и наеми в центъра.'),
  ('city-plovdiv-1-03', 'city', 1, 'Пловдив', 'Коя река минава през Пловдив?', array['Марица', 'Искър', 'Янтра', 'Струма'], 0, 'Марица разделя Пловдив на север (Кършияка) и юг.'),
  ('city-plovdiv-1-04', 'city', 1, 'Пловдив', 'Колко административни района има Пловдив?', array['6', '3', '5', '24'], 0, 'Районите са Централен, Източен, Западен, Северен, Южен и Тракия.'),
  ('city-plovdiv-2-01', 'city', 2, 'Пловдив', 'Кой голям жилищен комплекс е в източната част на Пловдив и е отделен район?', array['Тракия', 'Кючук Париж', 'Мараша', 'Капана'], 0, 'Тракия е най-големият жилищен комплекс в Пловдив — с много панелни блокове и ново строителство.'),
  ('city-plovdiv-2-02', 'city', 2, 'Пловдив', 'На кой бряг на Марица е Кършияка?', array['На северния', 'На южния', 'На двата', 'Кършияка е в Тракия'], 0, 'Кършияка е в район Северен — на северния бряг на реката.'),
  ('city-burgas-1-01', 'city', 1, 'Бургас', 'Кой квартал на Бургас е край летището, на север?', array['Сарафово', 'Крайморие', 'Меден рудник', 'Лазур'], 0, 'Сарафово е до летище Бургас и до морето. Крайморие е на юг.'),
  ('city-burgas-1-02', 'city', 1, 'Бургас', 'Кои езера са около Бургас?', array['Вая (Бургаското), Атанасовското и Мандренското', 'Варненското и Белославското', 'Сребърна и Шабла', 'Панчаревското и Искър'], 0, 'Бургас е заобиколен от три езера. Варненското и Белославското са край Варна.'),
  ('city-burgas-1-03', 'city', 1, 'Бургас', 'Как се казва паркът край морето в Бургас?', array['Морската градина', 'Борисовата градина', 'Южен парк', 'Цар-Симеоновата градина'], 0, 'И Бургас, и Варна имат Морска градина. Кварталите до нея се ценят повече.'),
  ('city-burgas-2-01', 'city', 2, 'Бургас', 'Кой квартал на Бургас е между центъра и Морската градина, близо до морето?', array['Лазур', 'Меден рудник', 'Ветрен', 'Банево'], 0, 'Лазур е сред търсените квартали заради близостта до центъра и морето.'),
  ('city-burgas-2-02', 'city', 2, 'Бургас', 'Кое селище на юг е част от община Бургас и е известно с вилите край морето?', array['Крайморие', 'Сарафово', 'Ветрен', 'Равнец'], 0, 'Крайморие е на юг от града, а Сарафово — на север, до летището.')
on conflict (code) do nothing;

-- =====================================================================
-- BRIXA — migration 072: why a listing leaves the market
--   "Delete" on a listing now asks what happened: sold by us, sold by
--   another agency, or taken off the market. The listing moves to
--   "Sold" / "Withdrawn" and keeps the price and the day it was sold for
--   (when the broker knows them). The market's figures count those sales
--   too — another agency's included.
-- Run once in Supabase → SQL Editor → New query → Run (after 071).
-- =====================================================================

alter table public.properties
  add column if not exists sold_price numeric(14, 2) check (sold_price is null or sold_price >= 0),
  add column if not exists sold_on date;

comment on column public.properties.sold_price is 'the price it was sold (or rented) for, in the listing''s currency — told when it left the market';
comment on column public.properties.sold_on is 'the day it was sold (or rented)';

-- The agency's listings around one listing: a sale counts with its own sold price too.
create or replace function public.market_pool(target_property uuid)
returns table (
  property_id uuid,
  same_neighborhood boolean,
  area numeric,
  status text,
  listed_on date,
  price_eur numeric,
  sold_eur numeric,
  sold_on date,
  from_deal boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select p.*, s.code as sub_code,
      s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier']) as is_apartment
    from public.properties p
    join public.property_subtypes s on s.id = p.subtype_id
    where p.id = target_property
  )
  select c.id,
    c.neighborhood_id is not distinct from t.neighborhood_id and t.neighborhood_id is not null,
    c.area,
    c.status,
    (c.created_at at time zone 'Europe/Sofia')::date,
    public.to_eur(c.current_price, c.currency),
    coalesce(public.to_eur(w.price, w.currency),
             case when c.status in ('sold', 'rented', 'sold_elsewhere') then public.to_eur(c.sold_price, c.currency) end,
             case when c.status in ('sold', 'rented') then public.to_eur(c.current_price, c.currency) end),
    coalesce(w.closed_on,
             case when c.status in ('sold', 'rented', 'sold_elsewhere') then c.sold_on end,
             case when c.status in ('sold', 'rented') then (c.updated_at at time zone 'Europe/Sofia')::date end),
    w.price is not null
  from target t
  join public.properties c
    on c.organization_id = t.organization_id
   and c.id <> t.id
   and c.operation_type = t.operation_type
   and c.settlement_id = t.settlement_id
  join public.property_subtypes cs on cs.id = c.subtype_id
  left join lateral (
    select d.price, d.currency, d.closed_on
    from public.deals d
    where d.property_id = c.id and d.status = 'won' and d.price is not null
    order by d.closed_on desc
    limit 1
  ) w on true
  where c.area > 0
    and (case when t.is_apartment
         then cs.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier'])
         else c.subtype_id = t.subtype_id end)
    and (t.area is null or c.area between t.area * 0.7 and t.area * 1.3);
$$;


-- The Market page: the same.
create or replace function public.market_overview(target_org uuid, target_operation text default 'sale')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with apt as (
    select c.id, c.title, c.settlement_id, c.neighborhood_id, c.area, c.status, c.responsible_broker_id,
      public.to_eur(c.current_price, c.currency) as price_eur,
      coalesce(public.to_eur(w.price, w.currency),
               case when c.status in ('sold', 'rented', 'sold_elsewhere') then public.to_eur(c.sold_price, c.currency) end,
               case when c.status in ('sold', 'rented') then public.to_eur(c.current_price, c.currency) end) as sold_eur,
      coalesce(w.closed_on,
               case when c.status in ('sold', 'rented', 'sold_elsewhere') then c.sold_on end,
               case when c.status in ('sold', 'rented') then (c.updated_at at time zone 'Europe/Sofia')::date end) as sold_on,
      (c.created_at at time zone 'Europe/Sofia')::date as listed_on
    from public.properties c
    join public.property_subtypes s on s.id = c.subtype_id
    left join lateral (
      select d.price, d.currency, d.closed_on from public.deals d
      where d.property_id = c.id and d.status = 'won' and d.price is not null
      order by d.closed_on desc limit 1
    ) w on true
    where c.organization_id = target_org
      and c.operation_type = target_operation
      and c.settlement_id is not null
      and c.area > 0
      and s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier'])
  ),
  registered as (
    select cd.settlement_id, cd.neighborhood_id, cd.area, cd.price as sold_eur, cd.reported_on as sold_on, null::date as listed_on
    from public.closed_deals cd
    join public.property_subtypes s on s.id = cd.subtype_id
    where cd.organization_id = target_org
      and target_operation = 'sale'
      and cd.settlement_id is not null
      and s.code = any (array['studio', 'two_room', 'three_room', 'four_room', 'multi_room', 'maisonette', 'atelier'])
  ),
  sold as (
    select a.settlement_id, a.neighborhood_id, a.area, a.sold_eur, a.sold_on, a.listed_on
    from apt a
    where a.sold_eur > 0 and not exists (select 1 from public.closed_deals cd where cd.property_id = a.id)
    union all
    select * from registered
  ),
  places as (
    select settlement_id, neighborhood_id from apt
    union
    select settlement_id, neighborhood_id from registered
    union
    select settlement_id, neighborhood_id from public.market_prices
    where organization_id = target_org and operation = target_operation
  ),
  rows as (
    select pl.settlement_id, pl.neighborhood_id,
      gs.settlement_type || ' ' || gs.name as town,
      gn.name as neighborhood,
      m.price_per_sqm as ref_sqm, m.source, m.as_of,
      (select count(*) from apt a where a.settlement_id = pl.settlement_id
         and a.neighborhood_id is not distinct from pl.neighborhood_id
         and a.status in ('active', 'reserved') and a.price_eur > 0) as active_count,
      (select round(percentile_cont(0.5) within group (order by a.price_eur / a.area)::numeric, 2) from apt a
         where a.settlement_id = pl.settlement_id and a.neighborhood_id is not distinct from pl.neighborhood_id
           and a.status in ('active', 'reserved') and a.price_eur > 0) as active_sqm,
      (select count(*) from sold a where a.settlement_id = pl.settlement_id
         and a.neighborhood_id is not distinct from pl.neighborhood_id
         and a.sold_on >= public.sofia_today() - 365) as sold_count,
      (select round(percentile_cont(0.5) within group (order by a.sold_eur / a.area)::numeric, 2) from sold a
         where a.settlement_id = pl.settlement_id and a.neighborhood_id is not distinct from pl.neighborhood_id
           and a.sold_on >= public.sofia_today() - 365) as sold_sqm,
      (select round(avg(a.sold_on - a.listed_on)) from sold a
         where a.settlement_id = pl.settlement_id and a.neighborhood_id is not distinct from pl.neighborhood_id
           and a.sold_on >= public.sofia_today() - 365 and a.sold_on >= a.listed_on) as sold_days
    from places pl
    join public.geo_settlements gs on gs.id = pl.settlement_id
    left join public.geo_neighborhoods gn on gn.id = pl.neighborhood_id
    left join public.market_prices m
      on m.organization_id = target_org and m.operation = target_operation
     and m.settlement_id = pl.settlement_id and m.neighborhood_id is not distinct from pl.neighborhood_id
  ),
  -- each active listing against the neighborhood's reference (else the town's)
  priced as (
    select a.id, a.title, a.area, a.price_eur, a.responsible_broker_id,
      gn.name as neighborhood,
      round(a.price_eur / a.area, 2) as own_sqm,
      coalesce(
        (select m.price_per_sqm from public.market_prices m
          where m.organization_id = target_org and m.operation = target_operation
            and m.settlement_id = a.settlement_id and m.neighborhood_id = a.neighborhood_id),
        (select m.price_per_sqm from public.market_prices m
          where m.organization_id = target_org and m.operation = target_operation
            and m.settlement_id = a.settlement_id and m.neighborhood_id is null)
      ) as bench
    from apt a
    left join public.geo_neighborhoods gn on gn.id = a.neighborhood_id
    where a.status in ('active', 'reserved') and a.price_eur > 0
  )
  select jsonb_build_object(
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object(
          'settlement_id', r.settlement_id, 'neighborhood_id', r.neighborhood_id,
          'town', r.town, 'neighborhood', r.neighborhood,
          'ref_sqm', r.ref_sqm, 'source', r.source, 'as_of', r.as_of,
          'active_count', r.active_count, 'active_sqm', r.active_sqm,
          'sold_count', r.sold_count, 'sold_sqm', r.sold_sqm, 'sold_days', r.sold_days)
        order by r.town, r.neighborhood nulls first)
      from rows r
      where public.is_org_member(target_org)), '[]'::jsonb),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', x.id, 'title', x.title, 'neighborhood', x.neighborhood,
          'broker', public.person_name(x.responsible_broker_id),
          'own_sqm', x.own_sqm, 'bench', x.bench, 'diff', round(x.own_sqm / x.bench - 1, 4))
        order by abs(x.own_sqm / x.bench - 1) desc)
      from priced x
      where x.bench > 0 and abs(x.own_sqm / x.bench - 1) >= 0.05
        and public.is_org_member(target_org)), '[]'::jsonb)
  );
$$;

-- =====================================================================
-- BRIXA — migration 074: video, a place on the map, and who looked
--   • a listing has up to 5 video links (YouTube, TikTok, Instagram,
--     Facebook, Vimeo) and one short video file of its own (up to 50 MB);
--   • the broker puts the listing's point on the map. Clients and other
--     agencies see a circle of about 500 m around it — the exact point only
--     when the contract is exclusive (the agency sees it always);
--   • the agency's website counts its visits too (how long, how many photos,
--     the video), next to the openings of the links sent; a played video is
--     counted on the links as well.
-- Run once in Supabase → SQL Editor → New query → Run (after 072 and 073).
-- =====================================================================

alter table public.properties
  add column if not exists video_links text[] not null default '{}'
    check (cardinality(video_links) <= 5 and pg_column_size(video_links) < 4000),
  add column if not exists video_path text check (video_path is null or char_length(video_path) <= 300),
  add column if not exists lat double precision check (lat is null or lat between -90 and 90),
  add column if not exists lng double precision check (lng is null or lng between -180 and 180),
  -- where the circle shown to outsiders is moved from the real point (random, never shown)
  add column if not exists spot_seed integer not null default floor(random() * 2000000000)::int;

comment on column public.properties.video_links is 'links to the listing''s videos on YouTube, TikTok, Instagram, Facebook, Vimeo';
comment on column public.properties.video_path is 'the listing''s own short video, in the property-videos bucket';
comment on column public.properties.lat is 'the listing''s point on the map (outsiders see a circle unless the contract is exclusive)';

-- ---------------------------------------------------------------------
-- The videos' files: like the photos — the agency sees them, the broker
-- of the listing (and the managers) add and remove them, and a shared
-- listing's page or the website shows them.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-videos', 'property-videos', false, 52428800,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-m4v'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "property videos: read" on storage.objects;
drop policy if exists "property videos: upload" on storage.objects;
drop policy if exists "property videos: delete" on storage.objects;
drop policy if exists "property videos: shared" on storage.objects;

create policy "property videos: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'property-videos' and public.can_view_photo_path(name));
create policy "property videos: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-videos' and public.can_edit_photo_path(name));
create policy "property videos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-videos' and public.can_edit_photo_path(name));
create policy "property videos: shared" on storage.objects
  for select to anon
  using (bucket_id = 'property-videos' and public.photo_is_shared(name));

-- ---------------------------------------------------------------------
-- What a public page gets: the videos, and the place — the exact point for
-- an exclusive listing, else a circle of 500 m whose centre is moved
-- 120–320 m from the real point (so the point is inside, but can't be found).
-- ---------------------------------------------------------------------
create or replace function public.listing_media(target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'videos', to_jsonb(p.video_links),
    'video', p.video_path,
    'spot', case
      when p.lat is null or p.lng is null then null
      when p.exclusive_contract then jsonb_build_object('lat', p.lat, 'lng', p.lng, 'exact', true)
      else (
        select jsonb_build_object(
          'lat', round((p.lat + o.d * cos(o.a) / 111320)::numeric, 5),
          'lng', round((p.lng + o.d * sin(o.a) / (111320 * cos(radians(p.lat))))::numeric, 5),
          'radius', 500,
          'exact', false)
        from (select radians(abs(p.spot_seed) % 360) as a, 120 + (abs(p.spot_seed) / 360) % 200 as d) o
      )
    end
  )
  from public.properties p
  where p.id = target_property;
$$;

revoke execute on function public.listing_media(uuid) from public, anon, authenticated;

create or replace function public.shared_property(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'operation', p.operation_type,
      'status', p.status,
      'price', p.current_price,
      'currency', p.currency,
      'area', p.area,
      'rooms', p.rooms,
      'bedrooms', p.bedrooms,
      'floor', p.floor,
      'total_floors', p.total_floors,
      'construction', p.construction_type,
      'condition', p.condition,
      'furnishing', p.furnishing,
      'heating', p.heating,
      'exposures', p.exposures,
      'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((
        select jsonb_agg(ph.storage_path order by ph.position)
        from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb),
      -- for a listing for sale: the rent the broker expects, or BRIXA's estimate from the agency's market
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end,
      -- the stars against the market, only when the price is good
      -- the video and the place on the map (074)
      'media', public.listing_media(p.id),
      'rating', public.public_rating(p.id)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
      from public.profiles pr where pr.id = coalesce(sh.created_by, p.responsible_broker_id)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  )
  from public.property_shares sh
  join public.properties p on p.id = sh.property_id
  where sh.token = share_token and sh.revoked_at is null;
$$;


create or replace function public.site_listing(site text, target_property uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'property', jsonb_build_object(
      'id', p.id, 'title', p.title, 'operation', p.operation_type, 'status', p.status,
      'price', p.current_price, 'currency', p.currency, 'area', p.area, 'rooms', p.rooms, 'bedrooms', p.bedrooms,
      'floor', p.floor, 'total_floors', p.total_floors, 'construction', p.construction_type, 'condition', p.condition,
      'furnishing', p.furnishing, 'heating', p.heating, 'exposures', p.exposures, 'description', p.description,
      'subtype', (select jsonb_build_object('name', st.name, 'name_en', st.name_en) from public.property_subtypes st where st.id = p.subtype_id),
      'settlement', (select s.settlement_type || ' ' || s.name from public.geo_settlements s where s.id = p.settlement_id),
      'neighborhood', (select n.name from public.geo_neighborhoods n where n.id = p.neighborhood_id),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object('name', f.name, 'name_en', f.name_en) order by f.name)
        from public.property_feature_values fv join public.property_features f on f.id = fv.feature_id
        where fv.property_id = p.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position) from public.property_photos ph where ph.property_id = p.id), '[]'::jsonb),
      -- for a listing for sale: the rent the broker expects, or BRIXA's estimate from the agency's market
      'expected_rent', case when p.operation_type = 'sale' then p.expected_rent end,
      'rent_estimate', case when p.operation_type = 'sale' then public.rent_estimate(p.id) end,
      -- the video and the place on the map (074)
      'media', public.listing_media(p.id),
      'rating', public.public_rating(p.id)
    ),
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
      from public.profiles pr where pr.id = p.responsible_broker_id
    ),
    'agency', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
  )
  from public.properties p
  join public.organizations o on o.id = p.organization_id
  where o.site_slug = lower(site) and o.site_enabled and p.id = target_property
    and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
    and not p.off_market and not p.sample;
$$;


-- ---------------------------------------------------------------------
-- A played video counts on a shared link's opening too.
-- ---------------------------------------------------------------------
alter table public.share_events add column if not exists video boolean not null default false;

create or replace function public.share_event_time(share_token uuid, event_id uuid, seen_seconds int, seen_photos int, watched_video boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  update public.share_events e
  set seconds = greatest(e.seconds, least(greatest(coalesce(seen_seconds, 0), 0), 3600)),
      photos = greatest(e.photos, least(greatest(coalesce(seen_photos, 0), 0), 200)),
      video = e.video or coalesce(watched_video, false)
  from public.property_shares s
  where e.id = event_id and e.kind = 'open' and s.id = e.share_id and s.token = share_token
    and e.occurred_at > now() - interval '6 hours'
  returning e.client_id into target;
  if target is not null then
    perform public.refresh_client_temperature(target);
  end if;
end;
$$;

grant execute on function public.share_event_time(uuid, uuid, int, int, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------
-- The website's visits of a listing: one per visitor (a random id kept by
-- the browser) in 12 hours — how long, how many photos, the video.
-- ---------------------------------------------------------------------
create table if not exists public.site_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  visitor uuid not null,
  seconds int not null default 0 check (seconds between 0 and 3600),
  photos int not null default 0 check (photos between 0 and 200),
  video boolean not null default false,
  occurred_at timestamptz not null default now()
);

create index if not exists site_views_property_idx on public.site_views (property_id, occurred_at desc);
create index if not exists site_views_org_idx on public.site_views (organization_id, occurred_at desc);

alter table public.site_views enable row level security;

drop policy if exists "site views: read" on public.site_views;
create policy "site views: read" on public.site_views
  for select to authenticated using (public.is_org_member(organization_id));

create or replace function public.record_site_view(site text, target_property uuid, visitor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  listing record;
  found uuid;
  recent int;
begin
  if visitor_id is null then
    return null;
  end if;
  select p.id, p.organization_id into listing
  from public.properties p
  join public.organizations o on o.id = p.organization_id
  where o.site_slug = lower(site) and o.site_enabled and p.id = target_property
    and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
    and not p.off_market and not p.sample;
  if listing.id is null then
    return null;
  end if;
  -- the same visitor within 12 hours is the same visit
  select v.id into found
  from public.site_views v
  where v.property_id = listing.id and v.visitor = visitor_id and v.occurred_at > now() - interval '12 hours'
  order by v.occurred_at desc
  limit 1;
  if found is not null then
    return found;
  end if;
  -- a flood is ignored
  select count(*) into recent from public.site_views where property_id = listing.id and occurred_at > now() - interval '1 hour';
  if recent >= 200 then
    return null;
  end if;
  insert into public.site_views (organization_id, property_id, visitor)
  values (listing.organization_id, listing.id, visitor_id)
  returning id into found;
  return found;
end;
$$;

create or replace function public.site_view_time(view_id uuid, visitor_id uuid, seen_seconds int, seen_photos int, watched_video boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.site_views v
  set seconds = greatest(v.seconds, least(greatest(coalesce(seen_seconds, 0), 0), 3600)),
      photos = greatest(v.photos, least(greatest(coalesce(seen_photos, 0), 0), 200)),
      video = v.video or coalesce(watched_video, false)
  where v.id = view_id and v.visitor = visitor_id and v.occurred_at > now() - interval '12 hours';
$$;

grant execute on function public.record_site_view(text, uuid, uuid) to anon, authenticated;
grant execute on function public.site_view_time(uuid, uuid, int, int, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------
-- The counts on the listings (anyone in the agency): openings of the links
-- and the website's visits, how many looked at the photos (2 or more) and
-- how many played the video.
-- ---------------------------------------------------------------------
create or replace function public.listing_views(target_properties uuid[])
returns table (property_id uuid, opens int, photo_views int, video_views int, last_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with seen as (
    select e.property_id, e.photos, e.video, e.occurred_at
    from public.share_events e
    where e.kind = 'open' and e.property_id = any (target_properties)
    union all
    select v.property_id, v.photos, v.video, v.occurred_at
    from public.site_views v
    where v.property_id = any (target_properties)
  )
  select s.property_id,
    count(*)::int,
    (count(*) filter (where s.photos >= 2))::int,
    (count(*) filter (where s.video))::int,
    max(s.occurred_at)
  from seen s
  join public.properties p on p.id = s.property_id
  where public.is_org_member(p.organization_id)
  group by s.property_id;
$$;

revoke execute on function public.listing_views(uuid[]) from public, anon;
grant execute on function public.listing_views(uuid[]) to authenticated;

-- =====================================================================
-- BRIXA — migration 075: a listing that fits a colleague's buyer
--   • a listing on the market (or cheaper): the broker of every active
--     buyer / tenant it fits is told — a hot one (A) at once with 🔥 as
--     before, the others in one word per broker, with the listing to offer;
--   • the listing's broker is told which colleagues have buyers for it and
--     how many (not who the clients are — brokers see only their own);
--   • a buyer's search saved: the colleagues whose listings it fits too;
--   • on the listing: the colleagues with buyers for it, to write or call.
-- Run once in Supabase → SQL Editor → New query → Run (after 074).
-- Safe to run twice.
-- =====================================================================

-- a buyer's search saved (once a minute, a minute later — the rest of it is saved by then)
create table if not exists public.search_events (
  client_id uuid primary key references public.clients (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists search_events_waiting_idx on public.search_events (created_at);

alter table public.search_events enable row level security;

create or replace function public.note_search_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- not a bulk import, not the samples
  if coalesce(current_setting('brixa.importing', true), '') = 'on' then
    return new;
  end if;
  insert into public.search_events (client_id) values (new.client_id)
  on conflict (client_id) do update set created_at = now();
  return new;
end;
$$;

revoke execute on function public.note_search_event() from public, anon, authenticated;

drop trigger if exists client_searches_search_event on public.client_searches;
create trigger client_searches_search_event
  after insert or update on public.client_searches
  for each row execute function public.note_search_event();

-- Every minute: the listings that came on the market or got cheaper, and the searches saved
-- (a minute ago, so their extras are saved too) → the brokers of the buyers and of the listings.
create or replace function public.speed_to_lead()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
  sev record;
  hit record;
  grp record;
  fresh_ids uuid[];
  told_ids uuid[];
  names text;
  brokers int;
  made int := 0;
begin
  for ev in
    select e.id, e.kind, p.id as property_id, p.organization_id, p.title, p.owner_client_id,
      p.operation_type, p.responsible_broker_id as lister
    from public.listing_events e
    join public.properties p on p.id = e.property_id
    where e.handled_at is null and e.created_at < now() - interval '50 seconds' and p.status = 'active'
    order by e.created_at
    limit 50
  loop
    update public.listing_events set handled_at = now() where id = ev.id;

    -- the active buyers / tenants it fits, each once for this listing (and once more if it gets cheaper)
    with fresh as (
      insert into public.lead_alerts (client_id, property_id, kind)
      select c.id, ev.property_id, ev.kind
      from public.clients c
      join public.client_searches s on s.client_id = c.id and s.operation = ev.operation_type
      where c.organization_id = ev.organization_id
        and c.responsible_broker_id is not null and c.stage not in ('deal', 'lost') and not c.sample
        and c.id is distinct from ev.owner_client_id
        and public.listing_fits(ev.property_id, c.id)
      on conflict do nothing
      returning client_id
    )
    select coalesce(array_agg(client_id), '{}') into fresh_ids from fresh;

    if cardinality(fresh_ids) = 0 then
      continue;
    end if;

    -- a hot one: at once, by name — call within 5 minutes (the push can call them)
    for hit in
      select c.id, c.full_name, c.responsible_broker_id
      from public.clients c
      where c.id = any (fresh_ids) and c.client_class = 'A'
      order by c.updated_at desc
    loop
      perform public.notify(
        ev.organization_id, hit.responsible_broker_id, null, 'speed_to_lead',
        jsonb_build_object('title', hit.full_name, 'property', ev.title, 'kind', ev.kind),
        '/clients/' || hit.id
      );
      made := made + 1;
    end loop;

    -- the others: one word to each broker — the buyer by name, or how many — and the listing to offer
    for grp in
      select c.responsible_broker_id as broker, count(*)::int as n,
        (array_agg(c.full_name order by c.updated_at desc))[1] as name
      from public.clients c
      where c.id = any (fresh_ids) and c.client_class <> 'A'
      group by c.responsible_broker_id
    loop
      perform public.notify(
        ev.organization_id, grp.broker,
        case when ev.lister is distinct from grp.broker then ev.lister end,
        'listing_match',
        jsonb_build_object(
          'title', grp.name, 'count', grp.n, 'property', ev.title, 'kind', ev.kind,
          'actor', case when ev.lister is not null and ev.lister <> grp.broker then public.person_name(ev.lister) end
        ),
        '/properties/' || ev.property_id || '#buyers'
      );
      made := made + 1;
    end loop;

    -- the listing's broker: the colleagues who have buyers for it (each buyer told once)
    if ev.lister is not null then
      with told as (
        insert into public.lead_alerts (client_id, property_id, kind)
        select c.id, ev.property_id, 'lister'
        from public.clients c
        where c.id = any (fresh_ids) and c.responsible_broker_id <> ev.lister
        on conflict do nothing
        returning client_id
      )
      select coalesce(array_agg(client_id), '{}') into told_ids from told;

      if cardinality(told_ids) > 0 then
        select string_agg(public.person_name(b.broker), ', ' order by b.n desc, b.broker), count(*)::int
        into names, brokers
        from (
          select c.responsible_broker_id as broker, count(*) as n
          from public.clients c
          where c.id = any (told_ids)
          group by c.responsible_broker_id
        ) b;
        perform public.notify(
          ev.organization_id, ev.lister, null, 'listing_buyers',
          jsonb_build_object('property', ev.title, 'actor', names, 'count', cardinality(told_ids), 'brokers', brokers),
          '/properties/' || ev.property_id || '#colleague-buyers'
        );
        made := made + 1;
      end if;
    end if;
  end loop;

  -- a buyer's search saved: the colleagues whose listings on the market it fits
  for sev in
    select e.client_id, c.organization_id, c.responsible_broker_id as broker, c.stage, c.sample
    from public.search_events e
    join public.clients c on c.id = e.client_id
    where e.created_at < now() - interval '50 seconds'
    order by e.created_at
    limit 50
  loop
    delete from public.search_events where client_id = sev.client_id;
    if sev.broker is null or sev.stage in ('deal', 'lost') or sev.sample then
      continue;
    end if;

    with told as (
      insert into public.lead_alerts (client_id, property_id, kind)
      select sev.client_id, p.id, 'lister'
      from public.properties p
      join public.client_searches s on s.client_id = sev.client_id and s.operation = p.operation_type
      where p.organization_id = sev.organization_id and p.status = 'active' and not p.sample
        and p.responsible_broker_id is not null and p.responsible_broker_id <> sev.broker
        and p.owner_client_id is distinct from sev.client_id
        and public.listing_fits(p.id, sev.client_id)
      on conflict do nothing
      returning property_id
    )
    select coalesce(array_agg(property_id), '{}') into told_ids from told;

    -- one word to each colleague: the listing, or how many of theirs it fits
    for grp in
      select p.responsible_broker_id as lister, count(*)::int as n,
        (array_agg(p.id order by p.updated_at desc))[1] as first_id,
        (array_agg(p.title order by p.updated_at desc))[1] as first_title
      from public.properties p
      where p.id = any (told_ids)
      group by p.responsible_broker_id
    loop
      perform public.notify(
        sev.organization_id, grp.lister, sev.broker, 'listing_buyers',
        jsonb_build_object(
          'property', grp.first_title, 'actor', public.person_name(sev.broker),
          'count', 1, 'brokers', 1, 'properties', grp.n, 'kind', 'search'
        ),
        '/properties/' || grp.first_id || '#colleague-buyers'
      );
      made := made + 1;
    end loop;
  end loop;

  -- what's done and old
  delete from public.listing_events where handled_at < now() - interval '7 days';
  -- a listing that never became active again: forget it after a day
  update public.listing_events set handled_at = now() where handled_at is null and created_at < now() - interval '1 day';
  return made;
end;
$$;

revoke execute on function public.speed_to_lead() from public, anon, authenticated;

-- On a listing: the colleagues (not this user) who have active buyers it fits — how many, how many hot.
-- Not who the clients are: a broker sees only their own clients.
create or replace function public.colleague_buyers(target_property uuid)
returns table (broker_id uuid, name text, phone text, avatar_path text, buyers int, hot int)
language sql
stable
security definer
set search_path = public
as $$
  select c.responsible_broker_id, coalesce(pr.full_name, pr.email), pr.phone, pr.avatar_path,
    count(*)::int, (count(*) filter (where c.client_class = 'A'))::int
  from public.properties p
  join public.client_searches s on s.operation = p.operation_type
  join public.clients c on c.id = s.client_id and c.organization_id = p.organization_id
  join public.profiles pr on pr.id = c.responsible_broker_id
  where p.id = target_property
    and public.is_org_member(p.organization_id)
    and c.responsible_broker_id <> auth.uid()
    and c.stage not in ('deal', 'lost') and not c.sample
    and c.id is distinct from p.owner_client_id
    and public.listing_fits(p.id, c.id)
  group by c.responsible_broker_id, pr.full_name, pr.email, pr.phone, pr.avatar_path
  order by count(*) desc, 2;
$$;

revoke execute on function public.colleague_buyers(uuid) from public, anon;
grant execute on function public.colleague_buyers(uuid) to authenticated;

-- What came in the last two days goes through once more, so the brokers hear of it now
-- (a buyer already told about a listing is not told again).
insert into public.listing_events (property_id, kind)
select p.id, 'new'
from public.properties p
where p.status = 'active' and not p.sample and p.created_at > now() - interval '2 days'
  and not exists (select 1 from public.listing_events e where e.property_id = p.id and e.handled_at is null);

insert into public.search_events (client_id)
select s.client_id
from public.client_searches s
join public.clients c on c.id = s.client_id
where s.updated_at > now() - interval '2 days' and not c.sample
on conflict do nothing;
