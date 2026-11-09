-- =====================================================================
-- BRIXA — migration 076: the area may be a little off
--   • a listing up to 10% smaller or bigger than the area a buyer searched
--     fits them too (as the price may be up to 10% over the budget) — the
--     app shows by how much; the notifications of 075 follow it.
--   • the listings and searches of the last two days go through once more.
-- Run once in Supabase → SQL Editor → New query → Run (after 075).
-- Safe to run twice.
-- =====================================================================

-- Does a listing fit a client's search? (as the app's matching: the budget may be 10% over,
-- the area 10% under or over)
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
      and (p.area is null or ((s.area_min is null or p.area >= s.area_min * 0.9) and (s.area_max is null or p.area <= s.area_max * 1.1)))
      and (p.rooms is null or ((s.rooms_min is null or p.rooms >= s.rooms_min) and (s.rooms_max is null or p.rooms <= s.rooms_max)))
  );
$$;

revoke execute on function public.listing_fits(uuid, uuid) from public, anon, authenticated;

-- What came in the last two days goes through once more (nobody is told twice).
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
