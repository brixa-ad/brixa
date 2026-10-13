-- =====================================================================
-- BRIXA — migration 065: the legal documents
--   * which version of the terms each agency accepted, and a button for the
--     owner to accept a new version (the date and the version are kept);
--   * BRIXA's VAT number and representative, shown with its details on the
--     legal pages (Electronic Commerce Act, чл. 4).
-- Run once in Supabase → SQL Editor → New query → Run (after 064).
-- =====================================================================

alter table public.organizations
  add column if not exists terms_version text
    check (terms_version is null or terms_version ~ '^\d{4}-\d{2}-\d{2}$');

alter table public.platform_settings
  add column if not exists vat_number text
    check (vat_number is null or char_length(vat_number) <= 20),
  add column if not exists representative text
    check (representative is null or char_length(representative) <= 200);

-- only BRIXA changes an agency's trial, payments and accepted terms — or the owner, through accept_terms
create or replace function public.guard_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.trial_ends_at, new.plan_code, new.paid_until, new.comped, new.terms_accepted_at, new.terms_version)
     is distinct from (old.trial_ends_at, old.plan_code, old.paid_until, old.comped, old.terms_accepted_at, old.terms_version)
     and auth.uid() is not null and not public.is_platform_admin()
     and coalesce(current_setting('brixa.accepting_terms', true), '') <> 'on' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- the agency's owner accepts the documents' current version (the date is kept)
create or replace function public.accept_terms(version text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  if version is null or version !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at
  limit 1;
  if org is null then
    return false;
  end if;
  perform set_config('brixa.accepting_terms', 'on', true);
  update public.organizations
  set terms_accepted_at = now(), terms_version = version
  where id = org;
  perform set_config('brixa.accepting_terms', 'off', true);
  return true;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- signing up keeps the version accepted
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

  insert into public.organizations (name, kind, eik, legal_name, city, address, phone, email, website, terms_accepted_at, terms_version)
  values (
    agency_name, account,
    case when clean_eik ~ '^[0-9]{9}([0-9]{4})?$' then clean_eik end,
    left(nullif(btrim(coalesce(meta ->> 'legal_name', '')), ''), 200),
    left(nullif(btrim(coalesce(meta ->> 'city', '')), ''), 80),
    left(nullif(btrim(coalesce(meta ->> 'address', '')), ''), 300),
    left(nullif(btrim(coalesce(meta ->> 'agency_phone', '')), ''), 40),
    left(new.email, 200),
    left(nullif(btrim(coalesce(meta ->> 'website', '')), ''), 200),
    case when meta ->> 'accepted_terms' = 'yes' then now() end,
    case when meta ->> 'accepted_terms' = 'yes' and coalesce(meta ->> 'terms_version', '') ~ '^\d{4}-\d{2}-\d{2}$' then meta ->> 'terms_version' end
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
