-- =====================================================================
-- BRIXA — migration 002: roles (owner / manager / broker) and visibility
--
-- Run once in Supabase → SQL Editor on a database created with the
-- original schema.sql. (A fresh install gets all of this from schema.sql.)
--
--   owner    — created the agency; everything, incl. managing managers
--   manager  — sees every property, invites/removes brokers
--   broker   — sees and edits only the properties they are responsible for
-- =====================================================================

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
alter table public.organization_members drop constraint organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check check (role in ('owner', 'manager', 'broker'));

alter table public.organization_invitations drop constraint organization_invitations_role_check;
alter table public.organization_invitations
  add constraint organization_invitations_role_check check (role in ('manager', 'broker'));

create index if not exists properties_broker_idx on public.properties (responsible_broker_id);

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------
create or replace function public.is_org_manager(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org and profile_id = auth.uid() and role in ('owner', 'manager')
  );
$$;

-- Managers: any property of their agency. Brokers: only their own.
create or replace function public.can_access_property(target_property uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties p
    join public.organization_members m on m.organization_id = p.organization_id
    where p.id = target_property
      and m.profile_id = auth.uid()
      and (m.role in ('owner', 'manager') or p.responsible_broker_id = auth.uid())
  );
$$;

-- Storage paths are <organization_id>/<property_id>/<file>
create or replace function public.can_access_photo_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.properties p
    join public.organization_members m on m.organization_id = p.organization_id
    where array_length(string_to_array(object_name, '/'), 1) = 3
      and p.organization_id::text = split_part(object_name, '/', 1)
      and p.id::text = split_part(object_name, '/', 2)
      and m.profile_id = auth.uid()
      and (m.role in ('owner', 'manager') or p.responsible_broker_id = auth.uid())
  );
$$;

-- Remove a colleague and hand their properties to someone else, atomically.
create or replace function public.remove_member(target_org uuid, target_profile uuid, reassign_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  target_role text;
begin
  select role into caller_role from public.organization_members
  where organization_id = target_org and profile_id = auth.uid();

  select role into target_role from public.organization_members
  where organization_id = target_org and profile_id = target_profile;

  if target_role is null then raise exception 'not_a_member'; end if;
  if target_profile = auth.uid() then raise exception 'cannot_remove_self'; end if;
  if target_role = 'owner' then raise exception 'cannot_remove_owner'; end if;
  if not (caller_role = 'owner' or (caller_role = 'manager' and target_role = 'broker')) then
    raise exception 'forbidden';
  end if;
  if reassign_to is null
     or reassign_to = target_profile
     or not exists (
       select 1 from public.organization_members
       where organization_id = target_org and profile_id = reassign_to
     ) then
    raise exception 'invalid_reassign';
  end if;

  update public.properties
  set responsible_broker_id = reassign_to
  where organization_id = target_org and responsible_broker_id = target_profile;

  delete from public.organization_members
  where organization_id = target_org and profile_id = target_profile;
end;
$$;

-- Only the owner promotes / demotes (never to or from owner).
create or replace function public.set_member_role(target_org uuid, target_profile uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_owner(target_org) then raise exception 'forbidden'; end if;
  if new_role not in ('manager', 'broker') then raise exception 'invalid_role'; end if;

  update public.organization_members
  set role = new_role
  where organization_id = target_org and profile_id = target_profile and role <> 'owner';

  if not found then raise exception 'not_found'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Policies: members & invitations
-- ---------------------------------------------------------------------
drop policy "members: owners remove brokers" on public.organization_members;
-- (removal now only through remove_member(), which also reassigns properties)

drop policy "invitations: owners read" on public.organization_invitations;
drop policy "invitations: owners create" on public.organization_invitations;
drop policy "invitations: owners delete" on public.organization_invitations;

create policy "invitations: managers read" on public.organization_invitations
  for select to authenticated using (public.is_org_manager(organization_id));

create policy "invitations: managers create" on public.organization_invitations
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and (
      public.is_org_owner(organization_id)
      or (public.is_org_manager(organization_id) and role = 'broker')
    )
  );

create policy "invitations: managers delete" on public.organization_invitations
  for delete to authenticated using (public.is_org_manager(organization_id));

-- ---------------------------------------------------------------------
-- Policies: properties
-- ---------------------------------------------------------------------
drop policy "properties: members read" on public.properties;
drop policy "properties: members create" on public.properties;
drop policy "properties: members update" on public.properties;
drop policy "properties: members delete" on public.properties;

create policy "properties: read own or as manager" on public.properties
  for select to authenticated
  using (
    public.is_org_manager(organization_id)
    or (public.is_org_member(organization_id) and responsible_broker_id = auth.uid())
  );

create policy "properties: create own or as manager" on public.properties
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_org_manager(organization_id)
      or (public.is_org_member(organization_id) and responsible_broker_id = auth.uid())
    )
  );

-- A broker can edit their own property but cannot hand it to someone else.
create policy "properties: update own or as manager" on public.properties
  for update to authenticated
  using (
    public.is_org_manager(organization_id)
    or (public.is_org_member(organization_id) and responsible_broker_id = auth.uid())
  )
  with check (
    public.is_org_manager(organization_id)
    or (public.is_org_member(organization_id) and responsible_broker_id = auth.uid())
  );

create policy "properties: managers delete" on public.properties
  for delete to authenticated using (public.is_org_manager(organization_id));

-- ---------------------------------------------------------------------
-- Policies: photo files (per property, not per agency folder)
-- ---------------------------------------------------------------------
drop policy "property photos: members read" on storage.objects;
drop policy "property photos: members upload" on storage.objects;
drop policy "property photos: members delete" on storage.objects;

create policy "property photos: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'property-photos' and public.can_access_photo_path(name));

create policy "property photos: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-photos' and public.can_access_photo_path(name));

create policy "property photos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-photos' and public.can_access_photo_path(name));
