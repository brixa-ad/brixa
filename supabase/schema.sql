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
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'broker' check (role in ('owner', 'broker')),
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

create index organization_members_profile_idx on public.organization_members (profile_id);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null default 'broker' check (role in ('owner', 'broker')),
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

create or replace function public.can_access_property(target_property uuid)
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

create policy "members: owners remove brokers" on public.organization_members
  for delete to authenticated
  using (public.is_org_owner(organization_id) and role <> 'owner');

-- organization_invitations
create policy "invitations: owners read" on public.organization_invitations
  for select to authenticated using (public.is_org_owner(organization_id));

create policy "invitations: owners create" on public.organization_invitations
  for insert to authenticated
  with check (public.is_org_owner(organization_id) and invited_by = auth.uid());

create policy "invitations: owners delete" on public.organization_invitations
  for delete to authenticated using (public.is_org_owner(organization_id));

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

create policy "properties: members create" on public.properties
  for insert to authenticated
  with check (public.is_org_member(organization_id) and created_by = auth.uid());

create policy "properties: members update" on public.properties
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "properties: members delete" on public.properties
  for delete to authenticated using (public.is_org_member(organization_id));

-- property_feature_values
create policy "feature values: read" on public.property_feature_values
  for select to authenticated using (public.can_access_property(property_id));
create policy "feature values: insert" on public.property_feature_values
  for insert to authenticated with check (public.can_access_property(property_id));
create policy "feature values: delete" on public.property_feature_values
  for delete to authenticated using (public.can_access_property(property_id));

-- property_price_history (inserted only by trigger)
create policy "price history: read" on public.property_price_history
  for select to authenticated using (public.can_access_property(property_id));

-- property_photos
create policy "photos: read" on public.property_photos
  for select to authenticated using (public.can_access_property(property_id));
create policy "photos: insert" on public.property_photos
  for insert to authenticated
  with check (public.can_access_property(property_id) and created_by = auth.uid());
create policy "photos: update" on public.property_photos
  for update to authenticated
  using (public.can_access_property(property_id))
  with check (public.can_access_property(property_id));
create policy "photos: delete" on public.property_photos
  for delete to authenticated using (public.can_access_property(property_id));

-- ---------------------------------------------------------------------
-- Storage: private bucket for property photos
-- Files are stored as  <organization_id>/<property_id>/<file>.jpg
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-photos', 'property-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "property photos: members read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'property-photos'
    and (storage.foldername(name))[1] in (
      select organization_id::text from public.organization_members where profile_id = auth.uid()
    )
  );

create policy "property photos: members upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'property-photos'
    and (storage.foldername(name))[1] in (
      select organization_id::text from public.organization_members where profile_id = auth.uid()
    )
  );

create policy "property photos: members delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'property-photos'
    and (storage.foldername(name))[1] in (
      select organization_id::text from public.organization_members where profile_id = auth.uid()
    )
  );
