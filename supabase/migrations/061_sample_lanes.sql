-- =====================================================================
-- BRIXA — migration 061: the sample data shows the lanes and the news
--   After the sample data comes in, the made-up clients get what a broker
--   would fill in: when they'll buy or sell (and so their lane), who decides
--   and why, how the buyers pay (an approved loan, one being applied for, cash),
--   and a few ready messages in Follow-up → News — so a new agency sees at once
--   how the lanes and the market news work. They go with the samples.
-- Run once in Supabase → SQL Editor → New query → Run (after 060).
-- =====================================================================

create or replace function public.enrich_sample_data()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
  done int := 0;
  rate_now record;
  rate_peak record;
  analysis record;
begin
  select m.organization_id into org
  from public.organization_members m
  where m.profile_id = auth.uid() and m.role = 'owner'
  order by m.created_at limit 1;
  if org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- when, who decides, why — the lane follows the "when"
  update public.clients c
  set timeline = v.timeline, decider = v.decider, motive = v.motive, client_class = v.lane
  from (values
    ('Мария Иванова (пример)', 'now', 'partner', 'Иска да се нанесе до лятото', 'A'),
    ('Георги Петров (пример)', 'soon', 'partner', 'Второ дете — тясно им е', 'B'),
    ('Елена Димитрова (пример)', 'now', 'alone', 'Започва нова работа наблизо', 'A'),
    ('Николай Стоянов (пример)', 'later', 'alone', 'Инвестиция за отдаване под наем', 'C'),
    ('Иван Колев (пример)', 'now', 'partner', 'Купили са къща и трябва да продадат', 'A'),
    ('Десислава Тодорова (пример)', 'soon', 'alone', 'Сменя наемателите', 'B'),
    ('Петър Василев (пример)', 'soon', 'others', 'Наследство — решават заедно с братята', 'B'),
    ('Анна Георгиева (пример)', 'later', 'alone', 'Още разглежда', 'C')
  ) as v(name, timeline, decider, motive, lane)
  where c.organization_id = org and c.sample and c.full_name = v.name;
  get diagnostics done = row_count;

  -- how the buyers pay
  insert into public.client_financing (client_id, loan, own_funds, bank_amount, bank_referred, bank_name)
  select c.id, v.loan, v.own, v.bank, v.referred, v.bank_name
  from public.clients c
  join (values
    ('Мария Иванова (пример)', 'approved', 40000::numeric, 110000::numeric, true, 'Банка ДСК'),
    ('Георги Петров (пример)', 'applying', 30000::numeric, 150000::numeric, false, null),
    ('Николай Стоянов (пример)', 'none', 90000::numeric, null::numeric, false, null)
  ) as v(name, loan, own, bank, referred, bank_name) on v.name = c.full_name
  where c.organization_id = org and c.sample
  on conflict (client_id) do nothing;

  -- a few ready messages in Follow-up → News
  select m.month, m.rate into rate_now from public.mortgage_rates m order by m.month desc limit 1;
  if found then
    select m.month, m.rate into rate_peak from public.mortgage_rates m
    where m.month < rate_now.month and m.month >= (rate_now.month - interval '12 months')::date
    order by m.rate desc, m.month desc limit 1;
    if found and rate_peak.rate > rate_now.rate then
      insert into public.client_news (organization_id, client_id, kind, data)
      select org, c.id, 'rates',
        jsonb_build_object('from', rate_peak.rate, 'fromMonth', to_char(rate_peak.month, 'YYYY-MM'),
                           'to', rate_now.rate, 'toMonth', to_char(rate_now.month, 'YYYY-MM'))
      from public.clients c
      where c.organization_id = org and c.sample and c.full_name = 'Мария Иванова (пример)'
      on conflict do nothing;
    end if;
  end if;

  -- the warm buyer's area: the samples' own listings there
  select nb.name as area, round(avg(p.current_price / nullif(p.area, 0))) as sqm, count(*)::int as listings
  into analysis
  from public.properties p
  join public.geo_neighborhoods nb on nb.id = p.neighborhood_id
  where p.organization_id = org and p.sample and p.operation_type = 'sale' and p.area > 0
  group by nb.name
  order by count(*) desc, nb.name
  limit 1;
  if analysis.area is not null then
    insert into public.client_news (organization_id, client_id, kind, data)
    select org, c.id, 'warm_analysis', jsonb_build_object('area', analysis.area, 'sqm', analysis.sqm)
    from public.clients c
    where c.organization_id = org and c.sample and c.full_name = 'Георги Петров (пример)'
    on conflict do nothing;
  end if;

  insert into public.client_news (organization_id, client_id, kind, data)
  select org, c.id, 'tips', jsonb_build_object('month', to_char(public.sofia_today(), 'YYYY-MM'))
  from public.clients c
  where c.organization_id = org and c.sample and c.full_name = 'Анна Георгиева (пример)'
  on conflict do nothing;

  return done;
end;
$$;

revoke execute on function public.enrich_sample_data() from public, anon;
grant execute on function public.enrich_sample_data() to authenticated;
