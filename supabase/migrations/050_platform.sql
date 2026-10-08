-- =====================================================================
-- BRIXA — migration 050: BRIXA for other agencies
-- Packages by size (how many people, for how much a month), 30 days to try BRIXA free, the date
-- an agency has paid until (set by hand for now, by whoever runs BRIXA), BRIXA's own panel of
-- every agency, and the agency's yes to the terms when it signs up.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Who runs BRIXA itself: sees every agency in the panel
-- ---------------------------------------------------------------------
create table public.platform_admins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
-- (no policies: read only through is_platform_admin())

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where profile_id = auth.uid());
$$;

revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- the first agency's owner runs BRIXA
insert into public.platform_admins (profile_id)
select m.profile_id
from public.organization_members m
where m.role = 'owner'
order by m.created_at
limit 1
on conflict do nothing;

-- ---------------------------------------------------------------------
-- BRIXA's own details (on the landing page, the terms and the "time to pay" page)
-- ---------------------------------------------------------------------
create table public.platform_settings (
  id boolean primary key default true check (id),
  company_name text check (company_name is null or char_length(company_name) <= 200),
  eik text check (eik is null or eik ~ '^[0-9]{9}([0-9]{4})?$'),
  address text check (address is null or char_length(address) <= 300),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  website text check (website is null or char_length(website) <= 200),
  -- how long a new agency tries BRIXA for free
  trial_days int not null default 30 check (trial_days between 0 and 365),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (true) on conflict do nothing;

alter table public.platform_settings enable row level security;

create policy "platform settings: anyone reads" on public.platform_settings
  for select to anon, authenticated using (true);

create policy "platform settings: BRIXA updates" on public.platform_settings
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select on public.platform_settings to anon;

-- ---------------------------------------------------------------------
-- The packages: up to how many people, for how much a month
-- ---------------------------------------------------------------------
create table public.plans (
  code text primary key check (code ~ '^[a-z0-9_]{2,20}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  -- null: no limit
  max_people int check (max_people is null or max_people between 1 and 10000),
  price_month numeric(10, 2) not null check (price_month >= 0 and price_month < 100000),
  position int not null default 0,
  active boolean not null default true
);

insert into public.plans (code, name, max_people, price_month, position) values
  ('solo', 'Соло', 1, 19, 1),
  ('start', 'Старт', 5, 59, 2),
  ('team', 'Екип', 15, 129, 3),
  ('agency', 'Агенция', null, 249, 4)
on conflict do nothing;

alter table public.plans enable row level security;

create policy "plans: anyone reads" on public.plans
  for select to anon, authenticated using (true);

create policy "plans: BRIXA adds" on public.plans
  for insert to authenticated with check (public.is_platform_admin());

create policy "plans: BRIXA changes" on public.plans
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select on public.plans to anon;

-- ---------------------------------------------------------------------
-- An agency's subscription
-- ---------------------------------------------------------------------
alter table public.organizations
  add column trial_ends_at timestamptz,
  add column plan_code text references public.plans (code) on update cascade,
  -- paid up to and including this day (set by BRIXA by hand for now)
  add column paid_until date,
  -- free for good (Явлена; a partner)
  add column comped boolean not null default false,
  add column terms_accepted_at timestamptz;

-- a new agency tries BRIXA for the days BRIXA gives
create or replace function public.start_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.trial_ends_at is null then
    new.trial_ends_at := now() + make_interval(days => coalesce((select trial_days from public.platform_settings), 30));
  end if;
  return new;
end;
$$;

revoke execute on function public.start_trial() from public, anon, authenticated;

create trigger organizations_start_trial
  before insert on public.organizations
  for each row execute function public.start_trial();

-- only BRIXA changes what an agency pays (the agency's owner may change the rest of the row)
create or replace function public.guard_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.trial_ends_at, new.plan_code, new.paid_until, new.comped, new.terms_accepted_at)
     is distinct from (old.trial_ends_at, old.plan_code, old.paid_until, old.comped, old.terms_accepted_at)
     and auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_subscription() from public, anon, authenticated;

create trigger organizations_guard_subscription
  before update on public.organizations
  for each row execute function public.guard_subscription();

-- the agencies already here: 30 days from today; the first one (Явлена) is free for good
update public.organizations set trial_ends_at = now() + interval '30 days' where trial_ends_at is null;
update public.organizations set comped = true
where id = (select organization_id from public.organization_members order by created_at limit 1);

-- a package's limit: no inviting more people than it has room for (the trial has no limit)
create or replace function public.check_plan_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room int;
  taken int;
begin
  select p.max_people into room
  from public.organizations o join public.plans p on p.code = o.plan_code
  where o.id = new.organization_id and not o.comped;
  if room is null then return new; end if;
  select (select count(*) from public.organization_members where organization_id = new.organization_id)
       + (select count(*) from public.organization_invitations where organization_id = new.organization_id and accepted_at is null)
  into taken;
  if taken >= room then
    raise exception 'plan_limit' using errcode = 'P0001', hint = room::text;
  end if;
  return new;
end;
$$;

revoke execute on function public.check_plan_room() from public, anon, authenticated;

create trigger organization_invitations_plan_room
  before insert on public.organization_invitations
  for each row execute function public.check_plan_room();

-- ---------------------------------------------------------------------
-- Sign-up: the agency's yes to the terms; the very first person to sign up runs BRIXA
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite record;
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  new_org_id uuid;
  first_office uuid;
  account text := case when meta ->> 'account_type' = 'solo' then 'solo' else 'agency' end;
  agency_name text;
  clean_eik text := nullif(regexp_replace(coalesce(meta ->> 'eik', ''), '\D', '', 'g'), '');
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id, new.email, nullif(meta ->> 'full_name', ''),
    left(nullif(btrim(coalesce(meta ->> 'phone', '')), ''), 40)
  );

  select * into invite
  from public.organization_invitations
  where lower(email) = lower(new.email) and accepted_at is null
  order by created_at
  limit 1;

  if found then
    -- the team's office goes with the team
    insert into public.organization_members (organization_id, profile_id, role, office_id, team_id)
    values (
      invite.organization_id, new.id, invite.role,
      coalesce((select office_id from public.teams where id = invite.team_id), invite.office_id),
      invite.team_id
    );
    -- invited to lead a team: the team is theirs (if it has no manager yet)
    if invite.role = 'manager' and invite.team_id is not null then
      update public.teams set manager_id = new.id where id = invite.team_id and manager_id is null;
    end if;
    update public.organization_invitations set accepted_at = now() where id = invite.id;
    return new;
  end if;

  agency_name := left(coalesce(
    nullif(btrim(meta ->> 'agency_name'), ''),
    nullif(btrim(meta ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  ), 120);

  insert into public.organizations (name, kind, eik, legal_name, city, address, phone, email, website, terms_accepted_at)
  values (
    agency_name, account,
    case when clean_eik ~ '^[0-9]{9}([0-9]{4})?$' then clean_eik end,
    left(nullif(btrim(coalesce(meta ->> 'legal_name', '')), ''), 200),
    left(nullif(btrim(coalesce(meta ->> 'city', '')), ''), 80),
    left(nullif(btrim(coalesce(meta ->> 'address', '')), ''), 300),
    left(nullif(btrim(coalesce(meta ->> 'agency_phone', '')), ''), 40),
    left(new.email, 200),
    left(nullif(btrim(coalesce(meta ->> 'website', '')), ''), 200),
    case when meta ->> 'accepted_terms' = 'yes' then now() end
  )
  returning id into new_org_id;

  -- an agency starts with its first office (where it is)
  if account = 'agency' then
    insert into public.offices (organization_id, name, city, address, phone)
    values (
      new_org_id,
      case when char_length(btrim(coalesce(meta ->> 'city', ''))) >= 2 then left(btrim(meta ->> 'city'), 80) else 'Централен офис' end,
      left(nullif(btrim(coalesce(meta ->> 'city', '')), ''), 80),
      left(nullif(btrim(coalesce(meta ->> 'address', '')), ''), 200),
      left(nullif(btrim(coalesce(meta ->> 'agency_phone', '')), ''), 40)
    )
    returning id into first_office;
  end if;

  insert into public.organization_members (organization_id, profile_id, role, office_id)
  values (new_org_id, new.id, 'owner', first_office);

  -- a brand-new BRIXA: whoever signs up first runs it (and their agency is free)
  if not exists (select 1 from public.platform_admins) then
    insert into public.platform_admins (profile_id) values (new.id);
    update public.organizations set comped = true where id = new_org_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- BRIXA's panel: every agency, how it uses BRIXA, and what it pays
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
        'comped', o.comped, 'terms_accepted_at', o.terms_accepted_at,
        'owner', (
          select jsonb_build_object('name', coalesce(pr.full_name, pr.email), 'email', pr.email, 'phone', pr.phone)
          from public.organization_members m join public.profiles pr on pr.id = m.profile_id
          where m.organization_id = o.id and m.role = 'owner'
          order by m.created_at limit 1),
        'people', (select count(*) from public.organization_members m where m.organization_id = o.id),
        'invited', (select count(*) from public.organization_invitations i where i.organization_id = o.id and i.accepted_at is null),
        'listings', (select count(*) from public.properties p where p.organization_id = o.id),
        'clients', (select count(*) from public.clients c where c.organization_id = o.id),
        'deals', (select count(*) from public.deals d where d.organization_id = o.id),
        'last_sign_in', (
          select max(u.last_sign_in_at)
          from public.organization_members m join auth.users u on u.id = m.profile_id
          where m.organization_id = o.id),
        'last_activity', greatest(
          (select max(a.created_at) from public.activities a where a.organization_id = o.id),
          (select max(p.created_at) from public.properties p where p.organization_id = o.id),
          (select max(c.created_at) from public.clients c where c.organization_id = o.id))
      ) order by o.created_at desc)
    from public.organizations o
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.platform_agencies() from public, anon;
grant execute on function public.platform_agencies() to authenticated;

-- BRIXA sets an agency's package, the day it has paid until, free for good, or a longer trial.
create or replace function public.platform_set_agency(
  target_org uuid,
  new_plan text,
  new_paid_until date,
  new_comped boolean,
  new_trial_ends date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.organizations
  set plan_code = nullif(new_plan, ''),
      paid_until = new_paid_until,
      comped = coalesce(new_comped, false),
      -- the trial ends at the end of that day (Sofia)
      trial_ends_at = case when new_trial_ends is null then trial_ends_at
        else ((new_trial_ends + 1)::timestamp at time zone 'Europe/Sofia') end
  where id = target_org;
end;
$$;

revoke execute on function public.platform_set_agency(uuid, text, date, boolean, date) from public, anon;
grant execute on function public.platform_set_agency(uuid, text, date, boolean, date) to authenticated;

-- ---------------------------------------------------------------------
-- BRIXA hears: a new agency signed up; an agency wants a package
-- ---------------------------------------------------------------------
create or replace function public.tell_platform(kind text, payload jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  select public.notify(
    (select m.organization_id from public.organization_members m where m.profile_id = a.profile_id order by m.created_at limit 1),
    a.profile_id, null, kind, payload, '/admin')
  from public.platform_admins a
  where exists (select 1 from public.organization_members m where m.profile_id = a.profile_id);
$$;

revoke execute on function public.tell_platform(text, jsonb) from public, anon, authenticated;

create or replace function public.platform_on_new_agency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- the owner of a new agency (not someone joining by invitation, not BRIXA's own first agency)
  if new.role = 'owner'
     and not exists (select 1 from public.platform_admins where profile_id = new.profile_id)
     and not exists (select 1 from public.organization_members m where m.organization_id = new.organization_id and m.profile_id <> new.profile_id) then
    perform public.tell_platform('agency_signed_up', jsonb_build_object(
      'title', (select name from public.organizations where id = new.organization_id),
      'kind', (select kind from public.organizations where id = new.organization_id),
      'actor', public.person_name(new.profile_id)));
  end if;
  return new;
end;
$$;

revoke execute on function public.platform_on_new_agency() from public, anon, authenticated;

create trigger organization_members_tell_platform
  after insert on public.organization_members
  for each row execute function public.platform_on_new_agency();

-- The agency's owner asks for a package: BRIXA hears and gets in touch.
create or replace function public.request_plan(wanted text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
  plan record;
begin
  select m.organization_id into target_org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at limit 1;
  if target_org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into plan from public.plans where code = wanted and active;
  if plan.code is null then
    raise exception 'no_plan';
  end if;
  perform public.tell_platform('plan_requested', jsonb_build_object(
    'title', (select name from public.organizations where id = target_org),
    'plan', plan.name,
    'actor', public.person_name(auth.uid()),
    'phone', (select coalesce(pr.phone, o.phone) from public.profiles pr, public.organizations o where pr.id = auth.uid() and o.id = target_org)));
end;
$$;

revoke execute on function public.request_plan(text) from public, anon;
grant execute on function public.request_plan(text) to authenticated;
