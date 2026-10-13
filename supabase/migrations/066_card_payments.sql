-- =====================================================================
-- BRIXA — migration 066: paying by card (Stripe)
--   * an agency pays its package by card on Stripe's page, monthly or yearly;
--     Stripe renews it by itself and tells BRIXA (a webhook), and BRIXA keeps
--     "paid until", the package and every payment;
--   * BRIXA checks Stripe's signature in the database itself, with the secret
--     BRIXA's owner saves in /admin — no other key is needed;
--   * reminders to the agency's owner: the card renews in 3 days; the paid
--     time or the trial ends (7, 3 and 1 day before); a payment that failed.
-- Run once in Supabase → SQL Editor → New query → Run (after 065).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.organizations
  add column if not exists stripe_customer_id text
    check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  add column if not exists stripe_subscription_id text
    check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  add column if not exists billing_interval text
    check (billing_interval is null or billing_interval in ('month', 'year')),
  -- the card renews by itself (off: it ends with the paid time)
  add column if not exists auto_renew boolean not null default false,
  add column if not exists payment_failed_at timestamptz;

-- only BRIXA (and Stripe, through the webhook) changes what an agency pays — or the owner, accepting the terms
create or replace function public.guard_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.trial_ends_at, new.plan_code, new.paid_until, new.comped, new.terms_accepted_at, new.terms_version,
      new.stripe_customer_id, new.stripe_subscription_id, new.billing_interval, new.auto_renew, new.payment_failed_at)
     is distinct from
     (old.trial_ends_at, old.plan_code, old.paid_until, old.comped, old.terms_accepted_at, old.terms_version,
      old.stripe_customer_id, old.stripe_subscription_id, old.billing_interval, old.auto_renew, old.payment_failed_at)
     and auth.uid() is not null and not public.is_platform_admin()
     and coalesce(current_setting('brixa.accepting_terms', true), '') <> 'on'
     and coalesce(current_setting('brixa.billing', true), '') <> 'on' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- what an agency has paid
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  method text not null default 'card' check (method in ('card', 'bank')),
  amount numeric(12, 2) not null,
  currency text not null default 'EUR',
  plan_code text,
  billing_interval text check (billing_interval is null or billing_interval in ('month', 'year')),
  period_start date,
  period_end date,
  stripe_invoice_id text unique,
  invoice_url text,
  invoice_pdf text,
  created_at timestamptz not null default now()
);
create index if not exists payments_org_idx on public.payments (organization_id, created_at desc);
alter table public.payments enable row level security;
drop policy if exists "payments: the owner and BRIXA read" on public.payments;
create policy "payments: the owner and BRIXA read" on public.payments
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = payments.organization_id and m.profile_id = auth.uid() and m.role = 'owner'
    )
  );
grant select on public.payments to authenticated;

-- Stripe's events, each applied once
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- the webhook's signing secret: out of reach of the API
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.billing (
  id boolean primary key default true check (id),
  stripe_webhook_secret text
);
insert into private.billing (id) values (true) on conflict do nothing;
revoke all on private.billing from public, anon, authenticated;

-- BRIXA's owner saves (or clears) the secret Stripe shows for the webhook
create or replace function public.set_stripe_webhook_secret(secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    return false;
  end if;
  if nullif(btrim(coalesce(secret, '')), '') is not null and btrim(secret) !~ '^whsec_[A-Za-z0-9+/=_-]{10,200}$' then
    return false;
  end if;
  update private.billing set stripe_webhook_secret = nullif(btrim(coalesce(secret, '')), '');
  return true;
end;
$$;

-- for /admin: is the webhook's secret saved?
create or replace function public.stripe_webhook_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() and exists (select 1 from private.billing where stripe_webhook_secret is not null);
$$;

revoke execute on function public.set_stripe_webhook_secret(text) from public, anon;
grant execute on function public.set_stripe_webhook_secret(text) to authenticated;
revoke execute on function public.stripe_webhook_ready() from public, anon;
grant execute on function public.stripe_webhook_ready() to authenticated;

-- a uuid from Stripe's metadata (null when it isn't one)
create or replace function public.uuid_or_null(value text)
returns uuid
language sql
immutable
as $$
  select case when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then value::uuid end;
$$;

-- tell the agency's owners
create or replace function public.tell_owners(target_org uuid, kind text, payload jsonb, target_link text)
returns void
language sql
security definer
set search_path = public
as $$
  select public.notify(target_org, m.profile_id, null, kind, payload, target_link)
  from public.organization_members m
  where m.organization_id = target_org and m.role = 'owner';
$$;
revoke execute on function public.tell_owners(uuid, text, jsonb, text) from public, anon, authenticated;

-- Stripe tells BRIXA what happened: checked by its signature, applied once
create or replace function public.stripe_webhook(payload text, signature text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
  stamp bigint;
  expected text;
  signed boolean := false;
  part text;
  event jsonb;
  kind text;
  obj jsonb;
  meta jsonb;
  org uuid;
  sub_id text;
  plan text;
  every text;
  period_from bigint;
  period_to bigint;
  amount numeric;
  until date;
begin
  select b.stripe_webhook_secret into secret from private.billing b;
  if secret is null then
    return 'not_configured';
  end if;
  if payload is null or signature is null or length(payload) > 1000000 then
    return 'bad_signature';
  end if;

  -- Stripe's signature: t=<seconds>,v1=<hmac-sha256 of "t.payload">, within 5 minutes
  stamp := nullif(substring(signature from '(?:^|,)\s*t=([0-9]{1,12})'), '')::bigint;
  if stamp is null or abs(extract(epoch from now())::bigint - stamp) > 300 then
    return 'bad_signature';
  end if;
  expected := encode(extensions.hmac(convert_to(stamp::text || '.' || payload, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'), 'hex');
  foreach part in array string_to_array(signature, ',') loop
    if btrim(part) = 'v1=' || expected then
      signed := true;
    end if;
  end loop;
  if not signed then
    return 'bad_signature';
  end if;
  -- signed by Stripe: the agency's billing may change (the guard lets it)
  perform set_config('brixa.billing', 'on', true);

  event := payload::jsonb;
  kind := event ->> 'type';
  insert into public.stripe_events (id, type) values (event ->> 'id', coalesce(kind, '?')) on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;
  obj := event -> 'data' -> 'object';

  -- whose: the metadata BRIXA put on the payment, or the agency's Stripe customer
  meta := coalesce(
    nullif(obj -> 'metadata', '{}'::jsonb),
    obj #> '{parent,subscription_details,metadata}',
    obj #> '{subscription_details,metadata}',
    '{}'::jsonb
  );
  org := coalesce(public.uuid_or_null(obj ->> 'client_reference_id'), public.uuid_or_null(meta ->> 'org'));
  if org is null and obj ->> 'customer' is not null then
    select o.id into org from public.organizations o where o.stripe_customer_id = obj ->> 'customer';
  end if;
  if org is null or not exists (select 1 from public.organizations o where o.id = org) then
    return 'ignored';
  end if;
  plan := (select p.code from public.plans p where p.code = meta ->> 'plan');
  every := case when meta ->> 'interval' in ('month', 'year') then meta ->> 'interval' end;

  if kind = 'checkout.session.completed' then
    if obj ->> 'mode' = 'subscription' then
      update public.organizations
      set stripe_customer_id = coalesce(obj ->> 'customer', stripe_customer_id),
          stripe_subscription_id = coalesce(obj ->> 'subscription', stripe_subscription_id),
          plan_code = coalesce(plan, plan_code),
          billing_interval = coalesce(every, billing_interval),
          auto_renew = true,
          payment_failed_at = null
      where id = org;
    end if;

  elsif kind = 'invoice.paid' then
    sub_id := coalesce(obj #>> '{parent,subscription_details,subscription}', obj ->> 'subscription');
    select max((l #>> '{period,end}')::bigint), min((l #>> '{period,start}')::bigint)
    into period_to, period_from
    from jsonb_array_elements(coalesce(obj #> '{lines,data}', '[]'::jsonb)) l;
    if period_to is null then
      return 'ignored';
    end if;
    until := (to_timestamp(period_to) at time zone 'Europe/Sofia')::date;
    amount := coalesce((obj ->> 'amount_paid')::numeric, 0) / 100;
    update public.organizations
    set paid_until = greatest(coalesce(paid_until, until), until),
        plan_code = coalesce(plan, plan_code),
        billing_interval = coalesce(every, billing_interval),
        stripe_customer_id = coalesce(stripe_customer_id, obj ->> 'customer'),
        stripe_subscription_id = coalesce(sub_id, stripe_subscription_id),
        payment_failed_at = null
    where id = org;
    insert into public.payments (organization_id, method, amount, currency, plan_code, billing_interval, period_start, period_end, stripe_invoice_id, invoice_url, invoice_pdf)
    values (
      org, 'card', amount, upper(coalesce(obj ->> 'currency', 'eur')),
      coalesce(plan, (select plan_code from public.organizations where id = org)),
      coalesce(every, (select billing_interval from public.organizations where id = org)),
      (to_timestamp(period_from) at time zone 'Europe/Sofia')::date, until,
      obj ->> 'id', left(obj ->> 'hosted_invoice_url', 1000), left(obj ->> 'invoice_pdf', 1000)
    )
    on conflict (stripe_invoice_id) do nothing;
    perform public.tell_owners(org, 'payment_received', jsonb_build_object('amount', amount, 'date', until), '/subscription');
    perform public.tell_platform('card_payment', jsonb_build_object(
      'title', (select name from public.organizations where id = org),
      'amount', amount,
      'plan', (select p.name from public.plans p where p.code = coalesce(plan, (select plan_code from public.organizations where id = org)))));

  elsif kind = 'invoice.payment_failed' then
    update public.organizations set payment_failed_at = now() where id = org;
    perform public.tell_owners(org, 'payment_failed', jsonb_build_object('amount', coalesce((obj ->> 'amount_due')::numeric, 0) / 100), '/subscription');

  elsif kind = 'customer.subscription.updated' or kind = 'customer.subscription.created' then
    update public.organizations
    set stripe_subscription_id = obj ->> 'id',
        stripe_customer_id = coalesce(stripe_customer_id, obj ->> 'customer'),
        auto_renew = obj ->> 'status' in ('active', 'trialing', 'past_due')
          and not coalesce((obj ->> 'cancel_at_period_end')::boolean, false)
          and obj ->> 'cancel_at' is null,
        billing_interval = coalesce(
          case when obj #>> '{items,data,0,price,recurring,interval}' in ('month', 'year') then obj #>> '{items,data,0,price,recurring,interval}' end,
          every, billing_interval),
        plan_code = coalesce(plan, plan_code)
    where id = org;

  elsif kind = 'customer.subscription.deleted' then
    update public.organizations
    set auto_renew = false, stripe_subscription_id = null
    where id = org and stripe_subscription_id = obj ->> 'id';
  end if;

  return 'ok';
end;
$$;

revoke execute on function public.stripe_webhook(text, text) from public;
grant execute on function public.stripe_webhook(text, text) to anon, authenticated;

-- every morning: the reminders to the agency's owners
create or replace function public.notify_billing(day date default public.sofia_today())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  sent integer := 0;
  trial_day date;
  price numeric;
begin
  for o in
    select org.* from public.organizations org where not coalesce(org.comped, false)
  loop
    trial_day := (o.trial_ends_at at time zone 'Europe/Sofia')::date;
    if o.auto_renew and o.stripe_subscription_id is not null and o.paid_until = day + 3 then
      -- the card renews by itself: what and when (a year costs 10 months)
      price := (select p.price_month from public.plans p where p.code = o.plan_code)
               * case when o.billing_interval = 'year' then 10 else 1 end;
      perform public.tell_owners(o.id, 'subscription_renews', jsonb_build_object('date', o.paid_until, 'amount', price), '/subscription');
      sent := sent + 1;
    elsif (not o.auto_renew or o.stripe_subscription_id is null) and o.paid_until in (day + 7, day + 3, day + 1) then
      perform public.tell_owners(o.id, 'subscription_ends', jsonb_build_object('date', o.paid_until, 'days', o.paid_until - day), '/subscription');
      sent := sent + 1;
    elsif (o.paid_until is null or o.paid_until < day) and trial_day in (day + 3, day + 1) then
      perform public.tell_owners(o.id, 'trial_ends', jsonb_build_object('date', trial_day, 'days', trial_day - day), '/subscription');
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;

revoke execute on function public.notify_billing(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brixa-billing', '0 6 * * *', 'select public.notify_billing()');
  end if;
end;
$$;
