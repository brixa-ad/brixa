-- =====================================================================
-- BRIXA — премахва примерния екип (demo_team.sql) и всичко негово:
-- сделки, имоти, купувачи, обаждания, цели и известия.
--
-- Supabase → SQL Editor → New query → поставете целия файл → Run.
-- =====================================================================
do $$
declare
  ids uuid[];
begin
  select array_agg(id) into ids from auth.users where email like '%@demo.brixa.invalid';
  if ids is null then return; end if;

  delete from public.deals where broker_id = any (ids) or created_by = any (ids);
  delete from public.properties where created_by = any (ids);
  delete from public.clients where created_by = any (ids);
  delete from public.notifications where actor_id = any (ids);
  delete from public.organization_invitations where email like '%@demo.brixa.invalid';
  -- profiles, memberships, goals and activities go with the users
  delete from auth.users where id = any (ids);
end;
$$;
