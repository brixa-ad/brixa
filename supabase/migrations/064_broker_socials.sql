-- =====================================================================
-- BRIXA — migration 064: the broker's social networks; reminders that say whom to call
--   Each broker adds their Facebook, Instagram, TikTok, LinkedIn and YouTube in
--   their profile; they show with the broker wherever a client can contact them:
--   a shared listing, a search, an analysis, the owner's report, the open house,
--   the agency's website.
--   A task's reminder now carries the task's kind and the client (or colleague),
--   so the phone shows "Обадете се на Георги Петров" on the lock screen.
-- Run once in Supabase → SQL Editor → New query → Run (after 063).
-- =====================================================================

alter table public.profiles
  add column if not exists socials jsonb not null default '{}'::jsonb
    check (jsonb_typeof(socials) = 'object' and pg_column_size(socials) < 4000);

-- the public pages bring them along with the broker
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
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
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
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
      from public.profiles pr where pr.id = coalesce(sh.created_by, p.responsible_broker_id)
    ),
    'agency', (
      select jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'logo_path', o.logo_path)
      from public.organizations o where o.id = p.organization_id
    )
  );
end;
$$;

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
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
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
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials)
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
        and not p.off_market and not p.sample), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'phone', pr.phone, 'email', pr.email,
          'job_title', pr.job_title, 'avatar_path', pr.avatar_path, 'socials', pr.socials) order by m.created_at)
      from public.organization_members m join public.profiles pr on pr.id = m.profile_id
      where m.organization_id = o.id), '[]'::jsonb)
  )
  from public.organizations o
  where o.site_slug = lower(site) and o.site_enabled;
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

-- the reminder 15 minutes before a task: with its kind and whom it's about
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
    select t.id, t.organization_id, t.assigned_to, t.title, t.due_time, t.type,
      coalesce(c.full_name, pa.full_name) as person
    from public.tasks t
    left join public.clients c on c.id = t.client_id
    left join public.partners pa on pa.id = t.partner_id
    where t.status = 'open'
      and t.due_date = today
      and t.due_time is not null
      and (t.reminded_on is null or t.reminded_on < today)
      and t.due_time > now_time
      and t.due_time - interval '15 minutes' <= now_time
  loop
    perform public.notify(
      task.organization_id, task.assigned_to, null, 'task_reminder',
      jsonb_strip_nulls(jsonb_build_object(
        'title', task.title,
        'time', to_char(task.due_time, 'HH24:MI'),
        'kind', task.type,
        'client', task.person
      )),
      '/tasks/' || task.id
    );
    update public.tasks set reminded_on = today where id = task.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.notify_task_reminders(timestamptz) from public, anon, authenticated;
