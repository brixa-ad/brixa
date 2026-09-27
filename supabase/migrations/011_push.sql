-- =====================================================================
-- BRIXA — migration 011: notifications on the phone (web push)
-- Every new notification is also sent to the phones/computers where its
-- recipient turned push on. The database calls the app (/api/push), which
-- sends it through the browser's push service.
-- Run once in Supabase → SQL Editor → New query → Run (after 010).
-- =====================================================================

-- HTTP calls from the database (Supabase's pg_net)
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net is not available — push notifications stay off';
end;
$$;

-- ---------------------------------------------------------------------
-- The devices that receive push notifications
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 10 and 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth_key text not null check (char_length(auth_key) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  -- the device's language, for the text of the notification
  lang text not null default 'bg' check (lang in ('bg', 'en')),
  created_at timestamptz not null default now()
);

create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- A random token per notification: only the database knows it, so only its own
-- call to /api/push can fetch what to send.
alter table public.notifications
  add column push_token uuid not null default gen_random_uuid(),
  add column pushed_at timestamptz;

-- ---------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------

-- This device should get my notifications (a device moves to whoever signed in last).
create or replace function public.save_push_subscription(
  sub_endpoint text, sub_p256dh text, sub_auth text, sub_agent text, sub_lang text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if sub_endpoint !~ '^https://' then raise exception 'invalid_endpoint'; end if;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth_key, user_agent, lang)
  values (
    auth.uid(), sub_endpoint, sub_p256dh, sub_auth, left(sub_agent, 300),
    case when sub_lang in ('bg', 'en') then sub_lang else 'bg' end
  )
  on conflict (endpoint) do update
  set profile_id = excluded.profile_id,
      p256dh = excluded.p256dh,
      auth_key = excluded.auth_key,
      user_agent = excluded.user_agent,
      lang = excluded.lang,
      created_at = now();
end;
$$;

-- Called by /api/push with the notification's id and token: marks it sent (once)
-- and returns the text data plus the devices to send it to.
create or replace function public.claim_push(target uuid, token uuid)
returns table (type text, data jsonb, link text, endpoint text, p256dh text, auth_key text, lang text)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed record;
begin
  update public.notifications n
  set pushed_at = now()
  where n.id = target and n.push_token = token and n.pushed_at is null
  returning n.recipient_id, n.type, n.data, n.link into claimed;

  if not found then return; end if;

  return query
  select claimed.type, claimed.data, claimed.link, s.endpoint, s.p256dh, s.auth_key, s.lang
  from public.push_subscriptions s
  where s.profile_id = claimed.recipient_id;
end;
$$;

-- /api/push reports devices the push service no longer knows (uninstalled, signed out…).
create or replace function public.remove_dead_push_subscriptions(target uuid, token uuid, endpoints text[])
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions s
  using public.notifications n
  where n.id = target and n.push_token = token and n.pushed_at is not null
    and s.profile_id = n.recipient_id
    and s.endpoint = any (endpoints);
$$;

-- "Send me a test notification" from Settings.
create or replace function public.send_test_notification()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  select organization_id into org from public.organization_members where profile_id = auth.uid() limit 1;
  if org is null then raise exception 'forbidden'; end if;
  perform public.notify(org, auth.uid(), null, 'push_test', '{}', '/settings');
end;
$$;

-- New notification → ask the app to push it (only if the recipient has a device).
create or replace function public.push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from public.push_subscriptions where profile_id = new.recipient_id) then
    perform net.http_post(
      url := 'https://brixa-yavlena.vercel.app/api/push',
      body := jsonb_build_object('id', new.id, 'token', new.push_token),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
end;
$$;

create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.push_notification();

-- ---------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

create policy "push subscriptions: read own" on public.push_subscriptions
  for select to authenticated using (profile_id = auth.uid());
create policy "push subscriptions: delete own" on public.push_subscriptions
  for delete to authenticated using (profile_id = auth.uid());
-- saving goes through save_push_subscription()

revoke execute on function public.push_notification() from public, anon, authenticated;
revoke execute on function public.save_push_subscription(text, text, text, text, text) from public, anon;
revoke execute on function public.send_test_notification() from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text, text) to authenticated;
grant execute on function public.send_test_notification() to authenticated;
-- /api/push calls these without a signed-in user; they need the notification's secret token
grant execute on function public.claim_push(uuid, uuid) to anon, authenticated;
grant execute on function public.remove_dead_push_subscriptions(uuid, uuid, text[]) to anon, authenticated;
