-- =====================================================================
-- BRIXA — migration 018: the owner's report
--   what happened with a listing over a period — viewings, inquiries,
--   links sent to clients, offers, price — as a private link (/r/<token>)
--   the broker sends to the owner. Never any buyer's name.
-- Run once in Supabase → SQL Editor → New query → Run (after 017).
-- =====================================================================

create table public.owner_reports (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  period_start date not null,
  period_end date not null,
  comment text check (comment is null or char_length(comment) <= 2000),
  views int not null default 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index owner_reports_property_idx on public.owner_reports (property_id, created_at desc);

alter table public.owner_reports enable row level security;

-- the listing's broker and the managers
create policy "owner reports: read" on public.owner_reports
  for select to authenticated
  using (public.can_edit_property(property_id));

create policy "owner reports: create" on public.owner_reports
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_edit_property(property_id)
    and exists (
      select 1 from public.properties p
      where p.id = owner_reports.property_id and p.organization_id = owner_reports.organization_id
    )
  );

create policy "owner reports: stop" on public.owner_reports
  for update to authenticated
  using (public.can_edit_property(property_id))
  with check (public.can_edit_property(property_id));

create policy "owner reports: delete" on public.owner_reports
  for delete to authenticated
  using (public.can_edit_property(property_id));

-- ---------------------------------------------------------------------
-- The report page's data: counts and dates, never who the buyers are
-- ---------------------------------------------------------------------
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
    'broker', (
      select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone,
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
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

-- The owner opened it: count it, and tell the broker the first time.
create or replace function public.mark_report_viewed(report_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  report_id uuid;
  report_org uuid;
  report_property uuid;
  report_creator uuid;
  report_views int;
begin
  update public.owner_reports
  set views = views + 1,
      first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now()
  where token = report_token and revoked_at is null
  returning id, organization_id, property_id, created_by, views
  into report_id, report_org, report_property, report_creator, report_views;

  if report_id is not null and report_views = 1 and report_creator is not null then
    perform public.notify(
      report_org, report_creator, null, 'report_viewed',
      jsonb_build_object(
        'title', (select title from public.properties where id = report_property),
        'actor', (select c.full_name from public.properties pp join public.clients c on c.id = pp.owner_client_id
                  where pp.id = report_property)
      ),
      '/properties/' || report_property
    );
  end if;
end;
$$;

grant execute on function public.owner_report(uuid) to anon, authenticated;
grant execute on function public.mark_report_viewed(uuid) to anon, authenticated;

-- The report shows the listing's cover photo too.
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
  );
$$;
