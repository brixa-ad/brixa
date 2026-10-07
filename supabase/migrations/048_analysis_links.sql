-- =====================================================================
-- BRIXA — migration 048: the market analysis sent to a client as a link
--   • a private link (/a/…) to a page with the analysis and its PDF — for the
--     owner (the price to ask) or for a buyer (a good price: 4–5 stars only)
--   • the broker hears when it's opened: the first time, and again when it's
--     opened on another day (once a day at most)
--   • the agency's off-market listings never show among the comparables there
-- Run once in Supabase → SQL Editor → New query → Run (after 047).
-- =====================================================================

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
