-- =====================================================================
-- BRIXA — migration 038: colleagues, and each listing's marketing
--   • colleagues from other agencies (name, phone, agency): a call about a
--     listing is logged with them (and a call back is set); their searches and
--     the links sent to them sit on their card
--   • a listing shared by link with a colleague — the marketing funnel
--   • each listing's marketing plan from the agency's template (photos, video,
--     drone, portals, flyers, sign, open house, colleagues every week,
--     farming…), ticked off — and shown in the owner's report
--   • every Monday: one task per broker — the week's marketing for their listings
-- Run once in Supabase → SQL Editor → New query → Run (after 037).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Colleagues from other agencies
-- ---------------------------------------------------------------------
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text check (phone is null or char_length(phone) <= 40),
  phone_normalized text generated always as (public.normalize_phone(phone)) stored,
  email text check (email is null or char_length(email) <= 200),
  agency text check (agency is null or char_length(agency) <= 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one colleague per phone in an agency
create unique index partners_phone_unique on public.partners (organization_id, phone_normalized) where phone_normalized is not null;
create index partners_org_idx on public.partners (organization_id, full_name);

create trigger partners_touch_updated_at
  before update on public.partners
  for each row execute function public.touch_updated_at();

alter table public.partners enable row level security;

-- the whole agency keeps the directory; whoever added one (or a manager) deletes it
create policy "partners: read" on public.partners
  for select to authenticated using (public.is_org_member(organization_id));
create policy "partners: create" on public.partners
  for insert to authenticated with check (created_by = auth.uid() and public.is_org_member(organization_id));
create policy "partners: update" on public.partners
  for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "partners: delete" on public.partners
  for delete to authenticated using (created_by = auth.uid() or public.is_org_manager(organization_id));

-- what they're linked to: a call, a task, a link sent, a search they gave us
alter table public.activities add column partner_id uuid references public.partners (id) on delete set null;
create index activities_partner_idx on public.activities (partner_id, occurred_at desc) where partner_id is not null;
alter table public.tasks add column partner_id uuid references public.partners (id) on delete set null;
create index tasks_partner_idx on public.tasks (partner_id) where partner_id is not null;
alter table public.property_shares add column partner_id uuid references public.partners (id) on delete set null;
create index property_shares_partner_idx on public.property_shares (partner_id) where partner_id is not null;
alter table public.partner_searches add column partner_id uuid references public.partners (id) on delete set null;

-- a colleague must be the agency's own
drop policy "activities: create" on public.activities;
create policy "activities: create" on public.activities
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.is_org_member(organization_id)
    and (client_id is null or public.can_view_client(client_id))
    and (property_id is null or public.can_view_property(property_id))
    and (partner_id is null or exists (
      select 1 from public.partners pa where pa.id = activities.partner_id and pa.organization_id = activities.organization_id
    ))
  );

drop policy "property shares: create" on public.property_shares;
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
    and (partner_id is null or exists (
      select 1 from public.partners pa where pa.id = property_shares.partner_id and pa.organization_id = property_shares.organization_id
    ))
  );

-- The colleague with this phone (made if new) — for a colleague's search entered by hand.
create or replace function public.partner_for(
  target_org uuid, partner_name text, partner_phone text, partner_email text, partner_agency text, creator uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found uuid;
  clean_name text := btrim(coalesce(partner_name, ''));
begin
  if nullif(btrim(coalesce(partner_phone, '')), '') is null then
    return null;
  end if;
  select id into found from public.partners
  where organization_id = target_org and phone_normalized = public.normalize_phone(partner_phone);
  if found is null then
    insert into public.partners (organization_id, full_name, phone, email, agency, created_by)
    values (
      target_org,
      left(case when char_length(clean_name) >= 2 then clean_name else btrim(partner_phone) end, 120),
      left(btrim(partner_phone), 40), left(nullif(btrim(coalesce(partner_email, '')), ''), 200),
      left(nullif(btrim(coalesce(partner_agency, '')), ''), 120), creator
    )
    returning id into found;
  end if;
  return found;
end;
$$;

revoke execute on function public.partner_for(uuid, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.link_partner_search()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.partner_id is null then
    new.partner_id := public.partner_for(new.organization_id, new.broker_name, new.phone, new.email, new.agency, new.created_by);
  end if;
  return new;
end;
$$;

revoke execute on function public.link_partner_search() from public, anon, authenticated;

create trigger partner_searches_link_partner
  before insert or update of phone on public.partner_searches
  for each row execute function public.link_partner_search();

-- the searches already entered: to their colleagues
update public.partner_searches s
set partner_id = public.partner_for(s.organization_id, s.broker_name, s.phone, s.email, s.agency, s.created_by)
where s.partner_id is null and nullif(btrim(coalesce(s.phone, '')), '') is not null;

-- "… opened the listing": a colleague's name (and agency) when the link was theirs
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
  returning id, organization_id, property_id, client_id, partner_id, created_by, views into share;

  if share.id is not null and share.views = 1 and share.created_by is not null then
    perform public.notify(
      share.organization_id, share.created_by, null, 'share_viewed',
      jsonb_build_object(
        'title', (select title from public.properties where id = share.property_id),
        'actor', coalesce(
          (select full_name from public.clients where id = share.client_id),
          (select full_name || coalesce(' (' || agency || ')', '') from public.partners where id = share.partner_id)
        )
      ),
      '/properties/' || share.property_id
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Each listing's marketing plan
-- ---------------------------------------------------------------------

-- the agency's template: [{ "key": "photos" }, …, { "key": "colleagues", "weekly": true }, { "key": "c-…", "label": "…" }]
alter table public.organizations add column marketing_template jsonb not null default '[
  {"key": "photos"}, {"key": "video"}, {"key": "drone"}, {"key": "tour3d"}, {"key": "portals"},
  {"key": "social"}, {"key": "ads"}, {"key": "sign"}, {"key": "flyers"}, {"key": "open_house"},
  {"key": "colleagues", "weekly": true}, {"key": "farming"}, {"key": "buyers"}, {"key": "owner_report"}
]'::jsonb check (jsonb_typeof(marketing_template) = 'array');

-- a listing's own: the template's points left out, and its own points added
alter table public.properties
  add column marketing_hidden text[] not null default '{}',
  add column marketing_extra jsonb not null default '[]'::jsonb check (jsonb_typeof(marketing_extra) = 'array');

-- what was done, and when (a weekly point: every week)
create table public.marketing_done (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 60),
  done_on date not null default public.sofia_today(),
  done_by uuid references public.profiles (id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  -- ticked by BRIXA itself (a link shared, an open house, a report)
  auto boolean not null default false,
  created_at timestamptz not null default now()
);

create index marketing_done_property_idx on public.marketing_done (property_id, key, done_on desc);
create unique index marketing_done_auto_once on public.marketing_done (property_id, key, done_on) where auto;

alter table public.marketing_done enable row level security;

create policy "marketing done: read" on public.marketing_done
  for select to authenticated using (public.is_org_member(organization_id));
create policy "marketing done: create" on public.marketing_done
  for insert to authenticated
  with check (
    done_by = auth.uid() and not auto
    and public.can_edit_property(property_id)
    and exists (select 1 from public.properties p where p.id = property_id and p.organization_id = marketing_done.organization_id)
  );
create policy "marketing done: delete" on public.marketing_done
  for delete to authenticated using (public.can_edit_property(property_id));

-- BRIXA ticks what it sees: a link to a colleague / to a client, an open house, a report to the owner
create or replace function public.tick_marketing(target_property uuid, point text, on_day date, who uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.marketing_done (organization_id, property_id, key, done_on, done_by, auto)
  select p.organization_id, p.id, point, on_day, who, true
  from public.properties p
  where p.id = target_property
  on conflict (property_id, key, done_on) where auto do nothing;
$$;

revoke execute on function public.tick_marketing(uuid, text, date, uuid) from public, anon, authenticated;

create or replace function public.marketing_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'property_shares' then
    if new.partner_id is not null then
      perform public.tick_marketing(new.property_id, 'colleagues', public.sofia_today(), new.created_by);
    elsif new.client_id is not null then
      perform public.tick_marketing(new.property_id, 'buyers', public.sofia_today(), new.created_by);
    end if;
  elsif tg_table_name = 'open_houses' then
    perform public.tick_marketing(new.property_id, 'open_house', new.day, new.host_id);
  elsif tg_table_name = 'owner_reports' then
    perform public.tick_marketing(new.property_id, 'owner_report', public.sofia_today(), new.created_by);
  end if;
  return null;
end;
$$;

revoke execute on function public.marketing_on_event() from public, anon, authenticated;

create trigger property_shares_marketing after insert on public.property_shares
  for each row execute function public.marketing_on_event();
create trigger open_houses_marketing after insert on public.open_houses
  for each row execute function public.marketing_on_event();
create trigger owner_reports_marketing after insert on public.owner_reports
  for each row execute function public.marketing_on_event();

-- A manager saves the agency's template (the points, in order; custom ones with their words).
create or replace function public.set_marketing_template(target_org uuid, items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_manager(target_org) then
    raise exception 'not allowed';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 40 or exists (
    select 1 from jsonb_array_elements(items) x
    where jsonb_typeof(x) <> 'object'
       or char_length(coalesce(x->>'key', '')) not between 1 and 60
       or char_length(coalesce(x->>'label', '')) > 80
  ) then
    raise exception 'bad template';
  end if;
  update public.organizations set marketing_template = items where id = target_org;
end;
$$;

revoke execute on function public.set_marketing_template(uuid, jsonb) from public, anon;
grant execute on function public.set_marketing_template(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Every Monday: one task per broker — this week's marketing
-- ---------------------------------------------------------------------
alter table public.tasks drop constraint if exists tasks_occasion_check;
alter table public.tasks add constraint tasks_occasion_check check (occasion is null or occasion in ('birthday', 'anniversary', 'marketing'));

-- the words of the template's own points (the tasks are written in Bulgarian)
create or replace function public.marketing_label(point jsonb)
returns text
language sql
immutable
as $$
  select coalesce(nullif(point->>'label', ''), case point->>'key'
    when 'photos' then 'Професионални снимки'
    when 'video' then 'Видео'
    when 'drone' then 'Видео с дрон'
    when 'tour3d' then '3D тур'
    when 'portals' then 'Обява в порталите'
    when 'social' then 'Социални мрежи'
    when 'ads' then 'Платена реклама'
    when 'sign' then 'Табела „Продава се“'
    when 'flyers' then 'Флаери'
    when 'open_house' then 'Отворени врати'
    when 'colleagues' then 'Споделяне с колеги'
    when 'farming' then 'Фарминг в квартала'
    when 'buyers' then 'Предложен на купувачи от базата'
    when 'owner_report' then 'Отчет към собственика'
    else point->>'key' end);
$$;

create or replace function public.create_marketing_tasks()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.sofia_today();
  week_start date := public.sofia_today() - (extract(isodow from public.sofia_today())::int - 1);
  b record;
  made int := 0;
begin
  for b in
    with plan as (
      select p.organization_id, p.responsible_broker_id as broker, p.id as property_id, p.title, x.point
      from public.properties p
      join public.organizations o on o.id = p.organization_id
      cross join lateral (
        select t.point from jsonb_array_elements(o.marketing_template) as t(point)
        union all
        select e.point from jsonb_array_elements(p.marketing_extra) as e(point)
      ) x
      where p.status in ('active', 'reserved')
        and p.responsible_broker_id is not null
        and coalesce((x.point->>'weekly')::boolean, false)
        and not ((x.point->>'key') = any (p.marketing_hidden))
        -- not done yet this week
        and not exists (
          select 1 from public.marketing_done d
          where d.property_id = p.id and d.key = x.point->>'key' and d.done_on >= week_start
        )
    )
    select organization_id, broker,
      count(distinct property_id) as listings,
      string_agg('• ' || title || ' — ' || public.marketing_label(point), E'\n' order by title) as lines
    from plan
    group by organization_id, broker
  loop
    if not exists (
      select 1 from public.tasks
      where assigned_to = b.broker and occasion = 'marketing' and due_date = today
    ) then
      insert into public.tasks (organization_id, assigned_to, title, description, type, due_date, occasion)
      values (
        b.organization_id, b.broker,
        'Седмичен маркетинг: ' || b.listings || case when b.listings = 1 then ' имот' else ' имота' end,
        left(b.lines, 2000), 'other', today, 'marketing'
      );
      made := made + 1;
    end if;
  end loop;
  return made;
end;
$$;

revoke execute on function public.create_marketing_tasks() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Mondays, 8:00 Sofia (summer time)
    perform cron.schedule('brixa-marketing-monday', '0 5 * * 1', 'select public.create_marketing_tasks()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- The owner's report: what we did, and the funnel
-- ---------------------------------------------------------------------
create or replace function public.owner_report_marketing(report_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select r.property_id, r.period_start, r.period_end
    from public.owner_reports r
    where r.token = report_token and r.revoked_at is null
  ),
  plan as (
    select x.point, x.n
    from r
    join public.properties p on p.id = r.property_id
    join public.organizations o on o.id = p.organization_id
    cross join lateral (
      select t.point, t.n from jsonb_array_elements(o.marketing_template) with ordinality as t(point, n)
      union all
      select e.point, 1000 + e.n from jsonb_array_elements(p.marketing_extra) with ordinality as e(point, n)
    ) x
    where not ((x.point->>'key') = any (p.marketing_hidden))
  )
  select jsonb_build_object(
    'plan', coalesce((
      select jsonb_agg(jsonb_build_object(
          'key', pl.point->>'key',
          'label', pl.point->>'label',
          'weekly', coalesce((pl.point->>'weekly')::boolean, false),
          'times', (select count(*) from public.marketing_done d, r
                    where d.property_id = r.property_id and d.key = pl.point->>'key'
                      and d.done_on between r.period_start and r.period_end),
          'last', (select max(d.done_on) from public.marketing_done d, r
                   where d.property_id = r.property_id and d.key = pl.point->>'key' and d.done_on <= r.period_end)
        ) order by pl.n)
      from plan pl), '[]'::jsonb),
    'funnel', (
      select jsonb_build_object(
        'colleagues_shared', count(*) filter (where s.partner_id is not null),
        'colleagues_opened', count(*) filter (where s.partner_id is not null and s.views > 0),
        'buyers_shared', count(*) filter (where s.client_id is not null),
        'buyers_opened', count(*) filter (where s.client_id is not null and s.views > 0),
        'colleague_calls', (select count(*) from public.activities a, r
                            where a.property_id = r.property_id and a.partner_id is not null
                              and (a.occurred_at at time zone 'Europe/Sofia')::date between r.period_start and r.period_end)
      )
      from r
      left join public.property_shares s
        on s.property_id = r.property_id
       and (s.created_at at time zone 'Europe/Sofia')::date between r.period_start and r.period_end
    )
  )
  from r;
$$;

grant execute on function public.owner_report_marketing(uuid) to anon, authenticated;
