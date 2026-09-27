-- =====================================================================
-- BRIXA — migration 017: sharing a listing with a client
--   a private link (/p/<token>) to a nice public page of the listing —
--   photos, price, details, the broker's contacts — never the exact address.
--   The broker sees when it's opened (and gets a notification the first time).
-- Run once in Supabase → SQL Editor → New query → Run (after 016).
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

-- The shared page shows the listing's photos to anyone with the link.
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
  );
$$;

create policy "property photos: shared" on storage.objects
  for select to anon
  using (bucket_id = 'property-photos' and public.photo_is_shared(name));
