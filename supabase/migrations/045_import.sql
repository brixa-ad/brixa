-- =====================================================================
-- BRIXA — migration 045: bringing clients and listings in from a table
--   • clients and listings from Excel, Google Sheets, another CRM or the phone's
--     contacts, a few hundred at a time; a client whose phone is already in the
--     agency is left out
--   • each row goes to the broker in its "Broker" column (when the one importing
--     may give them work), else to the one importing
--   • imported clients count as already spoken to: their next contact follows
--     their class, not "call within 24 hours"
--   • each broker hears once: "N clients were brought in for you"
-- Run once in Supabase → SQL Editor → New query → Run (after 044).
-- =====================================================================

create or replace function public.on_client_owner_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member record;
  previous uuid := case when tg_op = 'UPDATE' then old.responsible_broker_id end;
begin
  -- an import tells each broker once, at the end — not client by client
  if current_setting('brixa.importing', true) = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.responsible_broker_id is not distinct from old.responsible_broker_id then
    return new;
  end if;
  if tg_op = 'INSERT' and new.lead_form_id is not null and new.responsible_broker_id is not null then
    return new;
  end if;

  if new.responsible_broker_id is null then
    for member in
      select profile_id from public.organization_members
      where organization_id = new.organization_id
        and profile_id is distinct from auth.uid()
        and profile_id is distinct from previous
    loop
      perform public.notify(
        new.organization_id, member.profile_id, auth.uid(), 'free_contact',
        jsonb_build_object('title', new.full_name), '/contacts'
      );
    end loop;
  elsif new.responsible_broker_id is distinct from auth.uid() then
    perform public.notify(
      new.organization_id, new.responsible_broker_id, auth.uid(), 'client_assigned',
      jsonb_build_object(
        'title', new.full_name,
        'hours', (select follow_up_first_hours from public.organizations where id = new.organization_id)
      ),
      '/clients/' || new.id
    );
  elsif tg_op = 'UPDATE' and previous is null then
    for member in
      select profile_id from public.organization_members
      where organization_id = new.organization_id and public.oversees_as(profile_id, new.responsible_broker_id) and profile_id <> auth.uid()
    loop
      perform public.notify(
        new.organization_id, member.profile_id, auth.uid(), 'contact_claimed',
        jsonb_build_object('title', new.full_name, 'actor', public.person_name(auth.uid())),
        '/clients/' || new.id
      );
    end loop;
  end if;
  return new;
end;
$$;

-- Whose a row is: the one asked for, when the one importing may give them work; else the one importing.
create or replace function public.import_broker(target_org uuid, wanted uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when wanted is not null
      and exists (select 1 from public.organization_members m where m.organization_id = target_org and m.profile_id = wanted)
      and (wanted = auth.uid() or public.oversees_as(auth.uid(), wanted))
    then wanted
    else auth.uid()
  end;
$$;

-- The next contact for an imported client: by its class (A 2 days, B 7, C 30 — the agency's own).
create or replace function public.import_follow_up(target_org uuid, client_class text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now() + make_interval(days => case client_class
    when 'A' then o.follow_up_days_a when 'B' then o.follow_up_days_b else o.follow_up_days_c end)
  from public.organizations o where o.id = target_org;
$$;

-- Each broker who got something: one notification.
create or replace function public.import_tell(target_org uuid, counts jsonb, what text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  broker text;
begin
  for broker in select jsonb_object_keys(coalesce(counts, '{}'::jsonb)) loop
    continue when broker::uuid = auth.uid();
    perform public.notify(
      target_org, broker::uuid, auth.uid(), 'imported',
      jsonb_build_object('count', (counts ->> broker)::int, 'what', what),
      case when what = 'properties' then '/properties?view=mine' else '/clients' end
    );
  end loop;
end;
$$;

-- Clients: rows of {line, full_name, phone, email, types[], client_class, notes, broker_id}.
create or replace function public.import_clients(target_org uuid, rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  new_id uuid;
  broker uuid;
  name text;
  kinds text[];
  cls text;
  imported int := 0;
  skipped jsonb := '[]'::jsonb;
  errors jsonb := '[]'::jsonb;
  per_broker jsonb := '{}'::jsonb;
begin
  if not public.is_org_member(target_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('brixa.importing', 'on', true);

  for r in select value from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) limit 500 loop
    name := left(btrim(coalesce(r ->> 'full_name', '')), 120);
    kinds := array(
      select distinct k from jsonb_array_elements_text(coalesce(r -> 'types', '[]'::jsonb)) k
      where k in ('buyer', 'seller', 'tenant', 'landlord', 'investor')
    );
    cls := case when r ->> 'client_class' in ('A', 'B', 'C') then r ->> 'client_class' else 'C' end;
    if char_length(name) < 2 then
      errors := errors || jsonb_build_object('line', r -> 'line', 'reason', 'name');
      continue;
    end if;
    if cardinality(kinds) = 0 then
      errors := errors || jsonb_build_object('line', r -> 'line', 'reason', 'type');
      continue;
    end if;
    broker := public.import_broker(target_org, nullif(r ->> 'broker_id', '')::uuid);
    begin
      insert into public.clients (organization_id, responsible_broker_id, created_by, full_name, phone, email, types, client_class, stage, notes)
      values (
        target_org, broker, auth.uid(), name,
        left(nullif(btrim(coalesce(r ->> 'phone', '')), ''), 40),
        left(nullif(btrim(coalesce(r ->> 'email', '')), ''), 200),
        kinds, cls, 'called',
        left(nullif(btrim(coalesce(r ->> 'notes', '')), ''), 5000)
      )
      returning id into new_id;
      update public.clients set follow_up_at = public.import_follow_up(target_org, cls) where id = new_id;
      imported := imported + 1;
      per_broker := jsonb_set(per_broker, array[broker::text], to_jsonb(coalesce((per_broker ->> broker::text)::int, 0) + 1));
    exception
      when unique_violation then
        skipped := skipped || jsonb_build_object('line', r -> 'line', 'name', name, 'phone', r ->> 'phone');
      when others then
        errors := errors || jsonb_build_object('line', r -> 'line', 'reason', sqlerrm);
    end;
  end loop;

  perform public.import_tell(target_org, per_broker, 'clients');
  return jsonb_build_object('imported', imported, 'skipped', skipped, 'errors', errors);
end;
$$;

-- Listings: rows of {line, subtype_code, operation, title, price, currency, area, rooms, floor, total_floors,
-- town, neighborhood, address, description, exclusive, owner_name, owner_phone, broker_id}.
create or replace function public.import_properties(target_org uuid, rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  broker uuid;
  sub record;
  op text;
  town_id uuid;
  town_region uuid;
  town_label text;
  hood_id uuid;
  hood_label text;
  town_name text;
  hood_name text;
  owner_id uuid;
  owner_phone text;
  new_title text;
  num numeric;
  imported int := 0;
  errors jsonb := '[]'::jsonb;
  per_broker jsonb := '{}'::jsonb;
begin
  if not public.is_org_member(target_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('brixa.importing', 'on', true);

  for r in select value from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) limit 500 loop
    select st.id, st.category_id, st.name into sub from public.property_subtypes st where st.code = r ->> 'subtype_code';
    if sub.id is null then
      errors := errors || jsonb_build_object('line', r -> 'line', 'reason', 'type');
      continue;
    end if;
    op := case when r ->> 'operation' = 'rent' then 'rent' else 'sale' end;
    broker := public.import_broker(target_org, nullif(r ->> 'broker_id', '')::uuid);

    -- the town and the neighbourhood, by name
    town_id := null;
    town_region := null;
    town_label := null;
    hood_id := null;
    hood_label := null;
    town_name := btrim(regexp_replace(coalesce(r ->> 'town', ''), '^\s*(гр\.|град|с\.|село)\s*', '', 'i'));
    if town_name <> '' then
      select s.id, s.region_id, s.name into town_id, town_region, town_label from public.geo_settlements s
      where lower(s.name) = lower(town_name)
      order by (s.settlement_type = 'гр.') desc
      limit 1;
    end if;
    hood_name := btrim(regexp_replace(coalesce(r ->> 'neighborhood', ''), '^\s*(кв\.|ж\.\s?к\.|жк|м-т)\s*', '', 'i'));
    if town_id is not null and hood_name <> '' then
      select n.id, n.name into hood_id, hood_label from public.geo_neighborhoods n
      where n.settlement_id = town_id
        and (lower(n.name) = lower(hood_name) or lower(regexp_replace(n.name, '^(кв\.|ж\.к\.|м-т|к\.к\.)\s*', '', 'i')) = lower(hood_name))
      limit 1;
      if hood_id is null then
        select n.id, n.name into hood_id, hood_label from public.geo_neighborhoods n
        where n.settlement_id = town_id and lower(n.name) like '%' || lower(hood_name) || '%'
        order by char_length(n.name)
        limit 1;
      end if;
    end if;

    begin
      -- the owner: found by phone, else a new seller (landlord) client
      owner_id := null;
      owner_phone := nullif(btrim(coalesce(r ->> 'owner_phone', '')), '');
      if owner_phone is not null then
        select c.id into owner_id from public.clients c
        where c.organization_id = target_org and c.phone_normalized = public.normalize_phone(owner_phone);
      end if;
      if owner_id is null and (owner_phone is not null or char_length(btrim(coalesce(r ->> 'owner_name', ''))) >= 2) then
        insert into public.clients (organization_id, responsible_broker_id, created_by, full_name, phone, types, stage)
        values (
          target_org, broker, auth.uid(),
          left(coalesce(nullif(btrim(r ->> 'owner_name'), ''), 'Собственик ' || owner_phone), 120),
          left(owner_phone, 40),
          array[case when op = 'rent' then 'landlord' else 'seller' end], 'called'
        )
        returning id into owner_id;
        update public.clients set follow_up_at = public.import_follow_up(target_org, 'C') where id = owner_id;
      end if;

      new_title := left(coalesce(
        nullif(btrim(r ->> 'title'), ''),
        sub.name || coalesce(', ' || coalesce(hood_label, town_label), '')
      ), 200);
      num := nullif(r ->> 'price', '')::numeric;

      insert into public.properties (
        organization_id, category_id, subtype_id, operation_type, status, title,
        region_id, settlement_id, neighborhood_id, address,
        area, rooms, floor, total_floors,
        asking_price, current_price, currency, exclusive_contract, description,
        owner_client_id, responsible_broker_id, created_by
      )
      values (
        target_org, sub.category_id, sub.id, op, 'active', new_title,
        town_region, town_id, hood_id,
        left(nullif(btrim(concat_ws(', ',
          nullif(btrim(r ->> 'address'), ''),
          case when hood_id is null and hood_name <> '' then hood_name end,
          case when town_id is null and town_name <> '' then town_name end
        )), ''), 300),
        nullif(r ->> 'area', '')::numeric, nullif(r ->> 'rooms', '')::int,
        nullif(r ->> 'floor', '')::int, nullif(r ->> 'total_floors', '')::int,
        num, num,
        case when r ->> 'currency' in ('EUR', 'BGN', 'USD') then r ->> 'currency' else 'EUR' end,
        coalesce((r ->> 'exclusive')::boolean, false),
        left(nullif(btrim(coalesce(r ->> 'description', '')), ''), 10000),
        owner_id, broker, auth.uid()
      );
      imported := imported + 1;
      per_broker := jsonb_set(per_broker, array[broker::text], to_jsonb(coalesce((per_broker ->> broker::text)::int, 0) + 1));
    exception
      when others then
        errors := errors || jsonb_build_object('line', r -> 'line', 'reason', sqlerrm);
    end;
  end loop;

  perform public.import_tell(target_org, per_broker, 'properties');
  return jsonb_build_object('imported', imported, 'skipped', '[]'::jsonb, 'errors', errors);
end;
$$;

revoke execute on function public.import_broker(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.import_follow_up(uuid, text) from public, anon, authenticated;
revoke execute on function public.import_tell(uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.import_clients(uuid, jsonb) from public, anon;
revoke execute on function public.import_properties(uuid, jsonb) from public, anon;
grant execute on function public.import_clients(uuid, jsonb) to authenticated;
grant execute on function public.import_properties(uuid, jsonb) to authenticated;
