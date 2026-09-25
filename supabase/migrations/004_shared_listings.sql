-- =====================================================================
-- BRIXA — migration 004: brokers see every property of their agency
-- (read-only). Editing stays with the responsible broker and managers;
-- deleting stays with managers. Run once after 003_profiles.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- View vs edit helpers
-- ---------------------------------------------------------------------
create or replace function public.can_view_property(target_property uuid)
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
    where p.id = target_property and m.profile_id = auth.uid()
  );
$$;

-- Managers: any property of their agency. Brokers: only their own.
create or replace function public.can_edit_property(target_property uuid)
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
create or replace function public.can_view_photo_path(object_name text)
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
  );
$$;

create or replace function public.can_edit_photo_path(object_name text)
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

-- ---------------------------------------------------------------------
-- properties: every member reads; write rules unchanged
-- ---------------------------------------------------------------------
drop policy "properties: read own or as manager" on public.properties;

create policy "properties: members read" on public.properties
  for select to authenticated using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------
-- feature values, price history, photo rows
-- ---------------------------------------------------------------------
drop policy "feature values: read" on public.property_feature_values;
drop policy "feature values: insert" on public.property_feature_values;
drop policy "feature values: delete" on public.property_feature_values;

create policy "feature values: read" on public.property_feature_values
  for select to authenticated using (public.can_view_property(property_id));
create policy "feature values: insert" on public.property_feature_values
  for insert to authenticated with check (public.can_edit_property(property_id));
create policy "feature values: delete" on public.property_feature_values
  for delete to authenticated using (public.can_edit_property(property_id));

drop policy "price history: read" on public.property_price_history;
create policy "price history: read" on public.property_price_history
  for select to authenticated using (public.can_view_property(property_id));

drop policy "photos: read" on public.property_photos;
drop policy "photos: insert" on public.property_photos;
drop policy "photos: update" on public.property_photos;
drop policy "photos: delete" on public.property_photos;

create policy "photos: read" on public.property_photos
  for select to authenticated using (public.can_view_property(property_id));
create policy "photos: insert" on public.property_photos
  for insert to authenticated
  with check (public.can_edit_property(property_id) and created_by = auth.uid());
create policy "photos: update" on public.property_photos
  for update to authenticated
  using (public.can_edit_property(property_id))
  with check (public.can_edit_property(property_id));
create policy "photos: delete" on public.property_photos
  for delete to authenticated using (public.can_edit_property(property_id));

-- ---------------------------------------------------------------------
-- photo files
-- ---------------------------------------------------------------------
drop policy "property photos: read" on storage.objects;
drop policy "property photos: upload" on storage.objects;
drop policy "property photos: delete" on storage.objects;

create policy "property photos: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'property-photos' and public.can_view_photo_path(name));

create policy "property photos: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-photos' and public.can_edit_photo_path(name));

create policy "property photos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-photos' and public.can_edit_photo_path(name));

-- The old single-purpose helpers are no longer referenced.
drop function public.can_access_property(uuid);
drop function public.can_access_photo_path(text);
