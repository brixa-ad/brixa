-- =====================================================================
-- BRIXA — migration 039: listings "from the sleeve" (не се рекламират)
--   • a listing can be marked as not advertised: it stays with the agency —
--     shared privately by link with clients and colleagues, never on the
--     agency's website
-- Run once in Supabase → SQL Editor → New query → Run (after 038).
-- =====================================================================

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

