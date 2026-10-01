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
