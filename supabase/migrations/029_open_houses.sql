-- =====================================================================
-- BRIXA — migration 029: open houses
--   • an open house for a listing: the day, the hours, the host broker
--   • visitors sign in on their phone (a QR code at the door): they become
--     the host's clients (source "open house"), with their opinion of the
--     price, how they liked the home and what they look for
--   • the preparation tasks belong to the open house
-- Run once in Supabase → SQL Editor → New query → Run (after 028).
-- =====================================================================

-- a new client source
alter table public.clients drop constraint if exists clients_source_check;
alter table public.clients add constraint clients_source_check check (source in (
  'personal', 'referral', 'agency', 'email', 'google', 'facebook', 'instagram', 'tiktok',
  'realistimo', 'billboard', 'flyers', 'banner', 'open_house'
));

create table public.open_houses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  -- the broker who hosts: the visitors become their clients
  host_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  starts_at time not null,
  ends_at time not null,
  -- the key of the sign-in page (the QR code)
  token uuid not null unique default gen_random_uuid(),
  note text check (note is null or char_length(note) <= 1000),
  cancelled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index open_houses_org_idx on public.open_houses (organization_id, day desc);
create index open_houses_property_idx on public.open_houses (property_id, day desc);

create trigger open_houses_touch_updated_at
  before update on public.open_houses
  for each row execute function public.touch_updated_at();

create table public.open_house_visitors (
  id uuid primary key default gen_random_uuid(),
  open_house_id uuid not null references public.open_houses (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 200),
  -- looking for a home, a neighbour, another agent, just looking
  kind text not null check (kind in ('buyer', 'neighbor', 'agent', 'curious')),
  price_opinion text check (price_opinion is null or price_opinion in ('low', 'right', 'high')),
  rating int check (rating is null or rating between 1 and 5),
  liked text check (liked is null or char_length(liked) <= 500),
  looking_for text check (looking_for is null or char_length(looking_for) <= 500),
  consent boolean not null default false,
  created_at timestamptz not null default now()
);

create index open_house_visitors_event_idx on public.open_house_visitors (open_house_id, created_at);

-- the preparation steps
alter table public.tasks
  add column open_house_id uuid references public.open_houses (id) on delete set null;
create index tasks_open_house_idx on public.tasks (open_house_id) where open_house_id is not null;

-- ---------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------
alter table public.open_houses enable row level security;
alter table public.open_house_visitors enable row level security;

-- the agency plans them together (listings are shared inside the agency)
create policy "open houses: read" on public.open_houses
  for select to authenticated
  using (public.is_org_member(organization_id));

-- for an agency listing; brokers host their own, managers pick anyone
create policy "open houses: create" on public.open_houses
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and (host_id = auth.uid() or public.is_org_manager(organization_id))
    and exists (select 1 from public.organization_members m where m.organization_id = open_houses.organization_id and m.profile_id = open_houses.host_id)
    and exists (select 1 from public.properties p where p.id = open_houses.property_id and p.organization_id = open_houses.organization_id)
  );

create policy "open houses: update" on public.open_houses
  for update to authenticated
  using (host_id = auth.uid() or created_by = auth.uid() or public.is_org_manager(organization_id))
  with check (
    exists (select 1 from public.organization_members m where m.organization_id = open_houses.organization_id and m.profile_id = open_houses.host_id)
    and exists (select 1 from public.properties p where p.id = open_houses.property_id and p.organization_id = open_houses.organization_id)
  );

create policy "open houses: delete" on public.open_houses
  for delete to authenticated
  using (created_by = auth.uid() or public.is_org_manager(organization_id));

-- visitors are the host's (and the managers'): they are people's contact details
create policy "open house visitors: read" on public.open_house_visitors
  for select to authenticated
  using (
    public.is_org_manager(organization_id)
    or exists (select 1 from public.open_houses h where h.id = open_house_visitors.open_house_id and h.host_id = auth.uid())
  );

create policy "open house visitors: delete" on public.open_house_visitors
  for delete to authenticated
  using (
    public.is_org_manager(organization_id)
    or exists (select 1 from public.open_houses h where h.id = open_house_visitors.open_house_id and h.host_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- The sign-in page (anyone with the QR code)
-- ---------------------------------------------------------------------
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
        'job_title', pr.job_title, 'avatar_path', pr.avatar_path)
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

-- A visitor signs in: they become the host's client (or an existing client is found by the phone).
create or replace function public.open_house_sign_in(
  house_token uuid,
  visitor_name text,
  visitor_phone text,
  visitor_email text,
  visitor_kind text,
  opinion text,
  stars int,
  liked_most text,
  wants text,
  agreed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  title text;
  found uuid;
  new_client uuid;
  clean_name text := nullif(btrim(visitor_name), '');
  clean_phone text := nullif(btrim(visitor_phone), '');
  clean_email text := nullif(lower(btrim(visitor_email)), '');
begin
  select oh.*, p.title as property_title into h
  from public.open_houses oh join public.properties p on p.id = oh.property_id
  where oh.token = house_token;

  if h.id is null or h.cancelled_at is not null or public.sofia_today() not between h.day and h.day + 1 then
    raise exception 'open_house_closed';
  end if;
  if not coalesce(agreed, false) then raise exception 'consent_required'; end if;
  if clean_name is null or char_length(clean_name) not between 2 and 120 then raise exception 'name_required'; end if;
  if clean_phone is null and clean_email is null then raise exception 'contact_required'; end if;
  if visitor_kind not in ('buyer', 'neighbor', 'agent', 'curious') then raise exception 'invalid_kind'; end if;
  if (select count(*) from public.open_house_visitors v where v.open_house_id = h.id) >= 300 then
    raise exception 'too_many';
  end if;
  title := h.property_title;

  -- everyone except other agents becomes (or already is) a client
  if visitor_kind <> 'agent' then
    if clean_phone is not null then
      select c.id into found from public.clients c
      where c.organization_id = h.organization_id and c.phone_normalized = public.normalize_phone(clean_phone);
    end if;
    if found is null then
      insert into public.clients (
        organization_id, responsible_broker_id, created_by, full_name, phone, email, types, source, stage, notes
      ) values (
        h.organization_id, h.host_id, h.host_id, clean_name, left(clean_phone, 40), left(clean_email, 200),
        case when visitor_kind = 'neighbor' then array['seller'] else array['buyer'] end,
        'open_house', 'new_contact',
        left(concat_ws(E'\n',
          'Отворени врати: ' || title || ' (' || to_char(h.day, 'DD.MM.YYYY') || ')',
          case when nullif(btrim(wants), '') is not null then 'Търси: ' || btrim(wants) end,
          case when nullif(btrim(liked_most), '') is not null then 'Хареса: ' || btrim(liked_most) end
        ), 5000)
      )
      returning id into new_client;
    end if;
  end if;

  insert into public.open_house_visitors (
    open_house_id, organization_id, client_id, full_name, phone, email, kind, price_opinion, rating, liked, looking_for, consent
  ) values (
    h.id, h.organization_id, coalesce(new_client, found), clean_name, left(clean_phone, 40), left(clean_email, 200), visitor_kind,
    case when opinion in ('low', 'right', 'high') then opinion end,
    case when stars between 1 and 5 then stars end,
    left(nullif(btrim(liked_most), ''), 500),
    left(nullif(btrim(wants), ''), 500),
    true
  );

  -- a brand-new client already tells the host ("you got a client"); anyone else — this does
  if new_client is null then
    perform public.notify(
      h.organization_id, h.host_id, null, 'open_house_visitor',
      jsonb_build_object('title', title, 'actor', clean_name),
      '/open-houses/' || h.id
    );
  end if;
  return true;
end;
$$;

grant execute on function public.open_house_public(uuid) to anon, authenticated;
grant execute on function public.open_house_sign_in(uuid, text, text, text, text, text, int, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------
-- The owner's report: the open houses in its period (no names — numbers and what people liked)
-- ---------------------------------------------------------------------
create or replace function public.owner_report_open_houses(report_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'events', count(distinct h.id),
    'visitors', count(v.id),
    'buyers', count(v.id) filter (where v.kind = 'buyer'),
    'neighbors', count(v.id) filter (where v.kind = 'neighbor'),
    'price_low', count(v.id) filter (where v.price_opinion = 'low'),
    'price_right', count(v.id) filter (where v.price_opinion = 'right'),
    'price_high', count(v.id) filter (where v.price_opinion = 'high'),
    'rating', round(avg(v.rating)::numeric, 1),
    'liked', coalesce(jsonb_agg(v.liked) filter (where v.liked is not null), '[]'::jsonb)
  )
  from public.owner_reports r
  join public.open_houses h
    on h.property_id = r.property_id and h.cancelled_at is null and h.day between r.period_start and r.period_end
  left join public.open_house_visitors v on v.open_house_id = h.id and v.kind <> 'agent'
  where r.token = report_token and r.revoked_at is null;
$$;

grant execute on function public.owner_report_open_houses(uuid) to anon, authenticated;
