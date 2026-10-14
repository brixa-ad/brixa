-- =====================================================================
-- BRIXA — migration 067: saving Stripe's webhook secret
--   Supabase refuses an UPDATE without WHERE coming through its API (a
--   safeguard), so saving the secret in /admin failed. Now it is written
--   with an insert-or-update, which the safeguard allows.
-- Run once in Supabase → SQL Editor → New query → Run (after 066).
-- =====================================================================

create or replace function public.set_stripe_webhook_secret(secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  value text := nullif(btrim(coalesce(secret, '')), '');
begin
  if not public.is_platform_admin() then
    return false;
  end if;
  if value is not null and value !~ '^whsec_[A-Za-z0-9+/=_-]{10,200}$' then
    return false;
  end if;
  insert into private.billing (id, stripe_webhook_secret)
  values (true, value)
  on conflict (id) do update set stripe_webhook_secret = excluded.stripe_webhook_secret;
  return true;
end;
$$;

revoke execute on function public.set_stripe_webhook_secret(text) from public, anon;
grant execute on function public.set_stripe_webhook_secret(text) to authenticated;
