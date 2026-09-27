-- =====================================================================
-- BRIXA — примерен екип (демо колеги)
--
-- Добавя 5 измислени брокера в агенцията, с имоти, купувачи, сделки и
-- обаждания/огледи за този месец и годината — за да се види класацията.
-- Не могат да влизат в системата (нямат парола), имейлите им са
-- @demo.brixa.invalid. Премахват се изцяло с demo_team_remove.sql.
--
-- Supabase → SQL Editor → New query → поставете целия файл → Run.
-- =====================================================================

do $$
declare
  org uuid;
  owner uuid;
  cat uuid;
  sub uuid;
  today date := public.sofia_today();
  month_start date := date_trunc('month', public.sofia_today()::timestamp)::date;
  year_start date := date_trunc('year', public.sofia_today()::timestamp)::date;
  day_of_month int := extract(day from public.sofia_today())::int;
  person record;
  person_id uuid;
  client_id uuid;
  property_id uuid;
  earlier date;
begin
  select m.organization_id, m.profile_id into org, owner
  from public.organization_members m
  where m.role = 'owner'
  order by m.created_at
  limit 1;
  if org is null then raise exception 'Няма агенция'; end if;

  if exists (select 1 from auth.users where email like '%@demo.brixa.invalid') then
    raise exception 'Примерният екип вече е добавен. Пуснете първо demo_team_remove.sql.';
  end if;

  -- No "X brought in commission" notifications for made-up deals.
  alter table public.deals disable trigger deals_on_changed;

  select id into cat from public.property_categories where code = 'residential';
  select id into sub from public.property_subtypes where code = 'two_room';

  for person in
    select * from (values
      (1, 'Иван Петров',     'ivan',    'Старши брокер', '+359 888 100 201', 4800::numeric, false, 12000::numeric, 42, 8, 4, 'Лозенец'),
      (2, 'Мария Георгиева', 'maria',   'Брокер',        '+359 888 100 202', 6200::numeric, true,  9000::numeric,  55, 10, 5, 'Изгрев'),
      (3, 'Георги Димитров', 'georgi',  'Брокер',        '+359 888 100 203', 3100::numeric, false, 15000::numeric, 30, 6, 3, 'Младост'),
      (4, 'Елена Стоянова',  'elena',   'Брокер наеми',  '+359 888 100 204', 1400::numeric, false, 4000::numeric,  25, 12, 2, 'Център'),
      (5, 'Николай Иванов',  'nikolay', 'Младши брокер', '+359 888 100 205', 0::numeric,    false, 2500::numeric,  61, 4, 2, 'Люлин')
    ) as v (n, full_name, slug, job_title, phone, month_amount, double_deal, earlier_amount, calls, viewings, meetings, area)
  loop
    person_id := gen_random_uuid();

    -- joins the agency as a broker through an invitation, like a real colleague
    insert into public.organization_invitations (organization_id, email, role, invited_by)
    values (org, person.slug || '@demo.brixa.invalid', 'broker', owner);

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', person_id, 'authenticated', 'authenticated',
      person.slug || '@demo.brixa.invalid', '',
      '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', person.full_name),
      now(), now(), '', '', '', ''
    );

    update public.profiles
    set job_title = person.job_title, phone = person.phone, areas = array[person.area]
    where id = person_id;

    insert into public.broker_goals (
      organization_id, profile_id, daily_calls, daily_viewings, daily_listings,
      monthly_target, yearly_target, monthly_bonus, yearly_bonus, updated_by
    ) values (org, person_id, 20, 2, 1, 5000, 60000, '500 € бонус', 'Уикенд в Банско', owner);

    insert into public.clients (organization_id, responsible_broker_id, created_by, full_name, types, client_class, source)
    values (org, person_id, person_id, 'Демо купувач ' || person.n, '{buyer}', 'A', 'referral')
    returning id into client_id;

    insert into public.properties (
      organization_id, category_id, subtype_id, operation_type, title, address, area, rooms,
      current_price, asking_price, currency, exclusive_contract, responsible_broker_id, created_by
    ) values (
      org, cat, sub, 'sale', 'Демо: двустаен, ' || person.area, 'кв. ' || person.area, 65, 2,
      150000 + person.n * 10000, 150000 + person.n * 10000, 'EUR', person.n % 2 = 1, person_id, person_id
    )
    returning id into property_id;

    -- this month's closed deal (confirmed)
    if person.month_amount > 0 then
      insert into public.deals (
        organization_id, broker_id, created_by, property_id, client_id, kind, stage, status,
        price, commission, closed_on, double_sided, buyer_rate
      ) values (
        org, person_id, person_id, property_id, client_id, 'sale', 'notary', 'won',
        150000 + person.n * 10000, person.month_amount, greatest(month_start, today - person.n),
        person.double_deal, case when person.double_deal then 2 end
      );
    end if;

    -- an earlier deal this year
    earlier := year_start + 40 + person.n * 20;
    if earlier < month_start then
      insert into public.deals (
        organization_id, broker_id, created_by, client_id, kind, stage, status, price, commission, closed_on
      ) values (
        org, person_id, person_id, client_id, 'sale', 'notary', 'won',
        person.earlier_amount * 30, person.earlier_amount, earlier
      );
    end if;

    -- a deal in progress, with the notary coming up
    insert into public.deals (
      organization_id, broker_id, created_by, property_id, client_id, kind, stage, status, price, commission,
      deposit_on, preliminary_on, notary_on, deposit_amount
    ) values (
      org, person_id, person_id, property_id, client_id, 'sale', 'deposit', 'open',
      140000 + person.n * 10000, 4200 + person.n * 300,
      today - 3, today + person.n, today + 10 + person.n, 5000
    );

    -- calls, viewings and meetings spread over this month
    insert into public.activities (organization_id, profile_id, type, client_id, occurred_at)
    select org, person_id, kind, client_id,
      now() - ((g % day_of_month) * interval '1 day') - (g * interval '7 minutes')
    from (
      select 'call' as kind, generate_series(1, person.calls) as g
      union all select 'viewing', generate_series(1, person.viewings)
      union all select 'meeting', generate_series(1, person.meetings)
    ) a;
  end loop;

  alter table public.deals enable trigger deals_on_changed;
end;
$$;
