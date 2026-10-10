-- =====================================================================
-- BRIXA — migration 059: the sample data leaves no notifications behind
--   Taking the sample data away also takes what BRIXA said about it: the
--   reminders and "not ticked off" of its tasks, its deals' dates, and the
--   morning brief or missed-tasks notes that named sample clients. Before,
--   only the notifications about sample listings and clients went, and the
--   rest led to pages that no longer exist.
--   Once now: such leftovers in agencies that already took their samples away.
-- Run once in Supabase → SQL Editor → New query → Run (after 058).
-- =====================================================================

create or replace function public.remove_sample_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  since date;
begin
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at limit 1;
  if org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select sample_since into since from public.organizations where id = org;

  perform set_config('brixa.importing', 'on', true);
  -- what BRIXA said about the samples: anything leading to one of them, and the notes naming them
  delete from public.notifications n
  where n.organization_id = org
    and (
      n.link ~ any (array(
        select '^/properties/' || id::text from public.properties where organization_id = org and sample
        union all
        select '^/clients/' || id::text from public.clients where organization_id = org and sample
        union all
        select '^/tasks/' || t.id::text from public.tasks t
        where t.organization_id = org
          and (t.sample
            or t.property_id in (select id from public.properties where organization_id = org and sample)
            or t.client_id in (select id from public.clients where organization_id = org and sample))
        union all
        select '^/deals/' || d.id::text from public.deals d
        where d.organization_id = org
          and (d.sample
            or d.property_id in (select id from public.properties where organization_id = org and sample)
            or d.client_id in (select id from public.clients where organization_id = org and sample))
      ))
      or (since is not null and n.created_at >= since
          and (n.data::text like '%(пример)%' or n.data::text like '%Пример:%'))
    );
  -- the tasks and calls about a sample (BRIXA's own too, like a listing's marketing)
  delete from public.tasks t
  where t.organization_id = org
    and (t.sample
      or t.property_id in (select id from public.properties where organization_id = org and sample)
      or t.client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.activities a
  where a.organization_id = org
    and (a.sample
      or a.property_id in (select id from public.properties where organization_id = org and sample)
      or a.client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.deals
  where organization_id = org
    and (sample
      or property_id in (select id from public.properties where organization_id = org and sample)
      or client_id in (select id from public.clients where organization_id = org and sample));
  delete from public.properties where organization_id = org and sample;
  delete from public.clients where organization_id = org and sample;

  -- the market's days counted with the samples in
  if since is not null then
    delete from public.market_daily where organization_id = org and day >= since;
  end if;
  update public.organizations set sample_since = null where id = org;
  -- the real listings' stars without the samples around them
  perform public.refresh_org_stars(org);
end;
$$;

revoke execute on function public.remove_sample_data() from public, anon;
grant execute on function public.remove_sample_data() to authenticated;

-- once: the leftovers where the samples are already gone (their tasks and deals no longer exist)
delete from public.notifications n
using public.organizations o
where o.id = n.organization_id
  and o.sample_since is null
  and (n.data::text like '%(пример)%' or n.data::text like '%Пример:%')
  and (
    n.link is null
    or n.link !~ '^/(tasks|deals|properties|clients)/'
    or (n.link ~ '^/tasks/' and not exists (select 1 from public.tasks t where '/tasks/' || t.id::text = substring(n.link from '^/tasks/[0-9a-f-]{36}')))
    or (n.link ~ '^/deals/' and not exists (select 1 from public.deals d where '/deals/' || d.id::text = substring(n.link from '^/deals/[0-9a-f-]{36}')))
    or (n.link ~ '^/properties/' and not exists (select 1 from public.properties p where '/properties/' || p.id::text = substring(n.link from '^/properties/[0-9a-f-]{36}')))
    or (n.link ~ '^/clients/' and not exists (select 1 from public.clients c where '/clients/' || c.id::text = substring(n.link from '^/clients/[0-9a-f-]{36}')))
  );
