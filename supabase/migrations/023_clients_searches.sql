-- =====================================================================
-- BRIXA — migration 023: clients, history and searches
--   * sources: "Външен брокер" and "Табели и светлини" go, "Yavlena"
--     becomes "От агенцията", TikTok / flyers / banners come in
--   * what a seller or landlord offers — kept on the client even when
--     there's no listing yet (e.g. they only wanted advice)
--   * the history: what happened and the client's feedback, editable
--   * a client's search shared by link (criteria only, no client)
--   * searches from colleagues at other agencies, matched with our listings
-- Run once in Supabase → SQL Editor → New query → Run (after 022).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sources
-- ---------------------------------------------------------------------
alter table public.clients drop constraint if exists clients_source_check;
update public.clients set source = 'referral' where source = 'external_broker';
update public.clients set source = 'agency' where source = 'yavlena';
update public.clients set source = 'banner' where source = 'signs';
alter table public.clients add constraint clients_source_check check (source in (
  'personal', 'referral', 'agency', 'email', 'google', 'facebook', 'instagram', 'tiktok',
  'realistimo', 'billboard', 'flyers', 'banner'
));

-- ---------------------------------------------------------------------
-- What a seller / landlord offers (before or without a listing)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- The history: the client's feedback and how it went; the author or a
-- manager can complete it later
-- ---------------------------------------------------------------------
alter table public.activities
  add column feedback text check (feedback is null or char_length(feedback) <= 2000),
  add column outcome text check (outcome is null or outcome in ('positive', 'neutral', 'negative'));

create policy "activities: update" on public.activities
  for update to authenticated
  using (profile_id = auth.uid() or public.is_org_manager(organization_id))
  with check (profile_id = auth.uid() or public.is_org_manager(organization_id));

-- ---------------------------------------------------------------------
-- A client's search shared by link — the criteria and the broker, never the client
-- ---------------------------------------------------------------------
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
