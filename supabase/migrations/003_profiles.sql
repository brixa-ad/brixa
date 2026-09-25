-- =====================================================================
-- BRIXA — migration 003: broker profiles (photo, phone, title, bio, areas)
-- Run once in Supabase → SQL Editor after 002_roles.sql.
-- =====================================================================

alter table public.profiles
  add column phone text check (phone is null or char_length(phone) <= 40),
  add column job_title text check (job_title is null or char_length(job_title) <= 80),
  add column bio text check (bio is null or char_length(bio) <= 1000),
  add column areas text[] not null default '{}' check (cardinality(areas) <= 20),
  add column avatar_path text;

-- The avatar must live in the user's own folder: avatars/<profile id>/<file>
alter table public.profiles
  add constraint profiles_avatar_path_check
  check (avatar_path is null or avatar_path like id::text || '/%');

-- Email and id come from sign-up; users edit everything else on their profile.
create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  new.email := old.email;
  return new;
end;
$$;

create trigger profiles_protect_identity
  before update on public.profiles
  for each row execute function public.protect_profile_identity();

-- ---------------------------------------------------------------------
-- Storage: public bucket for profile photos, each user writes only
-- into their own folder  avatars/<profile id>/<file>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

create policy "avatars: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

create policy "avatars: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
