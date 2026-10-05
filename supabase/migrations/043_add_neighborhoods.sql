-- =====================================================================
-- BRIXA — migration 043: neighbourhoods added from a pasted price table
--   • pasting a portal's average prices in Market adds the neighbourhoods the
--     town doesn't have yet (the owner or an office manager), so their prices
--     are kept at once and listings can be placed in them
--   • villages ("с. …") and towns are places of their own — never added as neighbourhoods
-- Run once in Supabase → SQL Editor → New query → Run (after 042).
-- =====================================================================

create or replace function public.add_neighborhoods(target_settlement uuid, names text[])
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  raw text;
  clean text;
begin
  if not exists (
    select 1 from public.organization_members m
    where m.profile_id = auth.uid() and m.role in ('owner', 'office_manager')
  ) then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.geo_settlements s where s.id = target_settlement) then
    raise exception 'unknown_settlement';
  end if;

  foreach raw in array coalesce(names[1:80], '{}') loop
    clean := regexp_replace(btrim(coalesce(raw, '')), '\s+', ' ', 'g');
    continue when char_length(clean) not between 2 and 80
      or clean ~* '^(с\.|село |гр\.|град )'
      or clean !~ '[A-Za-zА-Яа-яЁё]';
    if not exists (
      select 1 from public.geo_neighborhoods n
      where n.settlement_id = target_settlement and lower(n.name) = lower(clean)
    ) then
      insert into public.geo_neighborhoods (settlement_id, name) values (target_settlement, clean);
    end if;
    return query
      select n.id, n.name from public.geo_neighborhoods n
      where n.settlement_id = target_settlement and lower(n.name) = lower(clean)
      limit 1;
  end loop;
end;
$$;

revoke execute on function public.add_neighborhoods(uuid, text[]) from public, anon;
grant execute on function public.add_neighborhoods(uuid, text[]) to authenticated;
