-- =====================================================================
-- BRIXA — migration 051: sample data to look around with
-- A new agency's owner fills BRIXA with made-up listings, clients, deals, tasks and calls in one
-- tap (in the agency's own town), and takes them all away in one tap. The samples never reach the
-- agency's website or BRIXA's panel, and taking them away leaves the agency's market as it was.
-- =====================================================================

alter table public.properties add column sample boolean not null default false;
alter table public.clients add column sample boolean not null default false;
alter table public.deals add column sample boolean not null default false;
alter table public.tasks add column sample boolean not null default false;
alter table public.activities add column sample boolean not null default false;
-- the day the samples came in (null: none)
alter table public.organizations add column sample_since date;

-- ---------------------------------------------------------------------
-- In: six listings, eight clients (with what they look for), three deals, four tasks, three calls
-- ---------------------------------------------------------------------
create or replace function public.load_sample_data()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  org uuid;
  town uuid;
  hoods uuid[];
  hood_names text[];
  res uuid;
  sub_studio uuid;
  sub_two uuid;
  sub_three uuid;
  sub_house uuid;
  sub_maisonette uuid;
  today date := public.sofia_today();
  p uuid[] := '{}';
  c uuid[] := '{}';
  new_id uuid;
  made int := 0;
  item record;
begin
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = me and m.role = 'owner'
  order by m.created_at limit 1;
  if org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if (select sample_since from public.organizations where id = org) is not null then
    raise exception 'already_loaded';
  end if;

  -- made-up people: no "new client" notices
  perform set_config('brixa.importing', 'on', true);

  -- the agency's town (else Sofia) and a few of its neighbourhoods
  select s.id into town
  from public.geo_settlements s, public.organizations o
  where o.id = org and s.settlement_type = 'гр.' and lower(s.name) = lower(btrim(coalesce(o.city, '')))
  limit 1;
  if town is null then
    select id into town from public.geo_settlements where settlement_type = 'гр.' and name = 'София' limit 1;
  end if;
  select coalesce(array_agg(id order by name), '{}'), coalesce(array_agg(name order by name), '{}')
  into hoods, hood_names
  from (select id, name from public.geo_neighborhoods where settlement_id = town order by name limit 5) h;

  select id into res from public.property_categories where code = 'residential';
  select id into sub_studio from public.property_subtypes where code = 'studio';
  select id into sub_two from public.property_subtypes where code = 'two_room';
  select id into sub_three from public.property_subtypes where code = 'three_room';
  select id into sub_house from public.property_subtypes where code = 'house';
  select id into sub_maisonette from public.property_subtypes where code = 'maisonette';

  -- the clients first (the owners of the listings among them)
  for item in
    select * from (values
      (1, 'Мария Иванова (пример)', array['buyer'], 'A', 'viewing', 'Търси двустаен или тристаен, иска да се нанесе до лятото.'),
      (2, 'Георги Петров (пример)', array['buyer'], 'B', 'called', 'Семейство с две деца, търсят тристаен близо до училище.'),
      (3, 'Елена Димитрова (пример)', array['tenant'], 'A', 'presentation', 'Търси жилище под наем, работи наблизо.'),
      (4, 'Николай Стоянов (пример)', array['investor'], 'B', 'new_contact', 'Инвеститор — търси малко жилище за отдаване под наем.'),
      (5, 'Иван Колев (пример)', array['seller'], 'A', 'presentation', 'Продава двустаен апартамент, иска бърза продажба.'),
      (6, 'Десислава Тодорова (пример)', array['landlord'], 'B', 'presentation', 'Отдава два апартамента под наем.'),
      (7, 'Петър Василев (пример)', array['seller'], 'B', 'negotiation', 'Продава къща, мисли за цената.'),
      (8, 'Анна Георгиева (пример)', array['buyer'], 'C', 'new_contact', 'Запитване от сайта, още не е ясно какво търси.')
    ) as v(n, full_name, types, klass, stage, notes)
    order by n
  loop
    insert into public.clients (organization_id, responsible_broker_id, created_by, full_name, types, client_class, stage, notes, source, assigned_at, sample)
    values (org, me, me, item.full_name, item.types, item.klass, item.stage, item.notes,
      case when item.n = 8 then 'agency' else 'personal' end, now(), true)
    returning id into new_id;
    c := c || new_id;
    made := made + 1;
  end loop;

  -- the listings
  for item in
    select * from (values
      (1, sub_two, 'sale', 'двустаен', 72, 2, 1, 3, 6, 'brick', 'renovated', 'furnished', 'air_conditioning', 145000, true, 5, hoods[1], hood_names[1],
        'Светъл двустаен апартамент след ремонт, с обзавеждане и голяма тераса. Тих квартал, близо до парк и спирка.'),
      (2, sub_three, 'sale', 'тристаен', 98, 3, 2, 5, 8, 'epk', 'good', 'partly', 'central', 189000, false, null, coalesce(hoods[2], hoods[1]), coalesce(hood_names[2], hood_names[1]),
        'Просторен тристаен апартамент с две спални, южно изложение и асансьор. Подходящ за семейство.'),
      (3, sub_studio, 'rent', 'едностаен', 42, 1, 1, 2, 5, 'brick', 'renovated', 'furnished', 'air_conditioning', 450, false, 6, coalesce(hoods[3], hoods[1]), coalesce(hood_names[3], hood_names[1]),
        'Уютен едностаен апартамент под наем, напълно обзаведен, свободен веднага.'),
      (4, sub_house, 'sale', 'къща', 160, 4, 3, null, 2, 'brick', 'good', 'unfurnished', 'heat_pump', 265000, true, 7, coalesce(hoods[4], hoods[1]), coalesce(hood_names[4], hood_names[1]),
        'Двуетажна къща с двор от 400 м², гараж и термопомпа. Спокойно място, лесен достъп до центъра.'),
      (5, sub_two, 'rent', 'двустаен', 65, 2, 1, 4, 7, 'panel', 'renovated', 'furnished', 'central', 650, false, 6, hoods[1], hood_names[1],
        'Двустаен апартамент под наем след ремонт, с нова кухня и пералня.'),
      (6, sub_maisonette, 'sale', 'мезонет', 130, 4, 2, 6, 7, 'monolithic', 'new', 'unfurnished', 'gas', 239000, false, null, coalesce(hoods[5], hoods[2], hoods[1]), coalesce(hood_names[5], hood_names[2], hood_names[1]),
        'Мезонет в нова сграда с Акт 16, два етажа и панорамна гледка. Възможност за паркомясто.')
    ) as v(n, subtype, op, word, area, rooms, bedrooms, floor, floors, construction, condition, furnishing, heating, price, exclusive, owner_n, hood, hood_name, description)
    order by n
  loop
    insert into public.properties (
      organization_id, category_id, subtype_id, operation_type, status, title, settlement_id, neighborhood_id,
      area, rooms, bedrooms, floor, total_floors, construction_type, condition, furnishing, heating,
      asking_price, current_price, currency, exclusive_contract, description,
      responsible_broker_id, created_by, owner_client_id, sample)
    values (
      org, res, item.subtype, item.op, 'active',
      'Пример: ' || item.word || coalesce(', ' || item.hood_name, ''),
      town, item.hood,
      item.area, item.rooms, item.bedrooms, item.floor, item.floors, item.construction, item.condition, item.furnishing, item.heating,
      item.price, item.price, 'EUR', item.exclusive, item.description,
      me, me, case when item.owner_n is not null then c[item.owner_n] end, true)
    returning id into new_id;
    p := p || new_id;
    made := made + 1;
  end loop;

  -- what the buyers look for
  insert into public.client_searches (client_id, operation, subtype_ids, settlement_ids, neighborhood_ids, budget_min, budget_max, rooms_min, rooms_max)
  values
    (c[1], 'sale', array[sub_two, sub_three], array[town], hoods[1:2], 120000, 160000, 2, 3),
    (c[2], 'sale', array[sub_three], array[town], '{}', 170000, 200000, 3, 4),
    (c[3], 'rent', array[sub_studio, sub_two], array[town], '{}', null, 700, 1, 2),
    (c[4], 'sale', array[sub_studio, sub_two], array[town], '{}', null, 120000, 1, 2),
    (c[8], 'sale', array[sub_two], array[town], '{}', null, 150000, null, null);

  -- the deals on the way
  insert into public.deals (organization_id, broker_id, created_by, property_id, client_id, kind, stage, status, price, currency, commission, viewing_on, offer_on, deposit_on, sample)
  values
    (org, me, me, p[1], c[1], 'sale', 'offer', 'open', 140000, 'EUR', 4200, today - 3, today - 1, null, true),
    (org, me, me, p[2], c[2], 'sale', 'deposit', 'open', 185000, 'EUR', 5550, today - 9, today - 5, today - 2, true),
    (org, me, me, p[5], c[3], 'rent', 'viewing', 'open', 650, 'EUR', 650, today + 1, null, null, true);
  made := made + 3;

  -- the day's work
  insert into public.tasks (organization_id, assigned_to, created_by, title, type, client_id, property_id, due_date, due_time, sample)
  values
    (org, me, me, 'Обади се на Георги Петров (пример) — има нов тристаен', 'call', c[2], p[2], today, '10:00', true),
    (org, me, me, 'Оглед с Мария Иванова (пример)', 'viewing', c[1], p[1], today, '17:30', true),
    (org, me, me, 'Договор за посредничество с Иван Колев (пример)', 'meeting', c[5], p[1], today, '12:00', true),
    (org, me, me, 'Изпрати оферти на Елена Димитрова (пример)', 'message', c[3], null, today + 1, null, true);
  made := made + 4;

  -- yesterday's calls and the viewing
  insert into public.activities (organization_id, profile_id, type, client_id, property_id, note, outcome, occurred_at, sample)
  values
    (org, me, 'call', c[1], null, 'Харесва квартала, иска оглед още тази седмица.', 'positive', now() - interval '1 day', true),
    (org, me, 'viewing', c[1], p[1], 'Огледът мина добре — мисли за цената.', 'positive', now() - interval '1 day' + interval '3 hours', true),
    (org, me, 'call', c[4], null, 'Иска да види доходността на малките жилища.', 'neutral', now() - interval '1 day' + interval '5 hours', true);
  made := made + 3;

  update public.organizations set sample_since = today where id = org;
  return made;
end;
$$;

revoke execute on function public.load_sample_data() from public, anon;
grant execute on function public.load_sample_data() to authenticated;

-- ---------------------------------------------------------------------
-- Out: every sample, the work BRIXA made around them, and the market's days while they were in
-- ---------------------------------------------------------------------
create or replace function public.remove_sample_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  since date;
begin
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at limit 1;
  if org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select sample_since into since from public.organizations where id = org;

  perform set_config('brixa.importing', 'on', true);
  -- the tasks and calls about a sample (BRIXA's own too, like a listing's marketing)
  delete from public.tasks t
  where t.organization_id = org
    and (t.sample
      or t.property_id in (select id from public.properties where organization_id = org and sample)
      or t.client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.activities a
  where a.organization_id = org
    and (a.sample
      or a.property_id in (select id from public.properties where organization_id = org and sample)
      or a.client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.deals
  where organization_id = org
    and (sample
      or property_id in (select id from public.properties where organization_id = org and sample)
      or client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.notifications n
  where n.organization_id = org
    and (n.link ~ any (array(select '/(properties|clients)/' || id::text from public.properties where organization_id = org and sample
                             union all select '/(properties|clients)/' || id::text from public.clients where organization_id = org and sample)));
  delete from public.properties where organization_id = org and sample;
  delete from public.clients where organization_id = org and sample;

  -- the market's days counted with the samples in
  if since is not null then
    delete from public.market_daily where organization_id = org and day >= since;
  end if;
  update public.organizations set sample_since = null where id = org;
  -- the real listings' stars without the samples around them
  perform public.refresh_org_stars(org);
end;
$$;

revoke execute on function public.remove_sample_data() from public, anon;
grant execute on function public.remove_sample_data() to authenticated;

-- ---------------------------------------------------------------------
-- The samples never reach the agency's website
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
          'photo', (select ph.storage_path from public.property_photos ph where ph.property_id = p.id order by ph.position limit 1),
          -- for the visitor's eyes: the stars only when they're 4 or 5
          'stars', case when p.market_stars >= 4 then p.market_stars end)
        order by p.created_at desc)
      from public.properties p
      where p.organization_id = o.id and p.status in ('active', 'reserved') and p.operation_type in ('sale', 'rent')
        and not p.off_market and not p.sample), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'phone', pr.phone, 'email', pr.email,
          'job_title', pr.job_title, 'avatar_path', pr.avatar_path) order by m.created_at)
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
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
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
-- BRIXA's panel counts only an agency's real work
-- ---------------------------------------------------------------------
create or replace function public.platform_agencies()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'kind', o.kind, 'city', o.city, 'eik', o.eik,
        'phone', o.phone, 'email', o.email, 'created_at', o.created_at,
        'trial_ends_at', o.trial_ends_at, 'plan_code', o.plan_code, 'paid_until', o.paid_until,
        'comped', o.comped, 'terms_accepted_at', o.terms_accepted_at, 'sample_since', o.sample_since,
        'owner', (
          select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone)
          from public.organization_members m join public.profiles pr on pr.id = m.profile_id
          where m.organization_id = o.id and m.role = 'owner'
          order by m.created_at limit 1),
        'people', (select count(*) from public.organization_members m where m.organization_id = o.id),
        'invited', (select count(*) from public.organization_invitations i where i.organization_id = o.id and i.accepted_at is null),
        'listings', (select count(*) from public.properties p where p.organization_id = o.id and not p.sample),
        'clients', (select count(*) from public.clients c where c.organization_id = o.id and not c.sample),
        'deals', (select count(*) from public.deals d where d.organization_id = o.id and not d.sample),
        'last_sign_in', (
          select max(u.last_sign_in_at)
          from public.organization_members m join auth.users u on u.id = m.profile_id
          where m.organization_id = o.id),
        'last_activity', greatest(
          (select max(a.created_at) from public.activities a where a.organization_id = o.id and not a.sample),
          (select max(p.created_at) from public.properties p where p.organization_id = o.id and not p.sample),
          (select max(c.created_at) from public.clients c where c.organization_id = o.id and not c.sample))
      ) order by o.created_at desc)
    from public.organizations o
  ), '[]'::jsonb);
end;
$$;
