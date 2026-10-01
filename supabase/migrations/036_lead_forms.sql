-- =====================================================================
-- BRIXA — migration 036: leads from Google Forms (surveys and ads)
--   • a form ("folder") per survey or ad, with its broker: every answer comes
--     in as a new cold contact (class C) of that broker, who is told at once
--   • every answer is kept with the contact
--   • a colleague's search entered by someone → the whole agency hears of it
-- Run once in Supabase → SQL Editor → New query → Run (after 035).
-- =====================================================================

-- a new client source: a form (survey / ad)
alter table public.clients drop constraint if exists clients_source_check;
alter table public.clients add constraint clients_source_check check (source in (
  'personal', 'referral', 'agency', 'email', 'google', 'facebook', 'instagram', 'tiktok',
  'realistimo', 'billboard', 'flyers', 'banner', 'open_house', 'website', 'form'
));

-- ---------------------------------------------------------------------
-- The forms (the folders of the cold contacts)
-- ---------------------------------------------------------------------
create table public.lead_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  -- whose new contacts they are (no one: they go to the free contacts)
  broker_id uuid references public.profiles (id) on delete set null,
  -- what the people answering are: buyers, sellers…
  client_type text not null default 'buyer' check (client_type in ('buyer', 'seller', 'tenant', 'landlord', 'investor')),
  -- where the ad runs (the contacts' source)
  source text not null default 'form' check (source in (
    'form', 'facebook', 'instagram', 'google', 'tiktok', 'website', 'email', 'flyers', 'billboard', 'banner', 'realistimo'
  )),
  -- the form's script sends here: the token is the key
  token uuid not null unique default gen_random_uuid(),
  connected_at timestamptz,
  last_response_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index lead_forms_org_idx on public.lead_forms (organization_id, created_at desc);

alter table public.lead_forms enable row level security;

create policy "lead forms: read" on public.lead_forms
  for select to authenticated
  using (public.is_org_member(organization_id));
-- managers for anyone, a broker for themselves
create policy "lead forms: create" on public.lead_forms
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_org_member(organization_id)
    and (public.is_org_manager(organization_id) or broker_id = auth.uid())
    and (broker_id is null or exists (
      select 1 from public.organization_members m where m.organization_id = lead_forms.organization_id and m.profile_id = lead_forms.broker_id
    ))
  );
create policy "lead forms: update" on public.lead_forms
  for update to authenticated
  using (public.is_org_manager(organization_id) or broker_id = auth.uid())
  with check (
    public.is_org_member(organization_id)
    and (public.is_org_manager(organization_id) or broker_id = auth.uid())
  );
create policy "lead forms: delete" on public.lead_forms
  for delete to authenticated
  using (public.is_org_manager(organization_id) or broker_id = auth.uid());

alter table public.clients add column lead_form_id uuid references public.lead_forms (id) on delete set null;
create index clients_lead_form_idx on public.clients (lead_form_id, created_at desc) where lead_form_id is not null;

-- ---------------------------------------------------------------------
-- Every answer, kept with the contact
-- ---------------------------------------------------------------------
create table public.lead_form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.lead_forms (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  -- [{ "q": "the question", "a": "the answer" }, …]
  answers jsonb not null default '[]',
  received_at timestamptz not null default now()
);

create index lead_form_responses_client_idx on public.lead_form_responses (client_id, received_at desc);
create index lead_form_responses_form_idx on public.lead_form_responses (form_id, received_at desc);

alter table public.lead_form_responses enable row level security;

create policy "lead form responses: read" on public.lead_form_responses
  for select to authenticated
  using (
    public.is_org_manager(organization_id)
    or (client_id is not null and public.can_view_client(client_id))
  );

-- ---------------------------------------------------------------------
-- The form's script: "connected", and each answer
-- ---------------------------------------------------------------------
create or replace function public.ping_lead_form(form_token uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.lead_forms
  set connected_at = coalesce(connected_at, now())
  where token = form_token and archived_at is null
  returning true;
$$;

create or replace function public.submit_lead_form(form_token uuid, lead_name text, lead_phone text, lead_email text, answers jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.lead_forms;
  clean_name text := nullif(btrim(coalesce(lead_name, '')), '');
  clean_phone text := nullif(btrim(coalesce(lead_phone, '')), '');
  clean_email text := nullif(lower(btrim(coalesce(lead_email, ''))), '');
  clean_answers jsonb := case when jsonb_typeof(answers) = 'array' then answers else '[]'::jsonb end;
  recent int;
  found uuid;
  found_broker uuid;
  client uuid;
  summary text;
begin
  select * into f from public.lead_forms where token = form_token and archived_at is null;
  if f.id is null then
    return null;
  end if;
  -- a flood from one form is ignored
  select count(*) into recent from public.lead_form_responses where form_id = f.id and received_at > now() - interval '1 hour';
  if recent >= 200 then
    return null;
  end if;
  if clean_name is null and clean_phone is null and clean_email is null then
    return null;
  end if;
  if clean_email is not null and clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    clean_email := null;
  end if;
  -- a name is at least two letters
  if char_length(clean_name) < 2 then
    clean_name := null;
  end if;

  -- the answers, as text for the notes
  select string_agg(coalesce(x->>'q', '') || ': ' || coalesce(x->>'a', ''), E'\n')
  into summary
  from jsonb_array_elements(clean_answers) x;

  -- someone we know (by phone, else by e-mail)
  if clean_phone is not null then
    select c.id, c.responsible_broker_id into found, found_broker
    from public.clients c
    where c.organization_id = f.organization_id and c.phone_normalized = public.normalize_phone(clean_phone)
    limit 1;
  end if;
  if found is null and clean_email is not null then
    select c.id, c.responsible_broker_id into found, found_broker
    from public.clients c
    where c.organization_id = f.organization_id and lower(c.email) = clean_email
    limit 1;
  end if;

  if found is null then
    insert into public.clients (
      organization_id, responsible_broker_id, full_name, phone, email, types, client_class, source, stage, notes, lead_form_id
    )
    values (
      f.organization_id, f.broker_id,
      left(coalesce(clean_name, clean_phone, clean_email, 'Контакт от анкета'), 120),
      left(clean_phone, 40), left(clean_email, 200),
      array[f.client_type], 'C', f.source, 'new_contact',
      left(concat_ws(E'\n', 'От анкета „' || f.name || '“', summary), 5000),
      f.id
    )
    returning id into client;
    if f.broker_id is not null then
      perform public.notify(
        f.organization_id, f.broker_id, null, 'lead_new',
        jsonb_build_object('actor', left(coalesce(clean_name, clean_phone, clean_email), 120), 'title', f.name),
        '/clients/' || client
      );
    end if;
  else
    client := found;
    update public.clients
    set notes = left(concat_ws(E'\n', notes, 'От анкета „' || f.name || '“ (' || to_char(public.sofia_today(), 'DD.MM.YYYY') || ')', summary), 5000)
    where id = found;
    if coalesce(found_broker, f.broker_id) is not null then
      perform public.notify(
        f.organization_id, coalesce(found_broker, f.broker_id), null, 'lead_known',
        jsonb_build_object('actor', left(coalesce(clean_name, clean_phone, clean_email), 120), 'title', f.name),
        '/clients/' || found
      );
    end if;
  end if;

  insert into public.lead_form_responses (form_id, organization_id, client_id, answers)
  values (f.id, f.organization_id, client, clean_answers);
  update public.lead_forms
  set last_response_at = now(), connected_at = coalesce(connected_at, now())
  where id = f.id;
  return client;
end;
$$;

grant execute on function public.ping_lead_form(uuid) to anon, authenticated;
grant execute on function public.submit_lead_form(uuid, text, text, text, jsonb) to anon, authenticated;

-- A form's new contact is told to its broker as "a new contact from the form" (not also as "a client given to you").
create or replace function public.on_client_owner_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member record;
  previous uuid := case when tg_op = 'UPDATE' then old.responsible_broker_id end;
begin
  if tg_op = 'UPDATE' and new.responsible_broker_id is not distinct from old.responsible_broker_id then
    return new;
  end if;
  if tg_op = 'INSERT' and new.lead_form_id is not null and new.responsible_broker_id is not null then
    return new;
  end if;

  if new.responsible_broker_id is null then
    for member in
      select profile_id from public.organization_members
      where organization_id = new.organization_id
        and profile_id is distinct from auth.uid()
        and profile_id is distinct from previous
    loop
      perform public.notify(
        new.organization_id, member.profile_id, auth.uid(), 'free_contact',
        jsonb_build_object('title', new.full_name), '/contacts'
      );
    end loop;
  elsif new.responsible_broker_id is distinct from auth.uid() then
    perform public.notify(
      new.organization_id, new.responsible_broker_id, auth.uid(), 'client_assigned',
      jsonb_build_object(
        'title', new.full_name,
        'hours', (select follow_up_first_hours from public.organizations where id = new.organization_id)
      ),
      '/clients/' || new.id
    );
  elsif tg_op = 'UPDATE' and previous is null then
    for member in
      select profile_id from public.organization_members
      where organization_id = new.organization_id and role in ('owner', 'manager') and profile_id <> auth.uid()
    loop
      perform public.notify(
        new.organization_id, member.profile_id, auth.uid(), 'contact_claimed',
        jsonb_build_object('title', new.full_name, 'actor', public.person_name(auth.uid())),
        '/clients/' || new.id
      );
    end loop;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- A colleague's search entered: the whole agency hears of it
-- ---------------------------------------------------------------------
create or replace function public.on_partner_search_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member record;
begin
  for member in
    select profile_id from public.organization_members
    where organization_id = new.organization_id and profile_id is distinct from new.created_by
  loop
    perform public.notify(
      new.organization_id, member.profile_id, new.created_by, 'partner_search',
      jsonb_build_object(
        'actor', public.person_name(new.created_by),
        'title', new.broker_name || coalesce(' (' || new.agency || ')', ''),
        'kind', new.operation
      ),
      '/partner-searches'
    );
  end loop;
  return new;
end;
$$;

revoke execute on function public.on_partner_search_added() from public, anon, authenticated;

create trigger partner_searches_notify
  after insert on public.partner_searches
  for each row execute function public.on_partner_search_added();
