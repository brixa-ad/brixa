-- =====================================================================
-- BRIXA — migration 013: next-morning report of unfinished tasks,
-- the client's phone/e-mail in pushes, property history, property
-- documents, several exposures per property
-- Run once in Supabase → SQL Editor → New query → Run (after 012).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Unfinished tasks: next morning (from 08:30) the broker and the managers hear
-- ---------------------------------------------------------------------
create table public.task_digests (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (profile_id, day)
);
alter table public.task_digests enable row level security;
-- no policies: only the job below writes it

create or replace function public.notify_missed_tasks(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := at_time at time zone 'Europe/Sofia';
  today date := local_now::date;
  person record;
  manager record;
  sent integer := 0;
begin
  if local_now::time < time '08:30' then return 0; end if;

  for person in
    select t.organization_id, t.assigned_to, count(*)::int as n,
      array_to_string((array_agg(t.title order by t.due_date, t.title))[1:3], ', ') as titles
    from public.tasks t
    where t.status = 'open' and t.due_date < today
    group by t.organization_id, t.assigned_to
  loop
    insert into public.task_digests (profile_id, day) values (person.assigned_to, today)
    on conflict do nothing;
    if not found then continue; end if;

    perform public.notify(
      person.organization_id, person.assigned_to, null, 'tasks_missed',
      jsonb_build_object('count', person.n, 'title', person.titles),
      '/tasks'
    );
    for manager in
      select profile_id from public.organization_members
      where organization_id = person.organization_id
        and role in ('owner', 'manager')
        and profile_id <> person.assigned_to
    loop
      perform public.notify(
        person.organization_id, manager.profile_id, person.assigned_to, 'tasks_missed_team',
        jsonb_build_object('count', person.n, 'title', person.titles, 'actor', public.person_name(person.assigned_to)),
        '/tasks?broker=' || person.assigned_to
      );
    end loop;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.notify_missed_tasks(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Pushes about a task carry the client's phone / e-mail (call, Viber, mail
-- straight from the notification) — only when the recipient may see that client
-- ---------------------------------------------------------------------
drop function public.claim_push(uuid, uuid);

create function public.claim_push(target uuid, token uuid)
returns table (
  type text, data jsonb, link text, endpoint text, p256dh text, auth_key text, lang text,
  phone text, email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed record;
  contact_phone text;
  contact_email text;
begin
  update public.notifications n
  set pushed_at = now()
  where n.id = target and n.push_token = token and n.pushed_at is null
  returning n.recipient_id, n.type, n.data, n.link into claimed;

  if not found then return; end if;

  if claimed.link ~ '^/tasks/[0-9a-f-]{36}$' then
    select c.phone, c.email into contact_phone, contact_email
    from public.tasks t
    join public.clients c on c.id = t.client_id
    where t.id = substr(claimed.link, 8)::uuid
      and (
        c.responsible_broker_id = claimed.recipient_id
        or exists (
          select 1 from public.organization_members m
          where m.organization_id = c.organization_id and m.profile_id = claimed.recipient_id
            and m.role in ('owner', 'manager')
        )
      );
  end if;

  return query
  select claimed.type, claimed.data, claimed.link, s.endpoint, s.p256dh, s.auth_key, s.lang,
    contact_phone, contact_email
  from public.push_subscriptions s
  where s.profile_id = claimed.recipient_id;
end;
$$;

grant execute on function public.claim_push(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Property history: status changes (prices are already kept)
-- ---------------------------------------------------------------------
create table public.property_status_log (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties (id) on delete cascade,
  status text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index property_status_log_property_idx on public.property_status_log (property_id, changed_at desc);

create or replace function public.log_property_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.property_status_log (property_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger properties_log_status
  after update of status on public.properties
  for each row execute function public.log_property_status();

alter table public.property_status_log enable row level security;
create policy "property status log: read" on public.property_status_log
  for select to authenticated using (public.can_view_property(property_id));

-- ---------------------------------------------------------------------
-- Property documents (deeds, sketches, contracts…) — the responsible broker
-- and the managers only. Files: <organization_id>/<property_id>/<uuid>/<name>
-- ---------------------------------------------------------------------
create table public.property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  storage_path text not null unique,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  mime_type text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index property_documents_property_idx on public.property_documents (property_id, created_at desc);

alter table public.property_documents enable row level security;
create policy "property documents: read" on public.property_documents
  for select to authenticated using (public.can_edit_property(property_id));
create policy "property documents: add" on public.property_documents
  for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_edit_property(property_id));
create policy "property documents: delete" on public.property_documents
  for delete to authenticated using (public.can_edit_property(property_id));

create or replace function public.can_manage_property_file(object_name text)
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
    where array_length(string_to_array(object_name, '/'), 1) >= 3
      and p.organization_id::text = split_part(object_name, '/', 1)
      and p.id::text = split_part(object_name, '/', 2)
      and m.profile_id = auth.uid()
      and (m.role in ('owner', 'manager') or p.responsible_broker_id = auth.uid())
  );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-documents', 'property-documents', false, 20971520, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
])
on conflict (id) do nothing;

create policy "property documents: read files" on storage.objects
  for select to authenticated
  using (bucket_id = 'property-documents' and public.can_manage_property_file(name));
create policy "property documents: upload files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-documents' and public.can_manage_property_file(name));
create policy "property documents: delete files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-documents' and public.can_manage_property_file(name));

-- ---------------------------------------------------------------------
-- Several exposures per property (the single "exposure" stays, unused)
-- ---------------------------------------------------------------------
alter table public.properties
  add column exposures text[] not null default '{}'
    check (exposures <@ array['south', 'north', 'east', 'west', 'south_east', 'south_west', 'north_east', 'north_west']);

update public.properties
set exposures = case exposure
  when 'east_west' then array['east', 'west']
  when 'south_north' then array['south', 'north']
  when 'multiple' then array['south', 'north', 'east', 'west']
  else array[exposure]
end
where exposure is not null
  and exposure in ('south', 'north', 'east', 'west', 'south_east', 'south_west', 'north_east', 'north_west',
                   'east_west', 'south_north', 'multiple');

-- ---------------------------------------------------------------------
-- Schedule the morning report (needs Cron, on since 007)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-missed-tasks', '*/15 * * * *', 'select public.notify_missed_tasks()');
  end if;
end;
$$;
