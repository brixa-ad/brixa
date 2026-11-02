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
