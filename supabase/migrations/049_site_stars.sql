-- =====================================================================
-- BRIXA — migration 049: the stars on the website's listing cards
-- A listing that is a good offer for its market (4 or 5 stars) shows them on the agency's
-- website list too, and the visitor can choose "Good offers" only. Lower stars never show.
-- =====================================================================

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
