-- =====================================================================
-- BRIXA — migration 026: the register of closed deals, as the office writes it
--   * the brokers are plain names (ours, the colleague's, the colleague's
--     agency) — not picked from the team
--   * "double deal" means our broker did both sides alone
--   * the address in parts: street, number, block, entrance, floor, apartment
-- Run once in Supabase → SQL Editor → New query → Run (after 025).
-- =====================================================================

alter table public.closed_deals
  add column broker_name text check (broker_name is null or char_length(broker_name) <= 120),
  add column street text check (street is null or char_length(street) <= 120),
  add column street_no text check (street_no is null or char_length(street_no) <= 20),
  add column block text check (block is null or char_length(block) <= 20),
  add column entrance text check (entrance is null or char_length(entrance) <= 10),
  add column floor text check (floor is null or char_length(floor) <= 10),
  add column apartment text check (apartment is null or char_length(apartment) <= 20);

-- what's already recorded: the team members become names
update public.closed_deals cd
set broker_name = coalesce(p.full_name, p.email)
from public.profiles p
where p.id = cd.broker_id;

-- a colleague from our team: the name, no other agency — and the deal was theirs together, not one broker's alone
update public.closed_deals cd
set colleague_name = coalesce(p.full_name, p.email),
    colleague_agency = null,
    double_sided = false
from public.profiles p
where p.id = cd.colleague_id;

update public.closed_deals set broker_name = '—' where broker_name is null;
update public.closed_deals set street = address where street is null and address is not null;

alter table public.closed_deals alter column broker_name set not null;
alter table public.closed_deals drop column colleague_id;
alter table public.closed_deals drop column broker_id;
