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
  -- follow-up: a new client within N hours, then every N days by class; 0 = never give clients back
  follow_up_first_hours int not null default 24 check (follow_up_first_hours between 1 and 720),
  follow_up_days_a int not null default 2 check (follow_up_days_a between 1 and 365),
  follow_up_days_b int not null default 7 check (follow_up_days_b between 1 and 365),
  follow_up_days_c int not null default 30 check (follow_up_days_c between 1 and 365),
  release_after_days int not null default 7 check (release_after_days between 0 and 365),
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
--   double deal 50 · deal 30 · new listing 10 (+10 exclusive) · viewing 5
--   meeting 3 · new client 2 · call 1
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
    select d.broker_id as pid, sum(d.commission) as total, count(*)::int as n,
      sum(case when d.double_sided then 50 else 30 end)::int as dp
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
    (r.deal_points + r.listings * 10 + r.exclusives * 10 + r.viewings * 5
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
    (select coalesce(sum(d.commission), 0) from public.deals d, bounds b, org
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
-- The job (every 15 minutes): missed deadlines, giving clients back,
-- and the morning list of who to contact today
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

  -- 3) from 08:30: who each broker should contact today
  if local_now::time >= time '08:30' then
    for person in
      select c.organization_id, c.responsible_broker_id as broker, count(*)::int as n,
        array_to_string((array_agg(c.full_name order by c.follow_up_at))[1:3], ', ') as names
      from public.clients c
      where c.responsible_broker_id is not null
        and c.follow_up_at > at_time
        and (c.follow_up_at at time zone 'Europe/Sofia')::date = today
      group by c.organization_id, c.responsible_broker_id
    loop
      insert into public.follow_up_digests (profile_id, day) values (person.broker, today)
      on conflict do nothing;
      if not found then continue; end if;
      perform public.notify(
        person.organization_id, person.broker, null, 'follow_ups_today',
        jsonb_build_object('count', person.n, 'title', person.names), '/follow-up'
      );
      sent := sent + 1;
    end loop;
  end if;

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
