-- =====================================================================
-- BRIXA — migration 073: the Academy — tests, exams and certificates
--   • a bank of questions in 8 topics (ЗУТ и строителство, право и сделката,
--     купувачи, продавачи, банки и кредити, продажби и преговори, пазар и
--     оценка, градът) on 3 levels: основно, напреднало, експертно
--   • each broker's level: set by the manager, else from their BRIXA level
--     (Нов брокер/Брокер → основно, Активен…Топ брокер → напреднало, Експерт… → експертно)
--   • practice (10 questions, the answer shown at once) and the exam
--     (20 questions in 30 minutes, the answers at the end); the questions and
--     the right answers stay in the database — the test is checked here
--   • the exam comes round by the agency's rule (every month by default; also
--     every 3 or 6 months, every year, or not at all) — BRIXA reminds the
--     brokers and tells the leaders how it went
--   • passing gives an A4 certificate with a number and a code anyone can check
--   • the agency's leaders add questions of their own (their city, their way)
-- Run once in Supabase → SQL Editor → New query → Run (after 071; it doesn't need 072).
-- =====================================================================

-- ---------------------------------------------------------------------
-- The agency's rules
-- ---------------------------------------------------------------------
alter table public.organizations
  add column if not exists academy_every text not null default 'month',
  add column if not exists academy_pass smallint not null default 80;
alter table public.organizations drop constraint if exists organizations_academy_every_check;
alter table public.organizations add constraint organizations_academy_every_check
  check (academy_every in ('off', 'month', 'quarter', 'half', 'year'));
alter table public.organizations drop constraint if exists organizations_academy_pass_check;
alter table public.organizations add constraint organizations_academy_pass_check
  check (academy_pass between 50 and 100);

-- ---------------------------------------------------------------------
-- The questions: BRIXA's own (no agency) and each agency's own
--   the right answer is options[correct + 1]; every test shows them shuffled
-- ---------------------------------------------------------------------
create table if not exists public.academy_questions (
  id uuid primary key default gen_random_uuid(),
  -- BRIXA's own questions have a code, so a migration can tell them apart
  code text unique,
  organization_id uuid references public.organizations (id) on delete cascade,
  topic text not null check (topic in ('zut', 'law', 'buyers', 'sellers', 'banks', 'sales', 'market', 'city')),
  level smallint not null check (level between 1 and 3),
  -- the city a "city" question is about (BRIXA's own); an agency's own are about its city
  city text check (city is null or char_length(city) <= 80),
  question text not null check (char_length(question) between 5 and 600),
  options text[] not null check (cardinality(options) between 2 and 5 and char_length(array_to_string(options, '')) <= 1500),
  correct smallint not null default 0,
  explanation text check (explanation is null or char_length(explanation) <= 1000),
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_questions_correct_check check (correct >= 0 and correct < cardinality(options))
);
create index if not exists academy_questions_pool_idx on public.academy_questions (level, topic) where active;
create index if not exists academy_questions_org_idx on public.academy_questions (organization_id);

drop trigger if exists academy_questions_touch_updated_at on public.academy_questions;
create trigger academy_questions_touch_updated_at before update on public.academy_questions
  for each row execute function public.touch_updated_at();

alter table public.academy_questions enable row level security;

-- the answers are in the rows: only who writes them reads them — BRIXA's owner its own,
-- an agency's leaders the agency's; the brokers get the questions only through a test
drop policy if exists "academy questions: read" on public.academy_questions;
create policy "academy questions: read" on public.academy_questions for select to authenticated
  using (case when organization_id is null then public.is_platform_admin() else public.is_org_manager(organization_id) end);
drop policy if exists "academy questions: add" on public.academy_questions;
create policy "academy questions: add" on public.academy_questions for insert to authenticated
  with check (case when organization_id is null then public.is_platform_admin() else public.is_org_manager(organization_id) end);
drop policy if exists "academy questions: edit" on public.academy_questions;
create policy "academy questions: edit" on public.academy_questions for update to authenticated
  using (case when organization_id is null then public.is_platform_admin() else public.is_org_manager(organization_id) end)
  with check (case when organization_id is null then public.is_platform_admin() else public.is_org_manager(organization_id) end);
-- BRIXA's own are switched off, not deleted (past tests keep their copy anyway)
drop policy if exists "academy questions: delete" on public.academy_questions;
create policy "academy questions: delete" on public.academy_questions for delete to authenticated
  using (organization_id is not null and public.is_org_manager(organization_id));

-- ---------------------------------------------------------------------
-- A broker's level, when a manager sets it (else it follows the BRIXA level)
-- ---------------------------------------------------------------------
create table if not exists public.academy_levels (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  level smallint not null check (level between 1 and 3),
  set_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

alter table public.academy_levels enable row level security;
drop policy if exists "academy levels: read" on public.academy_levels;
create policy "academy levels: read" on public.academy_levels for select to authenticated
  using (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));

-- ---------------------------------------------------------------------
-- The tests taken, and their questions as they were shown
--   a test keeps its own copy of each question, so editing the bank later
--   never changes a result; the copies (with the right answers) are read only
--   through the functions below
-- ---------------------------------------------------------------------
create table if not exists public.academy_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('exam', 'practice')),
  level smallint not null check (level between 1 and 3),
  -- practice on one topic
  topic text,
  -- the exam's round: '2026-11', '2026-Q4', '2026-H2', '2026' (none when the agency has no rounds)
  period text,
  total smallint not null default 0,
  correct smallint,
  score smallint,
  passed boolean,
  started_at timestamptz not null default now(),
  deadline_at timestamptz,
  finished_at timestamptz
);
create index if not exists academy_attempts_person_idx on public.academy_attempts (profile_id, started_at desc);
create index if not exists academy_attempts_round_idx on public.academy_attempts (organization_id, period) where mode = 'exam';

alter table public.academy_attempts enable row level security;
drop policy if exists "academy attempts: read" on public.academy_attempts;
create policy "academy attempts: read" on public.academy_attempts for select to authenticated
  using (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));

create table if not exists public.academy_answers (
  attempt_id uuid not null references public.academy_attempts (id) on delete cascade,
  position smallint not null,
  question_id uuid references public.academy_questions (id) on delete set null,
  topic text not null,
  question text not null,
  -- in the order shown
  options text[] not null,
  right_option smallint not null,
  explanation text,
  chosen smallint,
  answered_at timestamptz,
  primary key (attempt_id, position)
);
create index if not exists academy_answers_question_idx on public.academy_answers (question_id);

-- no policies: read and written only by the functions below
alter table public.academy_answers enable row level security;

-- ---------------------------------------------------------------------
-- The certificates
-- ---------------------------------------------------------------------
create sequence if not exists public.academy_certificate_no;

create table if not exists public.academy_certificates (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.academy_certificate_no'),
  -- the code printed on it and in its QR code: anyone can check it at /v/<code>
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  attempt_id uuid unique references public.academy_attempts (id) on delete set null,
  level smallint not null check (level between 1 and 3),
  score smallint not null,
  -- as they were on the day
  holder_name text not null,
  agency_name text not null,
  -- the agency's owner signs (not when it is their own)
  signer_name text,
  issued_on date not null default public.sofia_today(),
  valid_until date not null,
  created_at timestamptz not null default now()
);
create index if not exists academy_certificates_person_idx on public.academy_certificates (profile_id, issued_on desc);

alter table public.academy_certificates enable row level security;
drop policy if exists "academy certificates: read" on public.academy_certificates;
create policy "academy certificates: read" on public.academy_certificates for select to authenticated
  using (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));

-- ---------------------------------------------------------------------
-- Rounds: which one a day is in, where it starts and ends
-- ---------------------------------------------------------------------
create or replace function public.academy_period(every text, day date)
returns text
language sql
stable
as $$
  select case every
    when 'month' then to_char(day, 'YYYY-MM')
    when 'quarter' then to_char(day, 'YYYY') || '-Q' || extract(quarter from day)::int
    when 'half' then to_char(day, 'YYYY') || '-H' || case when extract(month from day) <= 6 then 1 else 2 end
    when 'year' then to_char(day, 'YYYY')
  end;
$$;

create or replace function public.academy_period_bounds(every text, day date, out starts date, out ends date)
language sql
stable
as $$
  select s, (s + case every when 'month' then interval '1 month' when 'quarter' then interval '3 months'
                            when 'half' then interval '6 months' else interval '1 year' end)::date - 1
  from (
    select case every
      when 'month' then date_trunc('month', day)::date
      when 'quarter' then date_trunc('quarter', day)::date
      when 'half' then make_date(extract(year from day)::int, case when extract(month from day) <= 6 then 1 else 7 end, 1)
      when 'year' then date_trunc('year', day)::date
    end as s
  ) x;
$$;

-- ---------------------------------------------------------------------
-- A person's level and city
-- ---------------------------------------------------------------------

-- from the BRIXA level (experience): 0–999 → 1, 1 000–9 999 → 2, 10 000 and more → 3
create or replace function public.academy_level_for(points integer)
returns smallint
language sql
immutable
as $$
  select (case when coalesce(points, 0) >= 10000 then 3 when coalesce(points, 0) >= 1000 then 2 else 1 end)::smallint;
$$;

create or replace function public.academy_level_of(target_org uuid, target uuid)
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select l.level from public.academy_levels l where l.organization_id = target_org and l.profile_id = target),
    public.academy_level_for((select b.points from public.leaderboard(target_org, 'all') b where b.profile_id = target))
  );
$$;

-- the city the "city" questions are about: the person's office's, else the agency's ("гр. " left out)
create or replace function public.academy_city(target_org uuid, target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(regexp_replace(coalesce(
    (select nullif(trim(f.city), '') from public.organization_members m join public.offices f on f.id = m.office_id
     where m.organization_id = target_org and m.profile_id = target),
    (select o.city from public.organizations o where o.id = target_org),
    ''), '^\s*(гр\.|град)\s*', '', 'i')), '');
$$;

revoke execute on function public.academy_level_of(uuid, uuid) from public, anon;
grant execute on function public.academy_level_of(uuid, uuid) to authenticated;
revoke execute on function public.academy_city(uuid, uuid) from public, anon;

-- ---------------------------------------------------------------------
-- Finishing a test: the score, passed or not, the certificate, the leaders told
--   (internal: the person finishes their own; the morning run the ones left open)
-- ---------------------------------------------------------------------
create or replace function public.academy_close(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  o record;
  got integer;
  pct integer;
  ok boolean;
  signer text;
  leader record;
begin
  select * into a from public.academy_attempts where id = target for update;
  if a.id is null or a.finished_at is not null then
    return;
  end if;

  select count(*) filter (where w.chosen = w.right_option) into got from public.academy_answers w where w.attempt_id = target;
  pct := case when a.total > 0 then round(100.0 * got / a.total)::int else 0 end;
  select * into o from public.organizations where id = a.organization_id;
  ok := a.mode = 'exam' and pct >= o.academy_pass;

  update public.academy_attempts
  set correct = got,
      score = pct,
      passed = case when a.mode = 'exam' then ok end,
      -- an exam left open ends when its time did
      finished_at = case when a.deadline_at is not null then least(now(), a.deadline_at) else now() end
  where id = target;

  if ok then
    select coalesce(p.full_name, p.email) into signer
    from public.organization_members m join public.profiles p on p.id = m.profile_id
    where m.organization_id = a.organization_id and m.role = 'owner' and m.profile_id <> a.profile_id
    order by m.created_at
    limit 1;

    insert into public.academy_certificates (organization_id, profile_id, attempt_id, level, score, holder_name, agency_name, signer_name, issued_on, valid_until)
    values (a.organization_id, a.profile_id, a.id, a.level, pct, coalesce(public.person_name(a.profile_id), ''), o.name, signer,
            public.sofia_today(), (public.sofia_today() + interval '1 year')::date)
    on conflict (attempt_id) do nothing;
  end if;

  -- the person's leaders hear how the exam went
  if a.mode = 'exam' then
    for leader in
      select m.profile_id from public.organization_members m
      where m.organization_id = a.organization_id and m.profile_id <> a.profile_id
        and public.oversees_as(m.profile_id, a.profile_id)
    loop
      perform public.notify(
        a.organization_id, leader.profile_id, a.profile_id, 'academy_result',
        jsonb_build_object('actor', public.person_name(a.profile_id), 'count', pct, 'level', a.level, 'kind', case when ok then 'passed' else 'failed' end),
        '/academy/team'
      );
    end loop;
  end if;
end;
$$;

revoke execute on function public.academy_close(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Starting a test: practice (10 questions; one topic or all) or the exam (20 in 30 minutes)
--   the questions: the person's level first, a few from each topic in turn, the ones not
--   seen in the last 90 days first; the answers shuffled
-- ---------------------------------------------------------------------
create or replace function public.academy_start(want_mode text, want_level integer default null, want_topic text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  org uuid;
  o record;
  my_level smallint;
  lvl smallint;
  per text;
  size integer;
  last_fail timestamptz;
  town text;
  attempt uuid;
  q record;
  pos integer := 0;
  shown text[];
  idxs integer[];
begin
  select m.organization_id into org from public.organization_members m where m.profile_id = me order by m.created_at limit 1;
  if me is null or org is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if want_mode is null or want_mode not in ('exam', 'practice') then
    raise exception 'academy_mode';
  end if;
  if want_topic is not null and want_topic not in ('zut', 'law', 'buyers', 'sellers', 'banks', 'sales', 'market', 'city') then
    raise exception 'academy_topic';
  end if;

  select * into o from public.organizations where id = org;
  my_level := public.academy_level_of(org, me);
  lvl := coalesce(want_level, my_level);
  if lvl not between 1 and 3 then
    raise exception 'academy_level';
  end if;

  -- an exam still running: starting it again continues it, and nothing else starts meanwhile
  select a.id into attempt from public.academy_attempts a
  where a.profile_id = me and a.mode = 'exam' and a.finished_at is null and a.deadline_at > now()
  order by a.started_at desc
  limit 1;
  if attempt is not null then
    if want_mode = 'exam' then
      return attempt;
    end if;
    raise exception 'academy_exam_open';
  end if;

  -- whatever was left open is finished first
  perform public.academy_close(a.id) from public.academy_attempts a where a.profile_id = me and a.finished_at is null;

  if want_mode = 'exam' then
    want_topic := null;
    -- the exam is at one's own level or higher
    if lvl < my_level then
      raise exception 'academy_level_low';
    end if;
    per := public.academy_period(o.academy_every, public.sofia_today());
    if exists (
      select 1 from public.academy_attempts a
      where a.profile_id = me and a.organization_id = org and a.mode = 'exam' and a.passed and a.level >= lvl
        -- the round's; with no rounds, one passed within the year
        and (case when per is not null then a.period = per else a.finished_at > now() - interval '1 year' end)
    ) then
      raise exception 'academy_passed';
    end if;
    -- after a failed exam: the next one tomorrow
    select max(a.finished_at) into last_fail from public.academy_attempts a
    where a.profile_id = me and a.mode = 'exam' and a.passed is false;
    if last_fail is not null and last_fail > now() - interval '24 hours' then
      raise exception 'academy_wait';
    end if;
    size := 20;
  else
    size := 10;
  end if;

  town := public.academy_city(org, me);

  insert into public.academy_attempts (organization_id, profile_id, mode, level, topic, period, deadline_at)
  values (org, me, want_mode, lvl, want_topic, per, case when want_mode = 'exam' then now() + interval '30 minutes' end)
  returning id into attempt;

  for q in
    with seen as (
      select distinct w.question_id
      from public.academy_answers w join public.academy_attempts a on a.id = w.attempt_id
      where a.profile_id = me and a.started_at > now() - interval '90 days' and w.question_id is not null
    ),
    pool as (
      select x.id, x.topic, x.level, x.question, x.options, x.correct, x.explanation,
        row_number() over (partition by x.topic, x.level order by (x.id in (select s.question_id from seen s)), random()) as rn
      from public.academy_questions x
      where x.active
        and (x.organization_id is null or x.organization_id = org)
        and (want_topic is null or x.topic = want_topic)
        and (x.topic <> 'city' or x.organization_id = org or (town is not null and lower(x.city) = lower(town)))
    )
    select * from pool
    order by (pool.level <> lvl), abs(pool.level - lvl), pool.rn, random()
    limit size
  loop
    pos := pos + 1;
    select array_agg(t.opt order by t.r), array_agg(t.i::int order by t.r)
    into shown, idxs
    from (select u.opt, u.i, random() as r from unnest(q.options) with ordinality as u(opt, i)) t;
    insert into public.academy_answers (attempt_id, position, question_id, topic, question, options, right_option, explanation)
    values (attempt, pos, q.id, q.topic, q.question, shown, array_position(idxs, q.correct + 1) - 1, q.explanation);
  end loop;

  if pos = 0 then
    raise exception 'academy_empty';
  end if;
  update public.academy_attempts set total = pos where id = attempt;
  return attempt;
end;
$$;

revoke execute on function public.academy_start(text, integer, text) from public, anon;
grant execute on function public.academy_start(text, integer, text) to authenticated;

-- An answer: practice shows at once whether it was right (the first answer counts);
-- the exam keeps it (it can be changed until the end)
create or replace function public.academy_answer(target uuid, pos integer, choice integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  w record;
begin
  select * into a from public.academy_attempts where id = target and profile_id = auth.uid();
  if a.id is null then
    raise exception 'not_found';
  end if;
  if a.finished_at is not null then
    return jsonb_build_object('finished', true);
  end if;
  -- the time is up (half a minute's grace for the network)
  if a.deadline_at is not null and now() > a.deadline_at + interval '30 seconds' then
    perform public.academy_close(target);
    return jsonb_build_object('finished', true);
  end if;

  select * into w from public.academy_answers where attempt_id = target and position = pos;
  if w.attempt_id is null or choice is null or choice < 0 or choice >= cardinality(w.options) then
    raise exception 'academy_answer';
  end if;

  if a.mode = 'practice' then
    if w.chosen is null then
      update public.academy_answers set chosen = choice, answered_at = now() where attempt_id = target and position = pos;
    end if;
    return jsonb_build_object('chosen', coalesce(w.chosen, choice), 'right', w.right_option, 'explanation', w.explanation);
  end if;

  update public.academy_answers set chosen = choice, answered_at = now() where attempt_id = target and position = pos;
  return jsonb_build_object('saved', true);
end;
$$;

revoke execute on function public.academy_answer(uuid, integer, integer) from public, anon;
grant execute on function public.academy_answer(uuid, integer, integer) to authenticated;

create or replace function public.academy_finish(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.academy_attempts where id = target and profile_id = auth.uid()) then
    raise exception 'not_found';
  end if;
  perform public.academy_close(target);
  return (
    select jsonb_build_object('score', a.score, 'passed', a.passed,
      'certificate', (select c.id from public.academy_certificates c where c.attempt_id = a.id))
    from public.academy_attempts a where a.id = target
  );
end;
$$;

revoke execute on function public.academy_finish(uuid) from public, anon;
grant execute on function public.academy_finish(uuid) to authenticated;

-- A test with its questions: the right answers once it is finished (practice: once answered).
-- The person themself and their leaders.
create or replace function public.academy_review(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a record;
  reveal boolean;
begin
  select * into a from public.academy_attempts
  where id = target and (profile_id = auth.uid() or public.oversees_as(auth.uid(), profile_id));
  if a.id is null then
    return null;
  end if;
  reveal := a.finished_at is not null;
  return jsonb_build_object(
    'id', a.id, 'mode', a.mode, 'level', a.level, 'topic', a.topic, 'period', a.period,
    'total', a.total, 'correct', a.correct, 'score', a.score, 'passed', a.passed,
    'started_at', a.started_at, 'deadline_at', a.deadline_at, 'finished_at', a.finished_at, 'now', now(),
    'name', public.person_name(a.profile_id), 'mine', a.profile_id = auth.uid(),
    'pass', (select o.academy_pass from public.organizations o where o.id = a.organization_id),
    'certificate', (select c.id from public.academy_certificates c where c.attempt_id = a.id),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', w.position, 'topic', w.topic, 'question', w.question, 'options', to_jsonb(w.options), 'chosen', w.chosen,
        'right', case when reveal or (a.mode = 'practice' and w.chosen is not null) then w.right_option end,
        'explanation', case when reveal or (a.mode = 'practice' and w.chosen is not null) then w.explanation end
      ) order by w.position)
      from public.academy_answers w where w.attempt_id = a.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.academy_review(uuid) from public, anon;
grant execute on function public.academy_review(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- What the academy page shows
-- ---------------------------------------------------------------------

-- me: my level (and where it comes from), the round, whether I passed it, when I may try again
create or replace function public.academy_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  org uuid;
  o record;
  set_level smallint;
  points integer;
  per text;
  b record;
  last_fail timestamptz;
begin
  select m.organization_id into org from public.organization_members m where m.profile_id = me order by m.created_at limit 1;
  if org is null then
    return null;
  end if;
  select * into o from public.organizations where id = org;
  select l.level into set_level from public.academy_levels l where l.organization_id = org and l.profile_id = me;
  select lb.points into points from public.leaderboard(org, 'all') lb where lb.profile_id = me;
  per := public.academy_period(o.academy_every, public.sofia_today());
  select * into b from public.academy_period_bounds(o.academy_every, public.sofia_today());
  select max(a.finished_at) into last_fail from public.academy_attempts a
  where a.profile_id = me and a.mode = 'exam' and a.passed is false;

  return jsonb_build_object(
    'level', coalesce(set_level, public.academy_level_for(points)),
    'auto_level', public.academy_level_for(points),
    'level_set', set_level is not null,
    'every', o.academy_every,
    'pass', o.academy_pass,
    'period', per,
    'period_ends', b.ends,
    'passed', exists (
      select 1 from public.academy_attempts a
      where a.profile_id = me and a.organization_id = org and a.mode = 'exam' and a.passed
        and (case when per is not null then a.period = per else a.finished_at > now() - interval '1 year' end)
    ),
    'passed_level', (
      select max(a.level) from public.academy_attempts a
      where a.profile_id = me and a.organization_id = org and a.mode = 'exam' and a.passed
        and (case when per is not null then a.period = per else a.finished_at > now() - interval '1 year' end)
    ),
    'wait_until', case when last_fail > now() - interval '24 hours' then last_fail + interval '24 hours' end,
    'city', public.academy_city(org, me)
  );
end;
$$;

revoke execute on function public.academy_me() from public, anon;
grant execute on function public.academy_me() to authenticated;

-- how many questions there are, by topic and level (what the person can be asked)
create or replace function public.academy_bank(target_org uuid)
returns table (topic text, level smallint, builtin integer, own integer)
language sql
stable
security definer
set search_path = public
as $$
  with town as (select public.academy_city(target_org, auth.uid()) as name)
  select q.topic, q.level,
    (count(*) filter (where q.organization_id is null))::int,
    (count(*) filter (where q.organization_id = target_org))::int
  from public.academy_questions q, town
  where q.active and public.is_org_member(target_org)
    and (q.organization_id is null or q.organization_id = target_org)
    and (q.topic <> 'city' or q.organization_id = target_org or (town.name is not null and lower(q.city) = lower(town.name)))
  group by q.topic, q.level;
$$;

revoke execute on function public.academy_bank(uuid) from public, anon;
grant execute on function public.academy_bank(uuid) to authenticated;

-- right and wrong by topic in the exams of the last 12 months: one person (themself or a leader),
-- or everyone the leader leads (no person given)
create or replace function public.academy_topics(target_org uuid, target uuid default null)
returns table (topic text, answered integer, right_answers integer)
language sql
stable
security definer
set search_path = public
as $$
  with people as (
    select m.profile_id from public.organization_members m
    where m.organization_id = target_org
      and (case when target is null then public.oversees_as(auth.uid(), m.profile_id)
                else m.profile_id = target and (target = auth.uid() or public.oversees_as(auth.uid(), target)) end)
  )
  select w.topic, count(*)::int, (count(*) filter (where w.chosen = w.right_option))::int
  from public.academy_attempts a
  join people p on p.profile_id = a.profile_id
  join public.academy_answers w on w.attempt_id = a.id
  where a.organization_id = target_org and a.mode = 'exam' and a.finished_at is not null
    and a.started_at > now() - interval '1 year'
  group by w.topic;
$$;

revoke execute on function public.academy_topics(uuid, uuid) from public, anon;
grant execute on function public.academy_topics(uuid, uuid) to authenticated;

-- the leader's people: level, this round's exam, the last certificate
create or replace function public.academy_team(target_org uuid)
returns table (
  profile_id uuid, full_name text, email text, avatar_path text, role text,
  level smallint, level_set boolean, auto_level smallint, expected boolean,
  best smallint, passed boolean, attempts integer, last_at timestamptz,
  certificate_level smallint, certificate_until date
)
language sql
stable
security definer
set search_path = public
as $$
  with o as (
    select org.*, public.academy_period(org.academy_every, public.sofia_today()) as per
    from public.organizations org where org.id = target_org
  ),
  lb as (
    select b.profile_id, b.points from public.leaderboard(target_org, 'all') b
  )
  select m.profile_id, p.full_name, p.email, p.avatar_path, m.role,
    coalesce(al.level, public.academy_level_for(lb.points)),
    al.level is not null,
    public.academy_level_for(lb.points),
    -- who the exam is for: the brokers and the team managers (working alone: oneself)
    (m.role in ('broker', 'manager') or o.kind = 'solo'),
    (select max(a.score) from public.academy_attempts a
     where a.profile_id = m.profile_id and a.organization_id = target_org and a.mode = 'exam'
       and a.finished_at is not null and a.period is not distinct from o.per)::smallint,
    exists (select 1 from public.academy_attempts a
            where a.profile_id = m.profile_id and a.organization_id = target_org and a.mode = 'exam'
              and a.passed and a.period is not distinct from o.per),
    (select count(*) from public.academy_attempts a
     where a.profile_id = m.profile_id and a.organization_id = target_org and a.mode = 'exam'
       and a.period is not distinct from o.per)::int,
    (select max(a.started_at) from public.academy_attempts a
     where a.profile_id = m.profile_id and a.organization_id = target_org),
    c.level, c.valid_until
  from public.organization_members m
  cross join o
  join public.profiles p on p.id = m.profile_id
  left join public.academy_levels al on al.organization_id = target_org and al.profile_id = m.profile_id
  left join lb on lb.profile_id = m.profile_id
  left join lateral (
    select ce.level, ce.valid_until from public.academy_certificates ce
    where ce.profile_id = m.profile_id and ce.organization_id = target_org
    order by ce.issued_on desc, ce.level desc
    limit 1
  ) c on true
  where m.organization_id = target_org and public.oversees_as(auth.uid(), m.profile_id)
  order by coalesce(p.full_name, p.email);
$$;

revoke execute on function public.academy_team(uuid) from public, anon;
grant execute on function public.academy_team(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- What the leaders set
-- ---------------------------------------------------------------------

-- a person's level (null: back to the one from their BRIXA level)
create or replace function public.set_academy_level(target uuid, new_level integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  select m.organization_id into org from public.organization_members m where m.profile_id = auth.uid() order by m.created_at limit 1;
  if org is null or not public.oversees_as(auth.uid(), target)
     or not exists (select 1 from public.organization_members t where t.organization_id = org and t.profile_id = target) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if new_level is null then
    delete from public.academy_levels where organization_id = org and profile_id = target;
  elsif new_level between 1 and 3 then
    insert into public.academy_levels (organization_id, profile_id, level, set_by)
    values (org, target, new_level, auth.uid())
    on conflict (organization_id, profile_id) do update set level = excluded.level, set_by = excluded.set_by, updated_at = now();
  else
    raise exception 'academy_level';
  end if;
end;
$$;

revoke execute on function public.set_academy_level(uuid, integer) from public, anon;
grant execute on function public.set_academy_level(uuid, integer) to authenticated;

-- the agency's rules: the owner
create or replace function public.set_academy_rules(target_org uuid, every text, pass_mark integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_org_owner(target_org) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.organizations set academy_every = every, academy_pass = pass_mark where id = target_org;
end;
$$;

revoke execute on function public.set_academy_rules(uuid, text, integer) from public, anon;
grant execute on function public.set_academy_rules(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Checking a certificate: anyone with its code (the QR code on it)
-- ---------------------------------------------------------------------
create or replace function public.academy_certificate_public(cert_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'number', c.number, 'holder', c.holder_name, 'agency', c.agency_name, 'level', c.level, 'score', c.score,
    'issued_on', c.issued_on, 'valid_until', c.valid_until, 'valid', c.valid_until >= public.sofia_today(),
    'logo_path', o.logo_path
  )
  from public.academy_certificates c
  left join public.organizations o on o.id = c.organization_id
  where c.code = upper(trim(cert_code));
$$;

revoke execute on function public.academy_certificate_public(text) from public;
grant execute on function public.academy_certificate_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Every morning: the rounds
--   the first day of a round: "the exam is open" to everyone it is for, and the leaders
--   hear how the last round went; 3 days before the end: a reminder to who hasn't passed.
--   Exams left open past their time are finished.
-- ---------------------------------------------------------------------
create or replace function public.notify_academy(day date default public.sofia_today())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  b record;
  m record;
  leader record;
  per text;
  prev text;
  total integer;
  done integer;
  sent integer := 0;
begin
  perform public.academy_close(a.id) from public.academy_attempts a
  where a.finished_at is null
    and ((a.deadline_at is not null and a.deadline_at < now() - interval '1 minute')
         or (a.deadline_at is null and a.started_at < now() - interval '1 day'));

  for o in select org.* from public.organizations org where org.academy_every <> 'off' loop
    select * into b from public.academy_period_bounds(o.academy_every, day);
    per := public.academy_period(o.academy_every, day);

    if day = b.starts then
      for m in
        select mm.profile_id from public.organization_members mm
        where mm.organization_id = o.id and (mm.role in ('broker', 'manager') or o.kind = 'solo')
      loop
        perform public.notify(o.id, m.profile_id, null, 'academy_open',
          jsonb_build_object('period', per, 'count', 20, 'minutes', 30), '/academy');
        sent := sent + 1;
      end loop;

      prev := public.academy_period(o.academy_every, day - 1);
      for leader in
        select l.profile_id from public.organization_members l where l.organization_id = o.id and l.role <> 'broker'
      loop
        select count(*)::int,
               (count(*) filter (where exists (
                 select 1 from public.academy_attempts a
                 where a.profile_id = t.profile_id and a.organization_id = o.id and a.mode = 'exam' and a.period = prev and a.passed
               )))::int
        into total, done
        from public.organization_members t
        where t.organization_id = o.id and t.profile_id <> leader.profile_id
          and (t.role in ('broker', 'manager') or o.kind = 'solo')
          and public.oversees_as(leader.profile_id, t.profile_id);
        -- only once the academy has had a round here
        if total > 0 and exists (
          select 1 from public.academy_attempts a where a.organization_id = o.id and a.mode = 'exam' and a.period = prev
        ) then
          perform public.notify(o.id, leader.profile_id, null, 'academy_summary',
            jsonb_build_object('period', prev, 'count', done, 'total', total), '/academy/team');
          sent := sent + 1;
        end if;
      end loop;
    elsif day = b.ends - 3 then
      for m in
        select mm.profile_id from public.organization_members mm
        where mm.organization_id = o.id and (mm.role in ('broker', 'manager') or o.kind = 'solo')
          and not exists (
            select 1 from public.academy_attempts a
            where a.profile_id = mm.profile_id and a.organization_id = o.id and a.mode = 'exam' and a.period = per and a.passed
          )
      loop
        perform public.notify(o.id, m.profile_id, null, 'academy_due',
          jsonb_build_object('period', per, 'days', 3), '/academy');
        sent := sent + 1;
      end loop;
    end if;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.notify_academy(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-academy', '0 6 * * *', 'select public.notify_academy()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- BRIXA's own questions (written 02.11.2026; BRIXA's owner keeps them up to date)
--   the right answer is the first one — every test shuffles them
-- ---------------------------------------------------------------------
insert into public.academy_questions (code, topic, level, city, question, options, correct, explanation) values
  ('zut-1-01', 'zut', 1, null, 'Какво означава съкращението ЗУТ?', array['Закон за устройство на територията', 'Закон за управление на териториите', 'Закон за уреждане на търговията с имоти', 'Закон за устройство на търговските обекти'], 0, 'ЗУТ урежда как се планира и застроява територията: устройствените планове, строителните книжа, строителството и въвеждането на сградите в експлоатация.'),
  ('zut-1-02', 'zut', 1, null, 'Кой акт се съставя, когато е завършен грубият строеж (конструкцията) на сградата?', array['Акт 14', 'Акт 15', 'Акт 16', 'Акт 2'], 0, 'Акт обр. 14 е за приемане на конструкцията — това е „грубият строеж“. Акт 15 се съставя, когато строежът е завършен, а след него идва разрешението за ползване или удостоверението за въвеждане в експлоатация („Акт 16“).'),
  ('zut-1-03', 'zut', 1, null, 'Кой документ доказва, че новата сграда може законно да се обитава?', array['Разрешението за ползване или удостоверението за въвеждане в експлоатация („Акт 16“)', 'Разрешението за строеж', 'Акт 14 за приемане на конструкцията', 'Договорът между строителя и купувача'], 0, 'Сградата може да се ползва едва след като е въведена в експлоатация. Без този документ банките обикновено не кредитират, а нанасянето е незаконно.'),
  ('zut-1-04', 'zut', 1, null, 'Какво е РЗП?', array['Разгъната застроена площ — сборът от застроените площи на надземните етажи', 'Застроената площ само на първия етаж', 'Площта на целия парцел', 'Чистата жилищна площ на всички апартаменти'], 0, 'РЗП е сборът от застроените площи на всички надземни етажи. С нея се изчислява Кинт (РЗП ÷ площта на парцела).'),
  ('zut-1-05', 'zut', 1, null, 'Какво е УПИ?', array['Урегулиран поземлен имот — имот, за който има отреждане по план за регулация', 'Удостоверение за принадлежност на имот', 'Уникален поземлен идентификатор в кадастъра', 'Устройствен план на конкретен имот'], 0, 'УПИ е имот, на който с подробния устройствен план е дадено отреждане (например „за жилищно строителство“) и има регулационни граници.'),
  ('zut-1-06', 'zut', 1, null, 'Откъде се вади схема на апартамент (самостоятелен обект)?', array['От Службата по геодезия, картография и кадастър (АГКК) — и онлайн през КАИС', 'От Агенцията по вписванията', 'От общината, отдел „Местни данъци“', 'От нотариуса по местонахождение на имота'], 0, 'Схемите и скиците се издават от кадастъра (СГКК към АГКК). Онлайн през kais.cadastre.bg с електронен подпис излизат по-евтино.'),
  ('zut-1-07', 'zut', 1, null, 'Какво показва идентификаторът на имот в кадастъра, например 10135.2555.123.1.15?', array['Населеното място, кадастралния район, поземления имот, сградата и самостоятелния обект', 'Номера на нотариалния акт и годината на вписване', 'Данъчния номер на собственика и партидата му', 'Пощенския код, улицата, номера, входа и апартамента'], 0, 'Първото число е кодът по ЕКАТТЕ на населеното място (10135 е Варна), следват кадастралният район, номерът на поземления имот, сградата и самостоятелният обект в нея.'),
  ('zut-1-08', 'zut', 1, null, 'Какво значи „купуване на зелено“?', array['Покупка на имот в сграда, която още не е построена или се строи', 'Покупка на имот в зелена зона или до парк', 'Покупка на земеделска земя', 'Покупка с отстъпка при плащане в брой'], 0, '„На зелено“ се купува преди или по време на строителството — обикновено по-евтино, но с риск от забавяне. Затова е важно да се проверят разрешението за строеж, собствеността на земята и строителят.'),
  ('zut-1-09', 'zut', 1, null, 'Какво означава устройствената зона „Жм“?', array['Жилищна зона с малкоетажно застрояване (до 10 м височина)', 'Жилищна зона с многоетажно застрояване', 'Жилищна зона за младежко строителство', 'Жилищна зона с междублокови пространства'], 0, 'Жм е жилищна зона с преобладаващо застрояване с малка височина (до 10 м), Жс — със средна (до 15 м), Жг — с голяма (над 15 м). Конкретните показатели се четат в плана на общината.'),
  ('zut-1-10', 'zut', 1, null, 'Какво представляват идеалните части от общите части, които се продават с апартамента?', array['Делът на апартамента в общите части на сградата — стълбища, покрив, фоайе, асансьор', 'Мебелите и уредите, които остават в апартамента', 'Част от двора, която е само на купувача', 'Площта на терасите и балконите'], 0, 'При етажна собственост всеки обект има дял в общите части. Той се посочва в документите и влиза в „общата площ“ на обявата.'),
  ('zut-2-01', 'zut', 2, null, 'Какво показва коефициентът на интензивност (Кинт)?', array['Отношението между РЗП на сградите и площта на парцела', 'Каква част от парцела може да се застрои, в %', 'Височината на сградата в етажи', 'Колко от парцела трябва да е озеленено'], 0, 'Кинт = РЗП ÷ площта на УПИ. При Кинт 1,5 и парцел 1 000 м² може да се построят най-много 1 500 м² РЗП.'),
  ('zut-2-02', 'zut', 2, null, 'Какво показва плътността на застрояване?', array['Каква част от площта на парцела (в %) може да е заета от сградата', 'Колко апартамента може да има на етаж', 'Отношението на РЗП към площта на парцела', 'Колко сгради има на хектар в квартала'], 0, 'Плътността е застроената площ (ЗП) като процент от площта на парцела. Тя ограничава „отпечатъка“ на сградата върху терена.'),
  ('zut-2-03', 'zut', 2, null, 'Парцел от 600 м² е с Кинт 1,2. Каква е най-голямата РЗП, която може да се построи?', array['720 м²', '500 м²', '1 200 м²', '600 м²'], 0, 'РЗП = Кинт × площта на парцела = 1,2 × 600 = 720 м².'),
  ('zut-2-04', 'zut', 2, null, 'Парцел от 800 м² е с плътност на застрояване 40%. Колко най-много може да е застроената площ (ЗП)?', array['320 м²', '480 м²', '200 м²', '400 м²'], 0, 'ЗП = 40% × 800 м² = 320 м². Плътността ограничава площта, която сградата заема върху терена.'),
  ('zut-2-05', 'zut', 2, null, 'Кога губи сила разрешението за строеж?', array['Ако строежът не започне до 3 години или грубият строеж не завърши до 5 години от започването', 'Ако до 1 година не е платена таксата към общината', 'Никога — разрешението за строеж е безсрочно', 'Автоматично 10 години след издаването'], 0, 'По чл. 153 ЗУТ разрешението губи сила, ако в 3 години от влизането му в сила не е започнало строителството или в 5 години от започването не е завършен грубият строеж.'),
  ('zut-2-06', 'zut', 2, null, 'Какво е ПУП-ПРЗ?', array['Подробен устройствен план — план за регулация и застрояване на конкретни имоти', 'Общият устройствен план на цялата община', 'Проект за узаконяване на незаконни постройки', 'Протокол за установяване на подземни работи'], 0, 'ПРЗ определя границите на УПИ (регулацията) и как може да се строи в тях — строителни линии, височина, показатели.'),
  ('zut-2-07', 'zut', 2, null, 'Каква е разликата между регулационна и строителна линия?', array['Регулационната е границата на имота към улицата, а строителната — докъде може да се строи сградата', 'Регулационната показва височината, а строителната — плътността', 'Няма разлика — това са две имена на едно и също', 'Строителната е границата между два съседни имота'], 0, 'Регулационната линия отделя имота от улицата (или от съседа). Строителната линия е линията, до която (или на която) може да се постави сградата.'),
  ('zut-2-08', 'zut', 2, null, 'За какво служи Акт 15?', array['Установява, че строежът е завършен и годен за приемане преди въвеждането в експлоатация', 'Разрешава започването на строежа', 'Приема конструкцията — грубия строеж', 'Вписва сградата в Агенцията по вписванията'], 0, 'Акт обр. 15 се съставя, когато строежът е изпълнен по проекта. С него възложителят иска въвеждане в експлоатация.'),
  ('zut-2-09', 'zut', 2, null, 'Кой въвежда в експлоатация сграда от I–III категория (издава разрешение за ползване)?', array['ДНСК — Дирекцията за национален строителен контрол', 'Главният архитект на общината', 'Областният управител', 'Агенцията по геодезия, картография и кадастър'], 0, 'За I–III категория разрешението за ползване се издава от ДНСК, а за IV и V категория удостоверението за въвеждане в експлоатация — от общината.'),
  ('zut-2-10', 'zut', 2, null, 'Какво е търпим строеж?', array['Стар строеж без строителни книжа, който не подлежи на премахване, защото е бил допустим по правилата', 'Строеж, който в момента се узаконява', 'Временна постройка, разрешена до 2 години', 'Строеж с изтекло разрешение за строеж'], 0, 'Търпимите строежи (§16 от ПР на ЗУТ и сходни разпоредби) не се премахват. За продажба често е нужно удостоверение за търпимост от общината.'),
  ('zut-2-11', 'zut', 2, null, 'Какво е право на строеж?', array['Право да построиш сграда върху чужда земя и да станеш собственик на сградата', 'Разрешението от общината, че може да се строи', 'Правото на съседа да надстрои етаж', 'Правото да ползваш чужда сграда срещу наем'], 0, 'Правото на строеж (суперфиция) е ограничено вещно право по Закона за собствеността. Така работят повечето сделки „обезщетение срещу строеж“ със собствениците на земя.'),
  ('zut-2-12', 'zut', 2, null, 'Кой закон урежда общото събрание, управителя и фонд „Ремонт и обновяване“ в една сграда?', array['Законът за управление на етажната собственост (ЗУЕС)', 'Законът за устройство на територията (ЗУТ)', 'Законът за задълженията и договорите (ЗЗД)', 'Законът за местните данъци и такси (ЗМДТ)'], 0, 'ЗУЕС урежда управлението на сградите в режим на етажна собственост. Купувачът е добре да попита за задълженията към етажната собственост и за предстоящи ремонти.'),
  ('zut-3-01', 'zut', 3, null, 'След колко години се погасява по давност неупражнено право на строеж?', array['5 години', '3 години', '10 години', 'Не се погасява'], 0, 'По чл. 67 от Закона за собствеността правото на строеж се погасява в полза на собственика на земята, ако не се упражни в продължение на 5 години.'),
  ('zut-3-02', 'zut', 3, null, 'Според §16 от ПР на ЗУТ строежите без книжа, изградени до коя дата, могат да са търпими (ако са били допустими)?', array['До 7 април 1987 г.', 'До 10 ноември 1989 г.', 'До 31 декември 1999 г.', 'До 1 януари 2007 г.'], 0, 'Строежи, изградени до 7 април 1987 г. без строителни книжа, но допустими по плановете и правилата тогава или сега, са търпими и не се премахват.'),
  ('zut-3-03', 'zut', 3, null, 'Парцел от 500 м² е с Кинт 1,2 и плътност 60%. Колко етажа при пълна плътност позволява Кинт?', array['2 етажа', '3 етажа', '4 етажа', '1 етаж'], 0, 'РЗП = 1,2 × 500 = 600 м². ЗП = 60% × 500 = 300 м². 600 ÷ 300 = 2 етажа. При по-малка ЗП етажите могат да са повече, ако височината по плана позволява.'),
  ('zut-3-04', 'zut', 3, null, 'Включват ли се подземните етажи (гаражи, мазета) в РЗП при изчисляването на Кинт?', array['Не — в РЗП влизат застроените площи на надземните етажи', 'Да — влизат всички етажи на сградата', 'Да, но с коефициент 0,5', 'Само ако в тях има жилища'], 0, 'РЗП е сборът от застроените площи на надземните етажи. Затова подземните гаражи не „изяждат“ Кинт — важно при оценка на парцел за строеж.'),
  ('zut-3-05', 'zut', 3, null, 'Парцел от 1 000 м² с Кинт 2,0. Строителят дава на собственика на земята 40% от построеното. Колко м² РЗП получава собственикът?', array['800 м²', '400 м²', '1 200 м²', '2 000 м²'], 0, 'Общата РЗП е 2,0 × 1 000 = 2 000 м². 40% от нея са 800 м² за собственика на земята.'),
  ('zut-3-06', 'zut', 3, null, 'Каква е разликата между поземлен имот и УПИ?', array['Поземленият имот е по кадастъра, а УПИ — по плана за регулация; границите им може да не съвпадат', 'Няма разлика — двете означават едно и също', 'Поземлен имот е само земеделска земя, а УПИ — само градска', 'УПИ е частта от имота, върху която вече има сграда'], 0, 'Кадастърът описва имотите такива, каквито са. Регулацията определя каквито трябва да станат. При несъвпадение може да са нужни придаване на части или изменение на плана.'),
  ('zut-3-07', 'zut', 3, null, 'Кой издава заповед за премахване на незаконен строеж от IV–VI категория?', array['Кметът на общината', 'Началникът на ДНСК', 'Областният управител', 'Районният съд'], 0, 'За незаконни строежи от IV–VI категория заповедта е на кмета (чл. 225а ЗУТ), а за I–III категория — на началника на ДНСК (чл. 225 ЗУТ).'),
  ('zut-3-08', 'zut', 3, null, 'Строител продава апартамент „на Акт 14“. Какво проверявате задължително?', array['Разрешението за строеж, одобрените проекти, Акт 14 и правото на строителя върху земята', 'Само Акт 14 — щом го има, всичко е наред', 'Само дали строителят е регистриран по ДДС', 'Само рекламната брошура и разпределението'], 0, 'Разрешението за строеж и проектите показват какво точно се строи законно. Документът за земята или за правото на строеж показва, че строителят има право да продава.'),
  ('zut-3-09', 'zut', 3, null, 'Какво е ОУП?', array['Общ устройствен план — определя предназначението на териториите в цялата община', 'Отделен устройствен план за всяка сграда', 'Опис на урегулираните парцели в квартала', 'Одобрен устройствен проект на конкретна сграда'], 0, 'ОУП определя зоните (жилищни, смесени, производствени и т.н.) и общите показатели. Подробните планове (ПУП) трябва да са в съответствие с него.'),
  ('zut-3-10', 'zut', 3, null, 'Купувач иска къща в Жм зона и пита дали може да вдигне още един етаж. Откъде започвате проверката?', array['От действащия ПУП и ОУП — пределната височина, Кинт, плътност и вече използваната РЗП', 'От съседите — ако те не възразяват, може', 'От нотариалния акт — там пише колко етажа може да има', 'От данъчната оценка на имота'], 0, 'Какво може да се строи определят устройственият план и показателите му. Нужни са и проект, и разрешение за строеж. Добре е да се прецени дали показателите вече не са изчерпани.'),
  ('zut-3-11', 'zut', 3, null, 'Нова сграда има Акт 15, но още няма разрешение за ползване. Кое е вярно за купувача?', array['Сградата още не може законно да се ползва и банките обикновено чакат въвеждането в експлоатация', 'Може да се нанесе веднага — Акт 15 е достатъчен', 'Сградата е незаконна и сделката е нищожна', 'Акт 15 замества разрешението за ползване'], 0, 'Акт 15 е стъпка към въвеждането в експлоатация, но не я замества. Нанасянето и много банкови условия зависят от разрешението за ползване или удостоверението.'),
  ('law-1-01', 'law', 1, null, 'В каква форма трябва да е договорът за продажба на недвижим имот, за да прехвърли собствеността?', array['Нотариален акт', 'Писмен договор с нотариално заверени подписи', 'Писмен договор между страните', 'Договор, регистриран в общината'], 0, 'По чл. 18 ЗЗД договорите за прехвърляне на собственост върху недвижим имот се сключват с нотариален акт. Иначе са нищожни.'),
  ('law-1-02', 'law', 1, null, 'Кой плаща местния данък при придобиване на имот, ако не е уговорено друго?', array['Купувачът', 'Продавачът', 'Брокерът', 'Двамата поравно'], 0, 'Данъкът при придобиване се плаща от приобретателя — купувача. Страните могат да уговорят друго.'),
  ('law-1-03', 'law', 1, null, 'Колко е местният данък при придобиване на имот?', array['Между 0,1% и 3% — определя го общинският съвет', 'Винаги 2% от цената', '10% от печалбата на продавача', 'Фиксирани 500 € на сделка'], 0, 'Всяка община определя размера между 0,1% и 3%. В повечето големи градове е 3%. Основата е по-високата от договорената цена и данъчната оценка.'),
  ('law-1-04', 'law', 1, null, 'Откъде се вади удостоверение за данъчна оценка на имот?', array['От общината, в която се намира имотът', 'От общината по постоянния адрес на собственика', 'От НАП', 'От Агенцията по вписванията'], 0, 'Удостоверението (по чл. 264, ал. 1 ДОПК) се вади от общината по местонахождение на имота. То показва и дали данъкът и таксата за смет са платени.'),
  ('law-1-05', 'law', 1, null, 'Какво показва удостоверението за тежести?', array['Дали имотът има ипотеки, възбрани, искови молби и други вписвания', 'Колко тежи носещата конструкция на сградата', 'Дали има неплатени сметки за ток и вода', 'Каква е данъчната оценка на имота'], 0, 'Издава се от Службата по вписванията. Купувачът и банката винаги го искат — добре е да е проверено преди капаро.'),
  ('law-1-06', 'law', 1, null, 'Какво е капаро?', array['Сума, която обезпечава сделката: ако купувачът се откаже, я губи; ако продавачът се откаже, връща двойно', 'Безвъзмездна такса за брокера', 'Аванс, който винаги се връща изцяло', 'Задължителна вноска към нотариуса'], 0, 'По чл. 93 ЗЗД: ако неизправна е страната, дала капарото, другата може да го задържи; ако неизправна е получилата капарото, тя дължи двойния му размер.'),
  ('law-1-07', 'law', 1, null, 'Апартаментът е купен по време на брака на продавачите. Кой подписва продажбата?', array['И двамата съпрузи (или единият с пълномощно от другия)', 'Само този, който е посочен в нотариалния акт', 'Само съпругът, който е плащал кредита', 'Само единият, ако другият не възразява писмено'], 0, 'Имотите, купени по време на брака, обикновено са съпружеска имуществена общност — разпореждат се двамата съпрузи заедно.'),
  ('law-1-08', 'law', 1, null, 'Къде се вписва нотариалният акт за продажба?', array['В Службата по вписванията към Агенцията по вписванията', 'В общината, отдел „Местни данъци“', 'В НАП', 'В кадастъра'], 0, 'Нотариусът изпраща акта за вписване в Имотния регистър. Вписването прави сделката противопоставима на трети лица.'),
  ('law-1-09', 'law', 1, null, 'Какво е предварителен договор?', array['Писмен договор, с който страните се задължават да сключат окончателния договор при уговорените условия', 'Нотариален акт, който прехвърля собствеността', 'Устна уговорка между купувача и продавача', 'Договорът за посредничество с брокера'], 0, 'Предварителният договор е писмен (чл. 19 ЗЗД) и описва цената, сроковете, капарото и условията. Собствеността минава едва с нотариалния акт.'),
  ('law-1-10', 'law', 1, null, 'Откъде се вади удостоверение за наследници?', array['От общината по последния постоянен адрес на починалия', 'От общината, в която е имотът', 'От нотариуса', 'От районния съд'], 0, 'Удостоверението показва кои са наследниците. Вади се по последния постоянен адрес на починалия — не непременно там, където е имотът.'),
  ('law-1-11', 'law', 1, null, 'Каква е основната цел на договора за посредничество с клиента?', array['Да уреди писмено какво прави брокерът, срещу каква комисионна и кога тя се дължи', 'Да прехвърли собствеността върху имота', 'Да замени предварителния договор', 'Да даде на брокера право да подписва вместо клиента'], 0, 'Писменият договор предпазва и клиента, и брокера: ясни са услугата, комисионната, срокът и случаите, в които тя се дължи.'),
  ('law-2-01', 'law', 2, null, 'Какво е правото на ползване?', array['Право да ползваш чужд имот и да получаваш добивите от него, без да си собственик', 'Правото на собственика да живее в имота си', 'Договор за наем с нотариална заверка', 'Правото на съседите да минават през двора'], 0, 'Правото на ползване е ограничено вещно право. Учредено в полза на човек, най-често е пожизнено, ако не е уговорен срок.'),
  ('law-2-02', 'law', 2, null, 'Купувач купува апартамент, в който продавачът си запазва пожизнено право на ползване. Какво получава купувачът?', array['Собствеността, но без правото да ползва имота, докато правото на ползване не се погаси', 'Пълна собственост — ползвателят трябва да напусне', 'Само право на ползване', 'Нищо — такава сделка е нищожна'], 0, 'Купувачът става собственик („гола собственост“), а ползвателят живее в имота до погасяването на правото — обикновено до смъртта си. Това се отразява силно на цената.'),
  ('law-2-03', 'law', 2, null, 'Какво дължи продавачът, ако се откаже от сделката без основание, след като е получил капаро?', array['Двойния размер на капарото', 'Само да върне капарото, без лихва', 'Половината от капарото', 'Нищо, ако се откаже до 30 дни'], 0, 'Чл. 93, ал. 2 ЗЗД: ако неизправна е страната, получила капарото, тя трябва да го върне в двоен размер.'),
  ('law-2-04', 'law', 2, null, 'Продавачът по предварителен договор отказва да подпише нотариалния акт. Какво може да направи купувачът?', array['Да предяви иск за обявяване на предварителния договор за окончателен (чл. 19, ал. 3 ЗЗД)', 'Нищо друго, освен да си поиска капарото', 'Да помоли нотариуса да подпише вместо продавача', 'Да впише имота на свое име в кадастъра'], 0, 'Съдът може да обяви предварителния договор за окончателен, ако купувачът изпълни своите задължения (например плати цената). Алтернативата е да развали договора и да търси капарото или обезщетение.'),
  ('law-2-05', 'law', 2, null, 'Апартамент е наследен от единия съпруг по време на брака. Чий е?', array['Личен — на съпруга, който го е наследил', 'Общ на двамата, защото е придобит по време на брака', 'Половината е на другия съпруг', 'Общ, ако семейството живее в него'], 0, 'Имуществото, придобито по наследство или дарение, е лично (чл. 22 от Семейния кодекс). Продава го само наследилият съпруг.'),
  ('law-2-06', 'law', 2, null, 'Съсобственик иска да продаде своята идеална част от имот на трето лице. Кой има право на изкупуване?', array['Другите съсобственици — първо трябва да им се предложи на същата цена', 'Общината', 'Съседите по регулация', 'Наемателят на имота'], 0, 'Чл. 33 от Закона за собствеността: съсобственикът първо предлага частта си на другите съсобственици. Ако не го направи, те могат да я изкупят по съдебен ред.'),
  ('law-2-07', 'law', 2, null, 'Колко е таксата за вписване на нотариален акт за продажба?', array['0,1% от цената (материалния интерес)', '1% от цената', '3% от цената', 'Фиксирана такса от 50 €'], 0, 'Агенцията по вписванията събира 0,1% от материалния интерес. Към нея се добавят нотариалната такса и местният данък.'),
  ('law-2-08', 'law', 2, null, 'С какво пълномощно може да се продаде имот от името на собственика?', array['Изрично нотариално заверено пълномощно — със заверка на подписа и съдържанието', 'Обикновено писмено пълномощно', 'Пълномощно с подпис, заверен в общината', 'Устно съгласие пред двама свидетели'], 0, 'Пълномощното трябва да е изрично за сделката и в нотариалната форма по чл. 37 ЗЗД. Пълномощно от чужбина — в българско консулство или с апостил и превод.'),
  ('law-2-09', 'law', 2, null, 'По кой закон брокерите на имоти са задължени да проверяват клиентите си?', array['Законът за мерките срещу изпирането на пари (ЗМИП)', 'Законът за защита на потребителите', 'Законът за счетоводството', 'Законът за кредитните институции'], 0, 'Лицата, които по занятие посредничат при сделки с имоти, са задължени лица по ЗМИП: идентифицират клиентите, правят комплексна проверка и пазят документите.'),
  ('law-2-10', 'law', 2, null, 'Каква декларация подписва купувачът при сделка, когато го изисква законът срещу изпирането на пари?', array['Декларация за произхода на средствата', 'Декларация за семейното положение на продавача', 'Декларация, че не притежава друг имот', 'Декларация за данъчната оценка'], 0, 'Декларацията за произхода на средствата се изисква по ЗМИП. Подписва се пред нотариуса, а при посредничеството — и пред брокера.'),
  ('law-2-11', 'law', 2, null, 'Каква е данъчната основа на местния данък при придобиване?', array['По-високата от договорената цена и данъчната оценка', 'Винаги данъчната оценка', 'Винаги договорената цена', 'Пазарната оценка на банката'], 0, 'Данъкът се изчислява върху по-високата от двете стойности. Затова деклариране на ниска цена не намалява данъка под този върху данъчната оценка.'),
  ('law-3-01', 'law', 3, null, 'Колко години трябва да се пазят документите от проверката на клиент по ЗМИП?', array['5 години', '1 година', '3 години', '10 години'], 0, 'ЗМИП изисква документите и информацията от комплексната проверка да се пазят 5 години.'),
  ('law-3-02', 'law', 3, null, 'До кого се съобщава съмнителна операция по ЗМИП?', array['До ДАНС — дирекция „Финансово разузнаване“', 'До НАП', 'До районното управление на МВР', 'До БНБ'], 0, 'Съмнения за изпиране на пари се съобщават на дирекция „Финансово разузнаване“ на ДАНС — преди сделката, когато е възможно, без да се уведомява клиентът.'),
  ('law-3-03', 'law', 3, null, 'Физическо лице продава единствения си апартамент, притежаван 4 години. Дължи ли данък върху печалбата?', array['Не — продажбата на един жилищен имот в годината, притежаван над 3 години, не се облага', 'Да — 10% от печалбата', 'Да — 10% от цялата цена', 'Да — 3% местен данък върху цената'], 0, 'По ЗДДФЛ доходът от продажба на един жилищен имот в годината не се облага, когато между придобиването и продажбата са минали над 3 години. При друг случай е добре клиентът да се посъветва със счетоводител.'),
  ('law-3-04', 'law', 3, null, 'Колко време запазва действието си вписаната ипотека?', array['10 години от вписването, ако не бъде подновена', '5 години', 'До изплащане на кредита, без срок', '20 години'], 0, 'По чл. 172 ЗЗД вписването на ипотеката запазва действието си 10 години. Банките я подновяват преди срока, ако кредитът още не е изплатен.'),
  ('law-3-05', 'law', 3, null, 'Имотът е под възбрана. Кое е вярно?', array['Продажбата не може да се противопостави на взискателя — възбраната трябва да се вдигне преди сделката', 'Нотариусът я заличава при продажбата', 'Възбраната отпада автоматично при продажба', 'Не е проблем, ако купувачът плати в брой'], 0, 'Възбраната е обезпечителна мярка: последващите сделки са непротивопоставими на кредитора. Нужна е проверка в Службата по вписванията и заличаване преди сделката.'),
  ('law-3-06', 'law', 3, null, 'Пълномощно за продажба е издадено в чужбина. Кое е правилно?', array['Заверено в българско консулство или от местен нотариус с апостил и превод на български', 'Всяко пълномощно от чужбина е валидно без заверка', 'Нужно е само да е преведено на български', 'Пълномощно от чужбина не се приема за имоти'], 0, 'Пълномощното трябва да е в нотариалната форма. От чужбина — в българско консулство или от местния нотариус с апостил и легализиран превод.'),
  ('law-3-07', 'law', 3, null, 'Наследниците не са подали декларация по чл. 32 ЗМДТ. Какво пречи на продажбата?', array['Общината не може да издаде удостоверение за данъчна оценка на тяхно име', 'Нотариусът не може да състави удостоверение за наследници', 'Имотът се смята за общинска собственост', 'Нищо — декларацията не е нужна за продажбата'], 0, 'Наследниците подават декларацията в общината по последния адрес на починалия до 6 месеца от смъртта. Без нея няма данъчна оценка на тяхно име, а без нея няма сделка.'),
  ('law-3-08', 'law', 3, null, 'Строител, регистриран по ДДС, продава апартамент в нова сграда. Кое е вярно?', array['Продажбата е облагаема с 20% ДДС, обикновено включен в цената', 'Продажбите на жилища винаги са освободени от ДДС', 'ДДС плаща купувачът отделно на НАП', 'ДДС се начислява само върху паркоместата'], 0, 'Доставката на нова сграда е облагаема по ЗДДС. Продажбата на сграда, която вече не е „нова“ по смисъла на закона, обикновено е освободена от ДДС.'),
  ('law-3-09', 'law', 3, null, 'Купувачът иска в нотариалния акт да се впише по-ниска цена от реалната. Как реагирате?', array['Отказвате — това е невярно деклариране, рисково за двете страни, а данъкът се плаща поне върху данъчната оценка', 'Съгласявате се — така купувачът спестява данък', 'Съгласявате се, ако и продавачът е съгласен', 'Предлагате разликата да се плати като комисионна'], 0, 'Невярната цена създава риск при спор (купувачът доказва по-малко платено), при проверка от НАП и по ЗМИП. Професионалният брокер не участва в това.'),
  ('law-3-10', 'law', 3, null, 'Купувачът е фирма. Какво допълнително се проверява?', array['Кой представлява фирмата по Търговския регистър и кой е действителният ѝ собственик по ЗМИП', 'Само дали фирмата е регистрирана по ДДС', 'Само личната карта на управителя', 'Нищо — фирмите не се проверяват'], 0, 'Проверява се актуалното състояние в Търговския регистър (кой подписва) и действителният собственик — изискване по ЗМИП.'),
  ('law-3-11', 'law', 3, null, 'Купувач — гражданин на държава извън ЕС — иска къща с двор. Кое е вярно?', array['Не може да придобие земята; може да купи сградата с право на строеж или чрез българска фирма', 'Може да купи всичко без ограничения', 'Не може да купи никакъв имот в България', 'Може, ако плати двоен данък при придобиване'], 0, 'Конституцията не позволява на чужденци извън ЕС (без международен договор) да придобиват земя, освен по наследство по закон. Апартаменти и сгради могат да купуват.'),
  ('buyers-1-01', 'buyers', 1, null, 'Кое е най-важно да разберете от купувача още в първия разговор?', array['Какво търси, защо купува, какъв е бюджетът и кога иска да купи', 'Само любимия му квартал', 'Какви имоти е гледал при колегите', 'Дали има деца в училищна възраст'], 0, 'Нуждата, мотивът, бюджетът и срокът определят дали и как да работите с купувача. Без тях огледите са на сляпо.'),
  ('buyers-1-02', 'buyers', 1, null, 'Кога е най-добре да се обадите на нов купувач, който е пратил запитване?', array['Веднага — до 5 минути', 'До края на деня', 'На следващата сутрин', 'След като му пратите оферти по имейл'], 0, 'Speed to lead: шансът да го спечелите пада рязко с всяка минута. Първият брокер, който се обади, най-често води клиента.'),
  ('buyers-1-03', 'buyers', 1, null, 'Купувач казва: „Покажете ми всички тристайни в града.“ Какво правите?', array['Задавате въпроси, за да стесните търсенето, и показвате само подходящите', 'Изпращате му всички налични обяви', 'Казвате му да разгледа сайтовете сам', 'Насрочвате 10 огледа за един ден'], 0, 'Повече огледи не значи повече сделки. Квалификацията спестява време и показва на купувача, че разбирате какво му трябва.'),
  ('buyers-1-04', 'buyers', 1, null, 'Какво подписва купувачът при оглед?', array['Протокол (огледен лист) с имотите, които е видял с вас', 'Предварителен договор', 'Пълномощно за брокера', 'Декларация за произхода на средствата'], 0, 'Огледният лист доказва, че имотът е показан от вас. Той пази комисионната, ако купувачът се опита да заобиколи брокера.'),
  ('buyers-1-05', 'buyers', 1, null, 'Купувачът ще ползва кредит. Каква е първата стъпка преди огледите?', array['Предварително одобрение от банка — за да знае реалния си бюджет', 'Да даде капаро за подходящ имот', 'Да избере нотариус', 'Да поиска оценка на имота'], 0, 'С предварителното одобрение купувачът знае колко може да вземе. Вие показвате имоти в реалния бюджет и не губите сделки на финала.'),
  ('buyers-1-06', 'buyers', 1, null, 'Кой купувач е „горещ“ (лента A)?', array['Този, който ще купи в следващите 14–30 дни', 'Този, който ще купи след 3–6 месеца', 'Този, който само следи пазара', 'Всеки купувач с бюджет над 100 000 €'], 0, 'Лентите в BRIXA са по срока: A — до 30 дни, B — 30–90 дни, C — над 90 дни. Срокът определя колко често и как се чувате.'),
  ('buyers-1-07', 'buyers', 1, null, 'Колко често да се чувате с горещ купувач (лента A)?', array['Поне два пъти седмично', 'Веднъж месечно', 'Само когато излезе нов имот', 'Веднъж на 3 месеца'], 0, 'Горещият купувач решава сега. Ако не го държите информиран, ще купи чрез някой, който го прави.'),
  ('buyers-1-08', 'buyers', 1, null, 'Купувачът пита какви разходи има освен цената. Какво включвате?', array['Местния данък при придобиване, нотариалната такса, таксата за вписване и комисионната, ако е уговорена', 'Само комисионната', 'Само нотариалната такса', 'ДДС върху цената при всеки имот'], 0, 'Разходите обикновено са около 3–5% от цената. Купувачът трябва да ги знае предварително, особено при кредит, който покрива само цената.'),
  ('buyers-1-09', 'buyers', 1, null, 'Какво значи „двустаен апартамент“ в България?', array['Дневна и една спалня (две стаи), плюс кухня или кухненски бокс и баня', 'Две спални и отделна дневна', 'Апартамент с две бани', 'Апартамент на два етажа'], 0, 'Броят стаи включва дневната. Тристайният има дневна и две спални. Купувачите от чужбина често броят само спалните — уточнете.'),
  ('buyers-1-10', 'buyers', 1, null, 'Какво правите в същия ден след оглед?', array['Чувате се с купувача за впечатленията и записвате обратната връзка', 'Нищо — купувачът ще се обади, ако хареса', 'Пращате на собственика фактура', 'Пускате имота отново в рекламата'], 0, 'Обратната връзка показва накъде да продължите и е ценна за собственика. Записана в BRIXA, тя влиза и в отчета му.'),
  ('buyers-2-01', 'buyers', 2, null, 'Купувачът харесва имота, но казва „Ще помисля.“ Кой е най-добрият следващ въпрос?', array['„Какво точно ви кара да се колебаете?“', '„Добре, обадете ми се, когато решите.“', '„Имотът няма да чака — решете сега!“', '„Да ви покажа ли още десет имота?“'], 0, '„Ще помисля“ обикновено крие конкретно възражение — цена, локация, партньор, финансиране. Като го научите, можете да работите с него.'),
  ('buyers-2-02', 'buyers', 2, null, 'Какво проверявате с квалификацията BANT?', array['Бюджета, кой взима решението, нуждата и срока', 'Банката, адреса, номера и телефона', 'Бюджета, агенцията, нотариуса и таксите', 'Броя стаи, асансьора, новото строителство и терасата'], 0, 'BANT: Budget, Authority, Need, Timeline. Ако едно от тях липсва, купувачът още не е готов за огледи.'),
  ('buyers-2-03', 'buyers', 2, null, 'Купувач идва чрез колега от друга агенция. Какво уточнявате преди огледа?', array['Писмено как се дели комисионната и кой какво поема', 'Нищо — ще го уточните след сделката', 'Само телефона на купувача', 'Дали колегата ще присъства на огледа'], 0, 'Споразумението между агенциите, договорено писмено предварително, предотвратява спорове на финала.'),
  ('buyers-2-04', 'buyers', 2, null, 'Купувачът иска да предложи 20% под цената. Какво правите?', array['Показвате му сравними продажби и предавате писмена оферта на собственика', 'Отказвате да предадете офертата', 'Предавате я устно, без да коментирате', 'Казвате му, че собственикът ще се обиди'], 0, 'Всяка сериозна оферта се предава. Данните помагат на купувача да е реалист, а писмената оферта показва сериозност.'),
  ('buyers-2-05', 'buyers', 2, null, 'Кога купувачът трябва да види удостоверението за тежести?', array['Преди да даде капаро или да подпише предварителен договор', 'След нотариалния акт', 'Не е нужно — нотариусът проверява', 'Само ако купува с кредит'], 0, 'Ипотека или възбрана, открити след капарото, водят до спор и забавяне. Проверката е проста и евтина — направете я рано.'),
  ('buyers-2-06', 'buyers', 2, null, 'Купувач на ново строителство: какво проверявате за строителя?', array['Разрешението за строеж, собствеността на земята и завършените му сгради', 'Само рекламата и визуализациите', 'Само цената на кв. м', 'Само дали има офис продажби'], 0, 'Добрият строител има история, законни книжа и право да строи. Предишните му сгради показват качеството и сроковете.'),
  ('buyers-2-07', 'buyers', 2, null, 'Купувачът иска втори оглед с родителите си. Как реагирате?', array['Насрочвате го бързо — това е силен сигнал за интерес', 'Отказвате — един оглед стига', 'Казвате му да дойдат сами, без вас', 'Изчаквате седмица, за да не изглеждате нетърпеливи'], 0, 'Вторият оглед с хората, които влияят на решението, често е последната стъпка преди оферта.'),
  ('buyers-2-08', 'buyers', 2, null, 'Купувачът се колебае между два имота. Кое помага най-много?', array['Сравнение по критериите, които той сам е посочил като най-важни', 'Да му кажете кой имот ви носи по-голяма комисионна', 'Да му покажете трети имот', 'Да го оставите да реши сам след месец'], 0, 'Върнете купувача към собствените му приоритети — това е честно и ускорява решението.'),
  ('buyers-2-09', 'buyers', 2, null, 'Защо е важно офертата на купувача да е писмена?', array['Показва сериозност, условията са ясни и собственикът може да отговори конкретно', 'Защото устните оферти са незаконни', 'Защото така брокерът получава комисионна', 'Не е важно — устната оферта е същото'], 0, 'Писмената оферта описва цена, капаро, срокове и условия. Тя предотвратява недоразумения и е основа за насрещно предложение.'),
  ('buyers-2-10', 'buyers', 2, null, 'Купувач от друга държава от ЕС иска да купи апартамент. Може ли?', array['Да — при същите условия като българските граждани', 'Не — само чрез българска фирма', 'Само ако има постоянен адрес в България', 'Само с разрешение от общината'], 0, 'Гражданите на ЕС могат да придобиват имоти, включително земя, както българските граждани.'),
  ('buyers-3-01', 'buyers', 3, null, 'Двама купувачи искат един и същ имот. Как постъпвате правилно?', array['Информирате собственика за двете оферти и той решава, без да издавате условията на единия на другия', 'Давате имота на първия, без да казвате на собственика', 'Казвате на всеки офертата на другия, за да вдигнат цената', 'Избирате купувача, с когото комисионната е по-голяма'], 0, 'Собственикът решава. Брокерът е честен с двете страни и пази поверителността на всяка оферта.'),
  ('buyers-3-02', 'buyers', 3, null, 'Купувачът дава 10% капаро, но кредитът му още не е одобрен. Как да е уредено, за да не загуби капарото?', array['С изрично условие в предварителния договор, че при отказ на банката капарото се връща', 'Не може да се уреди — капарото винаги се губи', 'Достатъчно е устно обещание на продавача', 'Чрез по-малко капаро без договор'], 0, 'Условие за финансиране (с краен срок) пази купувача. Продавачът пък знае докога чака.'),
  ('buyers-3-03', 'buyers', 3, null, 'Купувач иска да купи на името на фирмата си. Какво се променя за сделката?', array['Подписва представителят по Търговския регистър, проверява се действителният собственик по ЗМИП и се обсъждат данъчните последици', 'Нищо не се променя', 'Сделката може да е само с кредит', 'Фирмите не плащат данък при придобиване'], 0, 'Покупката от фирма има своя логика — данъци, амортизация, ДДС. Клиентът е добре да се посъветва със счетоводител преди сделката.'),
  ('buyers-3-04', 'buyers', 3, null, 'Оценката на банката излиза по-ниска от договорената цена. Какво значи това за купувача?', array['Банката ще кредитира процент от по-ниската оценка — разликата трябва да се покрие от него или да се договори по-ниска цена', 'Банката автоматично ще отпусне повече', 'Сделката е невалидна', 'Нищо — банката гледа само договорената цена'], 0, 'Банката кредитира процент от по-ниската от двете стойности. Предупредете купувача рано и имайте резервен план.'),
  ('buyers-3-05', 'buyers', 3, null, 'Купувач-инвеститор сравнява имот с 6% доходност от наем и имот с 4,5%, но в квартал с бърз ръст на цените. Кое е вярно?', array['Общата възвръщаемост е доходността от наема плюс ръста на цената — вторият може да е по-добър дългосрочно', 'Винаги е по-добър имотът с по-висока доходност от наем', 'Ръстът на цените не е от значение за инвеститора', 'Двата имота са равностойни'], 0, 'Инвеститорът гледа и паричния поток (наема), и ръста на стойността — и риска при двете.'),
  ('buyers-3-06', 'buyers', 3, null, 'Купувачът казва, че максимумът му е 150 000 €, но предлага 140 000 €. Какво правите с тази информация?', array['Пазите я — не я казвате на продавача без съгласието на купувача', 'Казвате на продавача, за да вдигне цената', 'Записвате я в обявата', 'Казвате на всички колеги'], 0, 'Поверителната информация на клиента не се споделя с другата страна. Това е основа на доверието.'),
  ('buyers-3-07', 'buyers', 3, null, 'Купувачът иска да плати част от цената в брой извън нотариалния акт. Кое е най-правилно?', array['Цялата цена да е в акта и да се плати по банков път', 'Да, ако продавачът е съгласен', 'Да, ако сумата е под 10% от цената', 'Да, ако бъде платена при брокера'], 0, 'Плащането по сметка оставя следа и пази купувача при спор. Неописаните суми са риск и по ЗМИП, и пред НАП.'),
  ('buyers-3-08', 'buyers', 3, null, 'Купувачът е видял 25 имота и не купува. Какъв е най-вероятният проблем?', array['Квалификацията — критериите или бюджетът не са реалистични, или той не е готов да купи', 'Купувачът просто не е видял правилния имот', 'Пазарът е твърде малък', 'Купувачът има нужда от още огледи'], 0, 'Много огледи без оферта значат, че трябва да се върнете към нуждата, бюджета и мотива — или да приемете, че купувачът е в лента C.'),
  ('buyers-3-09', 'buyers', 3, null, 'Купувачът иска да продаде своя имот, за да купи нов. Как подреждате процеса?', array['Продажбата и покупката се синхронизират — с условия и срокове в предварителните договори', 'Първо купува, после мисли за продажбата', 'Първо продава, а после търси, дори да остане без жилище', 'Не е работа на брокера'], 0, 'Синхронизираната сделка (продажба и покупка) иска условия за срокове и плащания. Така клиентът не остава без жилище или без пари.'),
  ('buyers-3-10', 'buyers', 3, null, 'Купувач иска да види имот, но не иска да подпише огледен лист. Какво правите?', array['Обяснявате, че листът пази и двете страни, и не показвате без него', 'Показвате имота и се надявате на коректност', 'Пращате му адреса, за да отиде сам', 'Отказвате да работите с него завинаги'], 0, 'Огледният лист е стандарт и не задължава купувача да купи. Без него не можете да докажете работата си.'),
  ('sellers-1-01', 'sellers', 1, null, 'Кой е първият документ, който искате от продавача?', array['Документът за собственост — нотариален акт или друг', 'Личната му карта и банкова сметка', 'Сметките за ток и вода', 'Скица от общината'], 0, 'Документът за собственост показва кой може да продава, какво точно се продава и на какво основание е придобит имотът.'),
  ('sellers-1-02', 'sellers', 1, null, 'Как определяте правилната обявена цена?', array['По сравними продадени и активни имоти в района (сравнителен анализ)', 'По цената, която собственикът иска', 'Като добавите 20% отгоре за пазарене', 'По данъчната оценка'], 0, 'Пазарът определя цената. Сравнителният анализ с реално продадени имоти е най-силният аргумент пред собственика.'),
  ('sellers-1-03', 'sellers', 1, null, 'Какво се случва с имот, обявен на твърде висока цена?', array['Стои дълго на пазара, губи интерес и накрая се продава по-евтино', 'Продава се по-бързо, защото изглежда луксозен', 'Привлича повече купувачи', 'Нищо — купувачите винаги пазаряват'], 0, 'Първите седмици са най-силни. Надцененият имот ги пропилява и после „изтърканата“ обява се продава под пазарната цена.'),
  ('sellers-1-04', 'sellers', 1, null, 'Кое е най-важно за снимките на имота?', array['Подреден и светъл имот, снимки на дневна светлина, от правилни ъгли', 'Много снимки на мебелите отблизо', 'Само снимки на фасадата', 'Филтри, които карат стаите да изглеждат по-големи'], 0, 'Снимките продават огледа. Те трябва да са истински — подвеждащата снимка губи купувача на място.'),
  ('sellers-1-05', 'sellers', 1, null, 'Какво е ексклузивен договор?', array['Договор, с който собственикът възлага продажбата само на вашата агенция за определен срок', 'Договор с най-висока комисионна', 'Договор, при който собственикът продава сам', 'Договор само за луксозни имоти'], 0, 'При ексклузивност има един отговорен брокер, една цена на пазара и пълна инвестиция в продажбата.'),
  ('sellers-1-06', 'sellers', 1, null, 'Защо ексклузивният договор е по-добър и за продавача?', array['Брокерът инвестира в реклама и има един ясен отговорен човек и една цена на пазара', 'Защото така продавачът плаща по-малко данъци', 'Защото купувачите плащат по-висок данък', 'Няма полза за продавача'], 0, 'Имот, обявен от пет агенции на пет цени, изглежда отчаян. Един брокер с план продава по-бързо и на по-добра цена.'),
  ('sellers-1-07', 'sellers', 1, null, 'Какво подготвя продавачът преди огледите?', array['Почистване, подреждане, светлина, дребни ремонти и прибиране на личните вещи', 'Нищо — купувачите гледат само цената', 'Нов скъп ремонт на целия имот', 'Списък с цените на мебелите'], 0, 'Първото впечатление се създава за секунди. Чист, светъл и подреден имот се продава по-бързо и по-скъпо.'),
  ('sellers-1-08', 'sellers', 1, null, 'Колко често да информирате продавача какво става с имота?', array['Редовно — поне веднъж седмично: огледи, обратна връзка, интерес', 'Само когато има купувач', 'Веднъж месечно', 'Не е нужно, ако имотът е обявен'], 0, 'Собствениците най-често сменят брокера, защото „не знаят какво се случва“. Отчетът за собственика в BRIXA решава това.'),
  ('sellers-1-09', 'sellers', 1, null, 'Каква е комисионната при 3% от продажна цена 120 000 €?', array['3 600 €', '3 000 €', '4 000 €', '360 €'], 0, '3% × 120 000 € = 3 600 €. В BRIXA комисионната се изчислява автоматично от процента и цената.'),
  ('sellers-1-10', 'sellers', 1, null, 'Кое описание на обява работи най-добре?', array['Конкретни факти и ползи: площ, разпределение, изложение, близост до важни места', 'Само превъзходни степени: „уникален“, „невероятен“, „луксозен“', 'Само цената и телефона', 'Целият текст с главни букви'], 0, 'Купувачът търси информация. Конкретните факти печелят доверие и носят по-качествени запитвания.'),
  ('sellers-2-01', 'sellers', 2, null, 'Какво включва добрият сравнителен пазарен анализ за продавача?', array['Сравними продадени, активни и изтеглени имоти, отстъпката от обявената цена и времето за продажба', 'Само обявите в най-големия сайт', 'Само данъчната оценка', 'Само цената, която продавачът иска'], 0, 'Продадените показват реалната цена, активните — конкуренцията, а изтеглените — какво пазарът е отказал.'),
  ('sellers-2-02', 'sellers', 2, null, 'Имотът е 60 дни на пазара с много огледи, но без нито една оферта. Кой е най-вероятният проблем?', array['Цената спрямо това, което купувачите виждат на място', 'Рекламата', 'Снимките', 'Купувачите не са сериозни'], 0, 'Много огледи значат, че рекламата работи. Липсата на оферти показва, че на място имотът не оправдава цената.'),
  ('sellers-2-03', 'sellers', 2, null, 'Имотът има малко запитвания и огледи. Кое проверявате първо?', array['Цената и представянето в обявата — снимки, заглавие, описание', 'Дали купувачите са на почивка', 'Дали собственикът е учтив', 'Броя на сайтовете — трябват поне 20'], 0, 'Малкото запитвания значат, че обявата не впечатлява на фона на конкуренцията — заради цената или заради представянето.'),
  ('sellers-2-04', 'sellers', 2, null, 'Защо пращате на собственика редовен отчет за огледите и обратната връзка?', array['Показва работата ви и подготвя разговора за цената с факти', 'За да запълните пощата му', 'Защото законът го изисква', 'За да му поискате още комисионна'], 0, 'Когато собственикът сам вижда, че 12 купувачи казват „скъпо“, корекцията на цената е негово решение, а не ваш натиск.'),
  ('sellers-2-05', 'sellers', 2, null, 'Продавачът има ипотечен кредит върху имота. Как става продажбата?', array['Остатъкът по кредита се изплаща от цената при сделката и ипотеката се заличава', 'Не може да се продава, докато кредитът не е изплатен изцяло', 'Купувачът поема кредита автоматично', 'Ипотеката остава, но не е проблем'], 0, 'Банката на продавача дава писмо за точния остатък. Обикновено той се плаща от цената при нотариуса, а после ипотеката се заличава.'),
  ('sellers-2-06', 'sellers', 2, null, 'Продавачът иска да скрие от купувача, че има теч. Как реагирате?', array['Обяснявате, че за скрит недостатък продавачът отговаря — по-добре честно разкриване и цена според състоянието', 'Съгласявате се — не е ваша работа', 'Казвате на купувача след сделката', 'Ремонтирате го набързо с боя'], 0, 'По ЗЗД продавачът отговаря за скритите недостатъци. Скритият проблем почти винаги излиза и води до спор, развалена сделка и загубена репутация.'),
  ('sellers-2-07', 'sellers', 2, null, 'Имотът е наследен от трима наследници, единият е в чужбина. Какво подготвяте?', array['Удостоверение за наследници и пълномощно от наследника в чужбина (консулство или апостил)', 'Само личните карти на двамата в България', 'Нищо — подписва само най-големият наследник', 'Решение на съда за делба'], 0, 'Подписват всички наследници — лично или чрез пълномощник. Пълномощното от чужбина отнема време, затова се поръчва рано.'),
  ('sellers-2-08', 'sellers', 2, null, 'Как предлагате намаление на цената на продавача?', array['С данните от отчета — огледи, обратна връзка, сравними продажби — и конкретна нова цена', 'Казвате му, че иначе спирате да работите', 'Намалявате я в обявата, без да го питате', 'Чакате той да се сети'], 0, 'Фактите превръщат неприятния разговор в бизнес решение. Конкретната цена с аргументи се приема по-лесно от „трябва да свалим“.'),
  ('sellers-2-09', 'sellers', 2, null, 'Продавачът иска 150 000 €, а анализът показва 135 000 €. Каква е честната стратегия?', array['Показвате данните и се договаряте за начална цена и срок, след който тя се преразглежда', 'Приемате 150 000 € и мълчите', 'Обещавате му 160 000 €, за да вземете имота', 'Отказвате имота без обяснение'], 0, 'Ясната уговорка („ако до 30 дни няма оферта, коригираме“) пази времето и на двама ви.'),
  ('sellers-2-10', 'sellers', 2, null, 'Продавачът иска имотът да се предлага „от ръкава“ — без публична обява. Как работите?', array['Предлагате го дискретно на подходящи купувачи и колеги, без публична реклама', 'Пускате го във всички сайтове', 'Отказвате — без реклама не се продава', 'Публикувате го без снимки'], 0, 'Дискретната продажба е удачна за собственици, които не искат публичност. Работите със собствената си база купувачи и с доверени колеги.'),
  ('sellers-3-01', 'sellers', 3, null, 'Цена 180 000 €, остатък по кредита на продавача 60 000 €, комисионна 3%. Колко получава продавачът (без други разходи)?', array['114 600 €', '120 000 €', '174 600 €', '125 400 €'], 0, 'Комисионна: 3% × 180 000 = 5 400 €. 180 000 − 60 000 − 5 400 = 114 600 €.'),
  ('sellers-3-02', 'sellers', 3, null, 'Продавачът има оферта A: 145 000 € с кредит и срок 60 дни, и оферта B: 140 000 € собствени средства до 15 дни. Как го съветвате?', array['Сравнявате сигурността, сроковете и нетния резултат — по-ниската сигурна оферта може да е по-добра', 'Винаги приемате по-високата цена', 'Винаги приемате плащането в брой', 'Отхвърляте и двете и чакате повече'], 0, 'Кредитът носи риск от отказ или ниска оценка. Разликата от 5 000 € може да струва по-малко от два месеца несигурност.'),
  ('sellers-3-03', 'sellers', 3, null, 'Кои клаузи в договора за посредничество са най-важни?', array['Срокът, цената, комисионната, какво прави брокерът и кога се дължи комисионната', 'Само телефонът на собственика', 'Само цената на имота', 'Само подписът на брокера'], 0, 'Ясните условия предотвратяват спорове — особено кога комисионната се дължи, ако купувачът се появи след края на договора.'),
  ('sellers-3-04', 'sellers', 3, null, 'Кога брокерът има право на комисионна по договор за посредничество?', array['Когато сделката е сключена в резултат на неговото посредничество, при условията на договора', 'Само ако имотът се продаде на обявената цена', 'Още при подписването на договора', 'Само при ексклузивен договор'], 0, 'Комисионната се дължи за резултата от посредничеството — договорът казва кога и колко. Затова огледните листове и записите са важни.'),
  ('sellers-3-05', 'sellers', 3, null, 'Защо първите 2–3 седмици на имота на пазара са най-важни?', array['Тогава го виждат всички активни купувачи — правилната цена от началото носи най-много оферти', 'Защото сайтовете са безплатни тогава', 'Защото тогава данъците са по-ниски', 'Не са важни — важни са последните седмици'], 0, 'Новата обява получава най-много внимание. Ако цената е грешна, най-добрите купувачи вече са я видели и отминали.'),
  ('sellers-3-06', 'sellers', 3, null, 'Продава се къща с двор в регулация. Кои документи са специфични?', array['Скица на поземления имот (и на сградата) и строителни книжа или удостоверение за търпимост', 'Само схема на самостоятелен обект', 'Само удостоверение за данъчна оценка', 'Само разрешение от съседите'], 0, 'За къща и парцел вместо схема на апартамент се вади скица. Старите сгради без книжа искат удостоверение за търпимост, иначе нотариусът или банката може да откажат.'),
  ('sellers-3-07', 'sellers', 3, null, 'Продавачът иска в обявата да пише по-голяма площ от тази в документите. Как постъпвате?', array['Обявявате площта по документите, като идеалните части посочвате отделно', 'Пишете каквото иска — купувачът сам ще провери', 'Закръгляте нагоре с 10%', 'Не пишете площ изобщо'], 0, 'Невярната площ подвежда купувачите и излиза при сделката. Точната информация пази репутацията ви.'),
  ('sellers-3-08', 'sellers', 3, null, 'Собственикът казва: „Ще продам сам, без брокер, и ще спестя комисионната.“ Кой е най-силният отговор?', array['Показвате какво му носи брокерът — по-добра цена, проверени купувачи, сигурна сделка — и предлагате план с цифри', 'Казвате, че няма да успее', 'Веднага намалявате комисионната наполовина', 'Спирате да се чувате с него'], 0, 'Продавачите, които продават сами, често губят повече от комисионната — от цената, от времето и от грешки в документите.'),
  ('sellers-3-09', 'sellers', 3, null, 'Продавачът е подписал ексклузивен договор, но получава купувач директно. Какво казва обикновено договорът?', array['Комисионната се дължи и при продажба на намерен от него купувач, ако така е уговорено', 'Комисионната никога не се дължи в този случай', 'Договорът автоматично отпада', 'Купувачът плаща двойна комисионна'], 0, 'Затова клаузата трябва да е ясна и обяснена при подписването — без изненади после.'),
  ('sellers-3-10', 'sellers', 3, null, 'Как се справяте с продавач, който сменя цената всяка седмица (нагоре и надолу)?', array['Договаряте ясна стратегия с периоди за преглед по данни, а не по настроение', 'Сменяте я в обявата всеки път', 'Махате обявата без обяснение', 'Съветвате го да продаде на най-ниската цена'], 0, 'Честите промени объркват купувачите и показват несигурност. Стратегията с дати за преглед дава спокойствие и на двама ви.'),
  ('banks-1-01', 'banks', 1, null, 'Какво е предварителното одобрение за кредит?', array['Становище на банката до каква сума може да кредитира купувача, преди да е избран имот', 'Окончателният договор за кредит', 'Оценката на имота от банката', 'Съгласието на продавача да чака'], 0, 'С предварителното одобрение купувачът знае бюджета си. Окончателното одобрение идва след избора на имот и оценката.'),
  ('banks-1-02', 'banks', 1, null, 'Какво е ГПР?', array['Годишен процент на разходите — лихвата плюс всички такси, изразени като годишен процент', 'Годишната лихва без таксите', 'Главницата по погасителния план', 'Гаранционен процент за риска'], 0, 'ГПР показва реалната цена на кредита. С него се сравняват оферти на различни банки.'),
  ('banks-1-03', 'banks', 1, null, 'Какво обикновено иска банката като обезпечение по жилищен кредит?', array['Ипотека върху купувания имот', 'Запор на заплатата', 'Винаги двама поръчители', 'Нищо'], 0, 'Банката става ипотекарен кредитор: ако кредитът не се плаща, тя се удовлетворява от имота с предимство.'),
  ('banks-1-04', 'banks', 1, null, 'Кой прави оценката на имота за банката?', array['Лицензиран оценител, възложен или одобрен от банката', 'Брокерът', 'Нотариусът', 'Общината'], 0, 'Банката кредитира процент от оценката, не от договорената цена. Затова оценката е важна стъпка.'),
  ('banks-1-05', 'banks', 1, null, 'До колко процента от стойността на имота може да е жилищният кредит по правилата на БНБ?', array['До 85%', 'До 100%', 'До 60%', 'До 95%'], 0, 'БНБ ограничи съотношението кредит към стойност (LTV) до 85%. Купувачът трябва да има поне 15% собствени средства плюс разходите.'),
  ('banks-1-06', 'banks', 1, null, 'Какво е „самоучастие“?', array['Частта от цената, която купувачът плаща със собствени пари', 'Таксата за разглеждане на кредита', 'Вноската по кредита за първия месец', 'Сумата, която банката плаща на брокера'], 0, 'Самоучастието плюс кредитът дават цената. Разходите по сделката обикновено също са от собствени средства.'),
  ('banks-1-07', 'banks', 1, null, 'Защо купувачът с кредит трябва да има пари и за разходите по сделката?', array['Банката финансира част от цената, а не данъка, нотариуса и комисионната', 'Защото банката взима двойна такса', 'Не е нужно — банката финансира всичко', 'Защото ипотеката се плаща в брой'], 0, 'Данъкът при придобиване, нотариалната такса, вписването и комисионната обикновено са около 3–5% от цената.'),
  ('banks-1-08', 'banks', 1, null, 'Какво значи променлива (плаваща) лихва?', array['Лихва, която се променя според референтен индекс плюс фиксирана надбавка', 'Лихва, която банката сменя, когато пожелае', 'Лихва, която е еднаква за целия срок', 'Лихва само за първата година'], 0, 'При променлива лихва вноската може да се промени. Договорът казва по кой индекс и колко често.'),
  ('banks-1-09', 'banks', 1, null, 'Кога банката обикновено превежда сумата по кредита на продавача?', array['След подписването на нотариалния акт и вписването на ипотеката', 'Преди нотариуса, за да е сигурен продавачът', 'При подписването на предварителния договор', 'Една година след сделката'], 0, 'Банката плаща, когато ипотеката ѝ е вписана. Продавачът трябва да знае това предварително, за да няма напрежение в деня на сделката.'),
  ('banks-1-10', 'banks', 1, null, 'Каква застраховка е задължителна при жилищен кредит?', array['Застраховка на имота в полза на банката', 'Застраховка „Живот“ на продавача', 'Застраховка на мебелите', 'Застраховка на автомобила'], 0, 'Имотът е обезпечението, затова банката изисква да е застрахован в нейна полза. Застраховката „Живот“ обикновено е по желание или според офертата.'),
  ('banks-2-01', 'banks', 2, null, 'Имот за 150 000 €, оценката също е 150 000 €, кредит до 85%. Колко е минималното самоучастие (без разходите)?', array['22 500 €', '15 000 €', '30 000 €', '45 000 €'], 0, 'Кредит: 85% × 150 000 = 127 500 €. Самоучастие: 150 000 − 127 500 = 22 500 €. Разходите по сделката са отгоре.'),
  ('banks-2-02', 'banks', 2, null, 'Каква част от месечния доход може да отива за вноски по кредити по правилата на БНБ?', array['До 50%', 'До 30%', 'До 70%', 'Няма ограничение'], 0, 'БНБ ограничи съотношението вноски към доход (DSTI) до 50% от разполагаемия доход.'),
  ('banks-2-03', 'banks', 2, null, 'Какъв е максималният срок на жилищен кредит по правилата на БНБ?', array['30 години', '20 години', '35 години', '40 години'], 0, 'БНБ ограничи срока на жилищните кредити до 30 години.'),
  ('banks-2-04', 'banks', 2, null, 'Купувач с нетен доход 2 000 € и други вноски 300 € на месец. Каква най-голяма нова вноска допуска правилото за 50%?', array['700 €', '1 000 €', '1 700 €', '500 €'], 0, '50% × 2 000 = 1 000 € за всички вноски. 1 000 − 300 = 700 € за новия кредит.'),
  ('banks-2-05', 'banks', 2, null, 'Защо е добре клиентът да кандидатства в 2–3 банки?', array['Сравнява ГПР, таксите и условията и има резерв при отказ', 'Защото така кредитът става по-голям', 'Защото е задължително по закон', 'Не е добре — банките се обиждат'], 0, 'Условията се различават. Резервната банка спасява сделката, ако първата откаже или се забави.'),
  ('banks-2-06', 'banks', 2, null, 'Какво е рефинансиране?', array['Нов кредит, обикновено в друга банка, с който се изплаща старият при по-добри условия', 'Отлагане на вноските за 6 месеца', 'Кредит за ремонт на имота', 'Увеличаване на лихвата при закъснение'], 0, 'При падащи лихви рефинансирането може да намали вноската. Сметнете таксите, преди да го препоръчате.'),
  ('banks-2-07', 'banks', 2, null, 'Купувач на свободна практика с непостоянни доходи. Какво помага най-много за одобрение?', array['Документирани доходи за 1–2 години — данъчни декларации и банкови извлечения', 'Устна декларация за доходите', 'Повече снимки на имота', 'По-висока цена в предварителния договор'], 0, 'Банката гледа доказаните и устойчиви доходи. Подгответе клиента рано — документите отнемат време.'),
  ('banks-2-08', 'banks', 2, null, 'Как се отразява по-дългият срок на кредита?', array['Вноската намалява, но общо платената лихва се увеличава', 'Вноската и лихвата намаляват', 'Вноската се увеличава', 'Няма разлика'], 0, 'По-дългият срок улеснява вноската, но кредитът става по-скъп общо. Покажете на клиента и двете числа.'),
  ('banks-2-09', 'banks', 2, null, 'Кредит с фиксирана лихва за първите 5 години. Кое е вярно?', array['Вноската е сигурна 5 години, после лихвата става според договора (обикновено променлива)', 'Лихвата е фиксирана за целия срок', 'Лихвата се сменя всеки месец', 'Вноската е еднаква само първата година'], 0, 'Комбинираните условия са честа оферта. Проверете какво става след фиксирания период.'),
  ('banks-2-10', 'banks', 2, null, 'Какво значи, че кредитът и доходът на купувача са в една и съща валута (евро)?', array['Няма валутен риск — вноската не зависи от курса', 'Лихвата е винаги по-ниска', 'Банката не иска оценка', 'Кредитът е без ипотека'], 0, 'Когато доходът и кредитът са в различни валути, промяната на курса може да вдигне вноската. В една валута този риск го няма.'),
  ('banks-3-01', 'banks', 3, null, 'Цена 150 000 €, оценка на банката 140 000 €, кредит 85% от оценката. Колко собствени пари добавя купувачът към цената (без разходите)?', array['31 000 €', '22 500 €', '21 000 €', '10 000 €'], 0, 'Кредит: 85% × 140 000 = 119 000 €. Самоучастие: 150 000 − 119 000 = 31 000 €.'),
  ('banks-3-02', 'banks', 3, null, 'Кредит 100 000 € за 25 години при 3% годишна лихва. Каква е приблизително месечната вноска (анюитет)?', array['≈ 474 €', '≈ 333 €', '≈ 600 €', '≈ 250 €'], 0, 'При анюитет вноската е около 474 €. 333 € е само главницата (100 000 ÷ 300 месеца), без лихвата.'),
  ('banks-3-03', 'banks', 3, null, 'Купувачът иска 100% финансиране. Какво е реалистично да му кажете?', array['Банките кредитират до 85% от оценката — останалото трябва да е от собствени средства или от обезпечение с друг имот', 'Няма проблем — всички банки дават 100%', 'Ако цената в договора е по-висока, банката ще даде 100%', 'Брокерът може да гарантира 100%'], 0, 'Изкуственото вдигане на цената, за да се вземе по-голям кредит, е измама. Правилният път е самоучастие или допълнително обезпечение.'),
  ('banks-3-04', 'banks', 3, null, 'Кой трябва да е регистриран в БНБ, за да посредничи по ипотечни кредити срещу възнаграждение?', array['Кредитният посредник', 'Всеки брокер на имоти', 'Нотариусът', 'Оценителят'], 0, 'По Закона за кредитите за недвижими имоти на потребители кредитните посредници се регистрират в БНБ.'),
  ('banks-3-05', 'banks', 3, null, 'Строителят иска 30% при предварителния договор, 60% на Акт 14 и 10% при въвеждане в експлоатация. Как обикновено се финансира покупка с кредит?', array['Първо се плаща самоучастието, а банката кредитира по-късните вноски, когато строежът е напреднал (често след Акт 14)', 'Банката плаща всичко при предварителния договор', 'Кредит не е възможен при строителство', 'Строителят взима кредита вместо купувача'], 0, 'Схемите са различни при различните банки — съгласувайте плащанията по договора с банката, преди клиентът да подпише.'),
  ('banks-3-06', 'banks', 3, null, 'Какво се случва с ипотекирания имот, ако длъжникът спре да плаща?', array['Банката може да се удовлетвори от продажбата на имота с предимство пред другите кредитори', 'Нищо — ипотеката е само формалност', 'Имотът става собственост на банката веднага', 'Брокерът трябва да намери нов купувач'], 0, 'Ипотеката дава на банката право на предпочтително удовлетворяване — чрез принудително изпълнение, ако кредитът не се плаща.'),
  ('banks-3-07', 'banks', 3, null, 'Каква е правилната роля на брокера при кредита на купувача?', array['Насочва и подготвя клиента, координира сроковете с банката, но не обещава одобрение', 'Гарантира, че кредитът ще бъде одобрен', 'Подписва кредита вместо клиента', 'Решава вместо клиента коя банка'], 0, 'Помощта при кредита ускорява сделката, но решението е на банката и на клиента.'),
  ('banks-3-08', 'banks', 3, null, 'Лихвите по жилищните кредити падат. Какво обикновено става на пазара?', array['Търсенето расте — повече купувачи могат да си позволят кредит', 'Търсенето пада', 'Цените падат веднага', 'Нищо не се променя'], 0, 'По-ниската лихва значи по-ниска вноска за същата сума. Това е добър повод да се чуете с купувачите от лентите B и C.'),
  ('banks-3-09', 'banks', 3, null, 'Купувачът има одобрен кредит, но получава оферта от друга банка с по-нисък ГПР. Какво трябва да внимава?', array['Сроковете — смяната на банката може да забави сделката отвъд срока в предварителния договор', 'Нищо — винаги сменя банката', 'Да не казва на първата банка', 'Да вдигне цената в договора'], 0, 'По-евтиният кредит е добре, но не на цената на развалена сделка. Сверете сроковете с продавача.'),
  ('banks-3-10', 'banks', 3, null, 'Купувачът вече има жилищен кредит и иска втори за инвестиция. Кое ограничение важи за всичките му кредити?', array['Общите вноски по всички кредити не бива да надвишават 50% от дохода му', 'Важи само за новия кредит', 'Няма ограничение за втори кредит', 'Вторият кредит не може да е над 50 000 €'], 0, 'Правилото на БНБ (DSTI до 50%) гледа всички задължения на длъжника, а не само новия кредит.'),
  ('sales-1-01', 'sales', 1, null, 'Кое е най-важното умение в първия разговор с клиент?', array['Да задавате въпроси и да слушате повече, отколкото говорите', 'Да говорите бързо за всички свои имоти', 'Да кажете веднага комисионната си', 'Да убедите клиента да подпише днес'], 0, 'Клиентът ви се доверява, когато усети, че го разбирате. Добрите въпроси показват нуждата и мотива му.'),
  ('sales-1-02', 'sales', 1, null, 'Какво е „сфера на влияние“?', array['Хората, които ви познават — приятели, роднини, бивши клиенти, познати', 'Районът, в който работите', 'Колегите от другите агенции', 'Последователите в социалните мрежи, които не познавате'], 0, 'Сферата е най-евтиният източник на сделки и препоръки. Затова в BRIXA има програма „33 контакта“ за нея.'),
  ('sales-1-03', 'sales', 1, null, 'Защо записвате всеки разговор и контакт с клиента в BRIXA?', array['За да знаете историята, да не изпуснете следващата стъпка и екипът да може да поеме клиента', 'Защото така се трупат точки', 'Защото клиентът може да ги прочете', 'Не е нужно, ако помните'], 0, 'Паметта лъже, а записът остава. Бележката прави следващия разговор личен и професионален.'),
  ('sales-1-04', 'sales', 1, null, 'Клиент казва: „Комисионната ви е висока.“ Кой отговор е най-добър?', array['Обяснявате какво получава срещу нея и как влияе на крайния резултат', 'Веднага я намалявате наполовина', 'Казвате „така е навсякъде“', 'Спирате да работите с него'], 0, 'Клиентите не плащат за време, а за резултат: цена, сигурност, спокойствие. Покажете стойността с факти.'),
  ('sales-1-05', 'sales', 1, null, 'Какво е follow-up?', array['Планирано, редовно връщане към клиента, докато вземе решение', 'Еднократно обаждане след първата среща', 'Реклама на имот в социалните мрежи', 'Последният оглед преди сделката'], 0, 'Повечето сделки идват след няколко контакта. BRIXA напомня кога да се чуете с всеки клиент според лентата му.'),
  ('sales-1-06', 'sales', 1, null, 'За какво е програмата „33 контакта“ в BRIXA?', array['За сферата — 33 контакта през годината с хората, които ви познават', 'За 33 обаждания на ден', 'За 33 обяви на месец', 'За 33 огледа преди сделка'], 0, 'Редовните контакти през годината (обаждания, съобщения, поводи) ви държат в съзнанието на сферата, когато някой от тях реши да купува или продава.'),
  ('sales-1-07', 'sales', 1, null, 'За какво е програмата „8 × 8“ в BRIXA?', array['За нов контакт — 8 докосвания за 8 седмици, за да ви запомни', 'За 8 огледа на 8 имота', 'За 8 обяви в 8 сайта', 'За 8 часа работа и 8 часа сън'], 0, 'Новият контакт ви забравя бързо. Осем докосвания за осем седмици ви превръщат в „неговия брокер“.'),
  ('sales-1-08', 'sales', 1, null, 'Каква е целта на първото обаждане до собственик, който продава сам?', array['Да си уговорите среща, а не да продадете услугата по телефона', 'Да му кажете, че цената му е грешна', 'Да научите адреса и да изпратите купувачи без договор', 'Да го убедите веднага да подпише ексклузивен договор'], 0, 'По телефона се продава срещата. На срещата показвате плана, данните и стойността си.'),
  ('sales-1-09', 'sales', 1, null, 'Кой въпрос е отворен?', array['„Какво е най-важно за вас в новия дом?“', '„Искате ли тераса?“', '„Бюджетът ви 100 000 € ли е?“', '„В този квартал ли търсите?“'], 0, 'Отворените въпроси („какво“, „как“, „защо“) карат клиента да разказва. Затворените дават само „да“ или „не“.'),
  ('sales-1-10', 'sales', 1, null, 'Как реагирате на отказ при студено обаждане?', array['Приемате го спокойно, благодарите и записвате следваща стъпка — например след 3 месеца', 'Настоявате, докато се съгласи', 'Затваряте и изтривате контакта', 'Обаждате се пак след 10 минути'], 0, 'Отказът днес често е „не сега“. Записаната следваща стъпка превръща студения контакт в бъдещ клиент.'),
  ('sales-2-01', 'sales', 2, null, 'Какво е „котва“ в преговорите?', array['Първото споменато число, което влияе на очакванията на другата страна', 'Последната отстъпка преди сделката', 'Капарото по предварителния договор', 'Клаузата за неустойка'], 0, 'Котвата задава рамката на разговора. Добре обоснованата първа цена от ваша страна работи във ваша полза.'),
  ('sales-2-02', 'sales', 2, null, 'Купувачът предлага 10% под цената. Как предавате офертата на собственика?', array['Писмено, с аргументите на купувача и пазарните данни, без лична оценка, която я подкопава', 'Устно и набързо — „дават малко“', 'Не я предавате, защото е ниска', 'Като казвате, че купувачът не е сериозен'], 0, 'Предаването на всяка оферта е задължение на брокера. Професионалното представяне често води до насрещно предложение и сделка.'),
  ('sales-2-03', 'sales', 2, null, 'За какво служи техниката „разбирам — и други се чувстваха така — и откриха, че…“?', array['За работа с възражения: разбиране, пример и решение', 'За първото обаждане до нов клиент', 'За определяне на цената', 'За писане на обява'], 0, 'Тя показва на клиента, че е разбран и не е сам, а после дава доказателство, че има решение.'),
  ('sales-2-04', 'sales', 2, null, 'Защо е добре да предлагате два варианта за среща („вторник в 10 или сряда в 17?“)?', array['Улеснява решението и води директно към конкретна дата', 'Защото така изглеждате по-зает', 'Защото клиентът задължително трябва да избере вторник', 'Не е добре — клиентът трябва сам да предложи'], 0, 'Изборът между две конкретни възможности е по-лесен от отворения въпрос „кога ви е удобно?“.'),
  ('sales-2-05', 'sales', 2, null, 'Какво е съобщението „за раздяла“ след 6 месеца мълчание на клиента?', array['Учтиво затваряне на досието — често точно тогава клиентът отговаря', 'Грубо съобщение, че губи времето ви', 'Изтриване на клиента без съобщение', 'Реклама на нов имот'], 0, '„Приемам, че имотните въпроси не са приоритет. Затварям досието Ви, за да не досаждам.“ Учтивото затваряне често събужда интереса.'),
  ('sales-2-06', 'sales', 2, null, 'Кое е ключово при „Отворени врати“ (open house)?', array['Да регистрирате всеки посетител и да се свържете с него след това', 'Да има почерпка за всички', 'Да покажете имота за 5 минути', 'Да не каните съседите'], 0, 'Регистрацията (например с QR код на вратата) превръща посетителите в клиенти — купувачи на този или на друг имот.'),
  ('sales-2-07', 'sales', 2, null, 'Кое е най-силното доказателство на среща с продавач?', array['Реални резултати — продадени имоти в района, срокове и постигнати цени', 'Колко години сте в бранша', 'Колко имота имате обявени', 'Колко хубав е офисът ви'], 0, 'Продавачът иска да знае дали ще продадете неговия имот добре. Резултатите в неговия район го убеждават най-много.'),
  ('sales-2-08', 'sales', 2, null, 'Клиентът казва: „Не бързам.“ Какво правите?', array['Слагате го в лента B или C и го водите по план с полезна информация, без натиск', 'Изтривате го', 'Звъните му всеки ден', 'Казвате му, че ще изпусне всички имоти'], 0, 'Клиентът, който не бърза днес, ще купи или продаде утре — с брокера, който е бил полезен през цялото време.'),
  ('sales-2-09', 'sales', 2, null, 'Целта е 10 сделки годишно. За една сделка трябват 10 огледа, за един оглед — 8 обаждания. Колко обаждания годишно трябват?', array['800', '100', '80', '180'], 0, '10 сделки × 10 огледа = 100 огледа. 100 × 8 = 800 обаждания. Така работи планът в „Моят план“ — от целта към дневните действия.'),
  ('sales-2-10', 'sales', 2, null, 'Каква е разликата между характеристика и полза?', array['Характеристиката е какво има имотът, а ползата — какво печели купувачът от това', 'Няма разлика', 'Ползата е цената, а характеристиката — площта', 'Характеристиката е за продавача, а ползата — за брокера'], 0, '„Южно изложение“ е характеристика. „Слънце в дневната целия ден и по-ниска сметка за ток“ е полза.'),
  ('sales-3-01', 'sales', 3, null, 'Какво е BATNA в преговорите?', array['Най-добрата ви алтернатива, ако не се стигне до споразумение', 'Максималната отстъпка, която давате', 'Срокът на офертата', 'Клауза за неустойка в договора'], 0, 'Който знае своята BATNA (и тази на другата страна), преговаря спокойно и не приема лоша сделка от страх.'),
  ('sales-3-02', 'sales', 3, null, 'Страните са заседнали на разлика от 5 000 €. Кое е професионално решение?', array['Търсите стойност извън цената — срок за освобождаване, обзавеждане, начин на плащане', 'Предлагате да делите разликата от комисионната си, без да мислите', 'Прекратявате преговорите', 'Казвате на всяка страна, че другата е готова да отстъпи'], 0, 'Често страните ценят различни неща. Гъвкав срок или оставено обзавеждане струват повече на едната страна, отколкото на другата.'),
  ('sales-3-03', 'sales', 3, null, 'Как постъпвате при няколко оферти за един имот?', array['Уведомявате всички купувачи, че има няколко оферти, и искате най-добрата писмена оферта до срок', 'Казвате на всеки купувач точната оферта на другия', 'Приемате първата и не казвате на другите', 'Избирате купувача, който ви харесва'], 0, 'Прозрачният процес с краен срок е честен към всички и обикновено носи най-добрата цена за собственика.'),
  ('sales-3-04', 'sales', 3, null, 'Каква е ролята на мълчанието след като сте направили предложение?', array['Дава време на другата страна да отговори — често тя пръв прави отстъпка', 'Изглежда непрофесионално — трябва да говорите веднага', 'Показва, че не сте сигурни', 'Трябва веднага да предложите отстъпка'], 0, 'Който пръв наруши мълчанието, често отстъпва. Направете предложението и изчакайте.'),
  ('sales-3-05', 'sales', 3, null, 'Представлявате и купувача, и продавача (двустранна сделка). Кое е правилно?', array['Информирате двете страни писмено и сте честни и неутрални към двамата', 'Работите в интерес само на продавача', 'Не казвате на купувача, че представлявате и продавача', 'Двустранните сделки са забранени'], 0, 'Двустранната сделка е честа и законна, но изисква прозрачност и еднакво отношение към двете страни.'),
  ('sales-3-06', 'sales', 3, null, 'Как изчислявате „стойността на часа ви“ в BRIXA?', array['Комисионните за последните 12 месеца, разделени на работните часове', 'Комисионната от последната сделка, разделена на 8', 'Средната заплата в града', 'Годишната цел, разделена на 365'], 0, 'Като знаете колко струва часът ви, по-лесно решавате на какво да не губите време и какво да делегирате.'),
  ('sales-3-07', 'sales', 3, null, 'Клиент ви сравнява с брокер, който обещава по-висока цена за същия имот. Какво правите?', array['Показвате данните си и обяснявате, че обещаната цена не е реалната цена на пазара', 'Обещавате още по-висока цена', 'Казвате, че другият брокер лъже, без доказателства', 'Веднага се отказвате от имота'], 0, 'Обещанието за цена, без пазарни данни, е стара тактика. Данните и планът ви са по-силни от думите на конкурента.'),
  ('sales-3-08', 'sales', 3, null, 'Кой е най-добрият момент да поискате препоръка от клиент?', array['Когато е доволен — например след успешна сделка или решен проблем', 'Още на първата среща', 'Никога — препоръките идват сами', 'Когато имате нужда от сделки'], 0, 'Доволният клиент най-лесно препоръчва. Конкретният въпрос („Познавате ли някой, който мисли да продава?“) работи по-добре от общия.'),
  ('sales-3-09', 'sales', 3, null, 'Купувачът иска отстъпка след огледа, защото „банята е стара“. Как преговаряте?', array['Обсъждате реалната цена на ремонта спрямо цената на имота и какво вече е отчетено в нея', 'Веднага приемате исканата отстъпка', 'Казвате, че банята е нова', 'Отказвате всякакъв разговор'], 0, 'Възражението по състоянието е честно. Дайте му реална цифра и сравнение с пазара — така отстъпката става разумна или излишна.'),
  ('sales-3-10', 'sales', 3, null, 'Колко време след нов имот, който пасва на горещ купувач, е най-добре да му се обадите?', array['До 5 минути — „speed to lead“', 'До края на седмицата', 'След като имотът събере огледи', 'Само по имейл'], 0, 'При горещите купувачи бързината решава. BRIXA известява брокера веднага, когато нов имот пасне на купувача.'),
  ('market-1-01', 'market', 1, null, 'Апартамент струва 90 000 € и е 75 м². Каква е цената на кв. м?', array['1 200 €/м²', '1 125 €/м²', '1 500 €/м²', '6 750 €/м²'], 0, '90 000 ÷ 75 = 1 200 €/м².'),
  ('market-1-02', 'market', 1, null, 'Какво е „обща площ“ на апартамент в обявите?', array['Застроената площ плюс идеалните части от общите части на сградата', 'Само площта на стаите', 'Само площта на пода без стените', 'Площта на апартамента и мазето'], 0, 'Купувачите често сравняват различни площи. Уточнявайте коя е посочена — застроена, обща или полезна.'),
  ('market-1-03', 'market', 1, null, 'Кое е по-надеждно за пазарната цена — обявените или реално продадените цени?', array['Реално продадените цени', 'Обявените цени', 'Двете са еднакво надеждни', 'Данъчните оценки'], 0, 'Обявената цена е желание, продадената е факт. Регистърът на сключените сделки в BRIXA пази реалните цени.'),
  ('market-1-04', 'market', 1, null, 'Кой фактор влияе най-много на цената на апартамента?', array['Местоположението', 'Цветът на фасадата', 'Името на сградата', 'Марката на домофона'], 0, 'Ремонтът се прави наново, а локацията не може да се смени. Затова е най-важна.'),
  ('market-1-05', 'market', 1, null, 'Какво е изложение и защо е важно?', array['Посоката, към която гледат прозорците — влияе на светлината и на цената', 'Колко дълго имотът е бил на пазара', 'Изложбата на мебелите в имота', 'Разстоянието до спирката'], 0, 'Южно и източно изложение обикновено се ценят повече, а северно — по-малко. Зависи и от гледката.'),
  ('market-1-06', 'market', 1, null, 'Кой тип конструкция купувачите в България обикновено ценят най-много?', array['Тухла (монолитна стоманобетонна конструкция)', 'Панел', 'ЕПК', 'Гредоред'], 0, 'Тухлените сгради се възприемат като по-качествени и по-добре изолирани. При еднакви други условия цената им е по-висока.'),
  ('market-1-07', 'market', 1, null, 'Защо партерът (първият етаж) обикновено е по-евтин?', array['По-малко светлина и уединение, повече шум и риск от влага', 'Защото е по-малък', 'Защото там не може да има кухня', 'Защото данъкът е по-висок'], 0, 'Има изключения — партер с двор или подходящ за офис или магазин може да струва повече.'),
  ('market-1-08', 'market', 1, null, 'Защо имотите със завършена сграда (въведена в експлоатация) обикновено струват повече от тези „на зелено“?', array['Рискът е по-малък и купувачът може да се нанесе веднага', 'Защото са по-големи', 'Защото са с по-ниски данъци', 'Не струват повече'], 0, 'Купувачът „на зелено“ плаща по-малко срещу риска и чакането.'),
  ('market-1-09', 'market', 1, null, 'Какво е ЕПК?', array['Едроплощен кофраж — монолитни бетонни сгради, строени главно през 70-те и 80-те години', 'Екологичен пасивен клас', 'Енергиен паспорт на конструкцията', 'Еднофамилна къща с паркинг'], 0, 'ЕПК сградите са монолитни и здрави. Купувачите обикновено ги поставят между панела и тухлата.'),
  ('market-1-10', 'market', 1, null, 'Какво е пазар на купувача?', array['Предлагането е по-голямо от търсенето — купувачите имат избор и сила да пазаряват', 'Пазар, на който купуват само инвеститори', 'Пазар, на който цените винаги растат', 'Пазар, на който продават само строители'], 0, 'При пазар на продавача е обратното — малко имоти, много купувачи, бързи сделки.'),
  ('market-2-01', 'market', 2, null, 'Апартамент от 80 м² се продава за 140 000 €, с включено паркомясто за 12 000 €. Каква е цената на кв. м без паркомястото?', array['1 600 €/м²', '1 750 €/м²', '1 900 €/м²', '1 450 €/м²'], 0, '(140 000 − 12 000) ÷ 80 = 1 600 €/м². Сравнявайте апартаментите без паркоместата.'),
  ('market-2-02', 'market', 2, null, 'Имот за 100 000 € се отдава за 500 € на месец. Каква е брутната доходност?', array['6%', '5%', '0,5%', '12%'], 0, 'Годишен наем 6 000 € ÷ 100 000 € = 6%.'),
  ('market-2-03', 'market', 2, null, 'Какво показва „времето на пазара“?', array['Дните от обявяването до сделката — показва дали цената е пазарна', 'Колко часа е отворен офисът', 'Колко време купувачът търси', 'Колко време трае нотариалната сделка'], 0, 'Дълго време на пазара обикновено значи висока цена или слабо представяне.'),
  ('market-2-04', 'market', 2, null, 'Имоти в квартала се продават средно за 95% от обявената цена. Какво значи това?', array['Продавачите отстъпват средно 5% от обявената цена', 'Цените растат с 5%', 'Купувачите плащат 5% комисионна', '5% от имотите се продават'], 0, 'Съотношението продадена/обявена цена показва колко място за пазарене реално има.'),
  ('market-2-05', 'market', 2, null, 'Колко сравними имота са добра основа за пазарен анализ?', array['Поне 3–5 сходни имота от района, продадени наскоро', 'Един — най-близкият', 'Всички имоти в града', 'Само обявите от последния ден'], 0, 'С няколко сравними сделки виждате диапазона и избягвате изкривяване от един необичаен случай.'),
  ('market-2-06', 'market', 2, null, 'Кои корекции правите, когато сравнявате имоти?', array['Етаж, състояние, изложение, площ, година и вид на строителството', 'Само цвета на стените', 'Само името на агенцията', 'Само цената на мебелите'], 0, 'Нито два имота не са еднакви. Корекциите правят сравнението честно.'),
  ('market-2-07', 'market', 2, null, 'Каква е разликата между застроена и полезна площ?', array['Застроената включва стените, а полезната е площта на пода в помещенията', 'Няма разлика', 'Полезната включва терасите и мазето', 'Застроената е само площта на стаите'], 0, 'Полезната площ обикновено е с около 10–20% по-малка от застроената. Купувачите от чужбина често мерят полезната.'),
  ('market-2-08', 'market', 2, null, 'Как ремонт за 20 000 € влияе на стойността на имота?', array['Не непременно я вдига с 20 000 € — зависи от пазара, от качеството и от вкуса на купувачите', 'Винаги я вдига с 20 000 €', 'Винаги я вдига двойно', 'Не влияе изобщо'], 0, 'Ремонтът рядко се връща изцяло. Освежаването често носи повече от скъпия ремонт по личен вкус.'),
  ('market-2-09', 'market', 2, null, 'Защо имотите около нова метростанция или голям нов път поскъпват по-бързо?', array['По-лесният достъп увеличава търсенето — особено при наемите', 'Защото данъците там падат', 'Защото строителите вдигат цените по закон', 'Не поскъпват'], 0, 'Инфраструктурата променя квартала. Следете плановете на общината — те подсказват бъдещото търсене.'),
  ('market-2-10', 'market', 2, null, 'Какво е медиана на цените и защо е полезна?', array['Средната стойност в подредения списък — не се влияе от единични много скъпи или много евтини имоти', 'Сборът от всички цени', 'Най-високата цена в квартала', 'Средноаритметичната стойност'], 0, 'При малко сделки един луксозен имот може да изкриви средната цена. Медианата е по-устойчива.'),
  ('market-3-01', 'market', 3, null, 'Имот за 120 000 €, наем 650 € на месец, годишни разходи (данък, ремонти, празни месеци) 1 300 €. Каква е нетната доходност?', array['≈ 5,4%', '6,5%', '≈ 4,3%', '7,8%'], 0, 'Годишен наем: 7 800 €. Нето: 7 800 − 1 300 = 6 500 €. 6 500 ÷ 120 000 ≈ 5,4%.'),
  ('market-3-02', 'market', 3, null, 'Наем 700 € на месец, инвеститорът иска 6% доходност. Каква е стойността по метода на дохода?', array['140 000 €', '116 667 €', '84 000 €', '42 000 €'], 0, 'Годишен наем: 8 400 €. 8 400 ÷ 0,06 = 140 000 €.'),
  ('market-3-03', 'market', 3, null, 'В квартала има 120 активни обяви и се продават по 20 имота на месец. Колко месеца е предлагането?', array['6 месеца', '2 месеца', '20 месеца', '12 месеца'], 0, '120 ÷ 20 = 6 месеца. По-малко месеци значи пазар на продавача, повече — пазар на купувача.'),
  ('market-3-04', 'market', 3, null, 'Пет сравними сделки са на 1 500, 1 550, 1 600, 1 650 и 2 400 €/м². Коя е разумната база за анализа?', array['≈ 1 600 €/м² — медианата; 2 400 е изключение', '1 740 €/м² — средното', '2 400 €/м² — най-високата', '1 500 €/м² — най-ниската'], 0, 'Средното (1 740) е изкривено от една сделка. Медианата (1 600) показва типичната цена. Проверете защо сделката за 2 400 е различна.'),
  ('market-3-05', 'market', 3, null, 'Двустаен 65 м² в квартал със средно 1 800 €/м², но на последен етаж без асансьор и с минал теч. Как подхождате?', array['Започвате от средната цена и коригирате надолу за етажа, асансьора и риска от теч', 'Обявявате го на средната цена', 'Обявявате го над средната, защото е с гледка', 'Не правите корекции — пазарът ще реши'], 0, 'Средната цена е отправна точка. Всяка особеност на имота се отразява с корекция — нагоре или надолу.'),
  ('market-3-06', 'market', 3, null, 'Цените в квартала са се вдигнали с 8% за година, а наемите — с 3%. Какво става с доходността от наем?', array['Пада — цената расте по-бързо от наема', 'Расте', 'Не се променя', 'Става отрицателна'], 0, 'Доходността е наем ÷ цена. Когато цената расте по-бързо, доходността намалява.'),
  ('market-3-07', 'market', 3, null, 'Апартамент от 70 м² се продава за 126 000 €, а данъчната му оценка е 45 000 €. Върху коя сума е данъкът при придобиване?', array['Върху 126 000 € — по-високата от двете', 'Върху 45 000 € — данъчната оценка', 'Върху средното от двете', 'Върху 70% от цената'], 0, 'Основата е по-високата от договорената цена и данъчната оценка.'),
  ('market-3-08', 'market', 3, null, 'Защо при анализ се гледат и изтеглените от пазара имоти?', array['Те показват цените, на които пазарът е отказал да купи', 'Защото те са най-евтините', 'Не се гледат — не са продадени', 'Защото са с най-добрите снимки'], 0, 'Изтеглените обяви са пазарът, който казва „не“ на дадена цена. Това е полезен аргумент пред амбициозен собственик.'),
  ('market-3-09', 'market', 3, null, 'Цената на сравним имот, продаден преди година, е 1 500 €/м². Цените в квартала са се вдигнали с 6%. Каква е днешната сравнима цена?', array['1 590 €/м²', '1 506 €/м²', '1 600 €/м²', '1 410 €/м²'], 0, '1 500 × 1,06 = 1 590 €/м². По-старите сделки се коригират с времето.'),
  ('market-3-10', 'market', 3, null, 'Инвеститор купува за 100 000 € с 30 000 € собствени пари и кредит, наемът покрива вноската, а имотът поскъпва с 5% за година. Каква е приблизителната възвръщаемост на собствените му пари само от поскъпването?', array['≈ 16,7%', '5%', '30%', '≈ 3,3%'], 0, 'Поскъпване: 5 000 €. 5 000 ÷ 30 000 ≈ 16,7%. Това е ефектът на кредита (лостът) — който работи и в обратната посока.'),
  ('city-varna-1-01', 'city', 1, 'Варна', 'Колко административни района има Варна?', array['5', '3', '7', '24'], 0, 'Районите са Одесос, Приморски, Младост, Владислав Варненчик и Аспарухово.'),
  ('city-varna-1-02', 'city', 1, 'Варна', 'Кой район на Варна обхваща центъра на града?', array['Одесос', 'Приморски', 'Младост', 'Аспарухово'], 0, 'Одесос е централният район — с центъра, Гръцка махала и пристанището.'),
  ('city-varna-1-03', 'city', 1, 'Варна', 'Кой мост свързва центъра на Варна с квартал Аспарухово?', array['Аспаруховият мост', 'Дунав мост', 'Мостът при Чайка', 'Галатският мост'], 0, 'Аспаруховият мост минава над канала между морето и Варненското езеро.'),
  ('city-varna-1-04', 'city', 1, 'Варна', 'Кой курортен комплекс е част от град Варна, на север?', array['Златни пясъци', 'Слънчев бряг', 'Албена', 'Обзор'], 0, 'Златни пясъци е в община Варна (район Приморски). Албена е в община Балчик, а Слънчев бряг — в община Несебър.'),
  ('city-varna-1-05', 'city', 1, 'Варна', 'Как се казва големият парк край морето в центъра на Варна?', array['Морската градина', 'Борисовата градина', 'Цар-Симеоновата градина', 'Южен парк'], 0, 'Морската градина е символът на Варна. Борисовата градина е в София, Цар-Симеоновата — в Пловдив.'),
  ('city-varna-1-06', 'city', 1, 'Варна', 'Как се казва старият квартал край Римските терми, близо до пристанището?', array['Гръцка махала', 'Капана', 'Старият град', 'Лозенец'], 0, 'Гръцка махала е историческата част на Варна. Капана и Старият град са в Пловдив.'),
  ('city-varna-1-07', 'city', 1, 'Варна', 'Кое езеро е на запад от Варна, свързано с морето чрез канал?', array['Варненското езеро', 'Атанасовското езеро', 'Мандренското езеро', 'Вая'], 0, 'Варненското езеро е свързано с морето с канал, над който минава Аспаруховият мост. Атанасовско, Мандренско и Вая са край Бургас.'),
  ('city-varna-2-01', 'city', 2, 'Варна', 'В кой район на Варна са к.к. „Св. Св. Константин и Елена“ и „Златни пясъци“?', array['Приморски', 'Одесос', 'Младост', 'Владислав Варненчик'], 0, 'Район Приморски обхваща северната част на града край морето — с кварталите и курортите там.'),
  ('city-varna-2-02', 'city', 2, 'Варна', 'Кой квартал на Варна е на южния бряг, след Аспарухово, и е известен с вилите и гледката към залива?', array['Галата', 'Виница', 'Изгрев', 'Бриз'], 0, 'Галата е на южния бряг на Варненския залив. Виница и Бриз са на север.'),
  ('city-varna-2-03', 'city', 2, 'Варна', 'Какво е Евксиноград?', array['Бивша царска резиденция на север от Варна, между Бриз и к.к. „Св. Св. Константин и Елена“', 'Нов жилищен комплекс в Аспарухово', 'Индустриална зона край езерото', 'Плаж в центъра на града'], 0, 'Евксиноград е дворец и парк край морето. Околните квартали са сред най-търсените за луксозни имоти.'),
  ('city-varna-2-04', 'city', 2, 'Варна', 'Виница е:', array['Бивше село, днес квартал на Варна на север, с много къщи и ново строителство', 'Квартал в центъра до катедралата', 'Курорт южно от Аспарухово', 'Индустриална зона край летището'], 0, 'Виница е част от район Приморски. Търси се от купувачи на къщи и апартаменти близо до морето.'),
  ('city-varna-2-05', 'city', 2, 'Варна', 'В кой район на Варна са кварталите Аспарухово и Галата?', array['Аспарухово', 'Одесос', 'Младост', 'Приморски'], 0, 'Южната част на Варна, след Аспаруховия мост, е район Аспарухово.'),
  ('city-sofia-1-01', 'city', 1, 'София', 'Колко административни района има Столична община?', array['24', '5', '12', '31'], 0, 'София е разделена на 24 района — от Средец и Лозенец до Панчарево и Нови Искър.'),
  ('city-sofia-1-02', 'city', 1, 'София', 'Коя планина е южно от София и прави търсени кварталите в подножието ѝ (Бояна, Драгалевци, Симеоново)?', array['Витоша', 'Рила', 'Люлин', 'Стара планина'], 0, 'Близостта до Витоша и гледката към планината вдигат цените в южните квартали.'),
  ('city-sofia-1-03', 'city', 1, 'София', 'Кой голям парк е в центъра на София?', array['Борисовата градина', 'Морската градина', 'Цар-Симеоновата градина', 'Парк „Росенец“'], 0, 'Борисовата градина е най-големият парк в центъра. Кварталите около нея (Лозенец, Изток) са сред най-скъпите.'),
  ('city-sofia-1-04', 'city', 1, 'София', 'Кой голям жилищен комплекс е в западната част на София?', array['Люлин', 'Младост', 'Дружба', 'Дианабад'], 0, 'Люлин е в западната част на града, а Младост, Дружба и Дианабад — в източната и югоизточната.'),
  ('city-sofia-1-05', 'city', 1, 'София', 'Коя линия на метрото стига до Летище София?', array['М4', 'М1', 'М2', 'М3'], 0, 'Линия М4 свързва Обеля с Летище София през Младост и Дружба.'),
  ('city-sofia-1-06', 'city', 1, 'София', 'Кой престижен квартал е южно от центъра, близо до НДК и Южния парк?', array['Лозенец', 'Надежда', 'Люлин', 'Красна поляна'], 0, 'Лозенец е сред най-търсените квартали — близо до центъра, парковете и с много ново строителство.'),
  ('city-sofia-2-01', 'city', 2, 'София', 'Кой булевард свързва центъра на София с летището, Младост и Дружба?', array['Цариградско шосе', 'Булевард „България“', 'Булевард „Сливница“', 'Булевард „Тодор Александров“'], 0, 'Цариградско шосе е главната ос на изток — с бизнес сгради, търговски центрове и жилищни комплекси.'),
  ('city-sofia-2-02', 'city', 2, 'София', 'Кой квартал в подножието на Витоша е известен с къщите и с Боянската църква?', array['Бояна', 'Овча купел', 'Подуяне', 'Връбница'], 0, 'Бояна е сред най-скъпите квартали за къщи в София.'),
  ('city-sofia-2-03', 'city', 2, 'София', 'Какво е „Манастирски ливади“?', array['Квартал в югозападна София с много ново строителство', 'Манастир в Рила', 'Парк в центъра на София', 'Курортно селище край Витоша'], 0, 'Манастирски ливади се разви бързо с новото строителство между бул. „България“ и Овча купел.'),
  ('city-plovdiv-1-01', 'city', 1, 'Пловдив', 'Как се казва историческият квартал на Пловдив върху хълмовете?', array['Старият град', 'Гръцка махала', 'Капана', 'Кършияка'], 0, 'Старият град е архитектурен резерват — имотите там имат специални режими за строеж и ремонт.'),
  ('city-plovdiv-1-02', 'city', 1, 'Пловдив', 'Кой квартал в центъра на Пловдив е известен като творческия квартал с малки улички?', array['Капана', 'Тракия', 'Смирненски', 'Остромила'], 0, 'Капана е популярен за заведения, ателиета и наеми в центъра.'),
  ('city-plovdiv-1-03', 'city', 1, 'Пловдив', 'Коя река минава през Пловдив?', array['Марица', 'Искър', 'Янтра', 'Струма'], 0, 'Марица разделя Пловдив на север (Кършияка) и юг.'),
  ('city-plovdiv-1-04', 'city', 1, 'Пловдив', 'Колко административни района има Пловдив?', array['6', '3', '5', '24'], 0, 'Районите са Централен, Източен, Западен, Северен, Южен и Тракия.'),
  ('city-plovdiv-2-01', 'city', 2, 'Пловдив', 'Кой голям жилищен комплекс е в източната част на Пловдив и е отделен район?', array['Тракия', 'Кючук Париж', 'Мараша', 'Капана'], 0, 'Тракия е най-големият жилищен комплекс в Пловдив — с много панелни блокове и ново строителство.'),
  ('city-plovdiv-2-02', 'city', 2, 'Пловдив', 'На кой бряг на Марица е Кършияка?', array['На северния', 'На южния', 'На двата', 'Кършияка е в Тракия'], 0, 'Кършияка е в район Северен — на северния бряг на реката.'),
  ('city-burgas-1-01', 'city', 1, 'Бургас', 'Кой квартал на Бургас е край летището, на север?', array['Сарафово', 'Крайморие', 'Меден рудник', 'Лазур'], 0, 'Сарафово е до летище Бургас и до морето. Крайморие е на юг.'),
  ('city-burgas-1-02', 'city', 1, 'Бургас', 'Кои езера са около Бургас?', array['Вая (Бургаското), Атанасовското и Мандренското', 'Варненското и Белославското', 'Сребърна и Шабла', 'Панчаревското и Искър'], 0, 'Бургас е заобиколен от три езера. Варненското и Белославското са край Варна.'),
  ('city-burgas-1-03', 'city', 1, 'Бургас', 'Как се казва паркът край морето в Бургас?', array['Морската градина', 'Борисовата градина', 'Южен парк', 'Цар-Симеоновата градина'], 0, 'И Бургас, и Варна имат Морска градина. Кварталите до нея се ценят повече.'),
  ('city-burgas-2-01', 'city', 2, 'Бургас', 'Кой квартал на Бургас е между центъра и Морската градина, близо до морето?', array['Лазур', 'Меден рудник', 'Ветрен', 'Банево'], 0, 'Лазур е сред търсените квартали заради близостта до центъра и морето.'),
  ('city-burgas-2-02', 'city', 2, 'Бургас', 'Кое селище на юг е част от община Бургас и е известно с вилите край морето?', array['Крайморие', 'Сарафово', 'Ветрен', 'Равнец'], 0, 'Крайморие е на юг от града, а Сарафово — на север, до летището.')
on conflict (code) do nothing;
