-- =====================================================================
-- BRIXA — migration 025: the stop deposit on an offer
--   How much the buyer left with the offer to take the property off the
--   market ("стоп капаро"), e.g. 2 000 €.
-- Run once in Supabase → SQL Editor → New query → Run (after 024).
-- =====================================================================

alter table public.deal_offers
  add column hold_deposit numeric(14, 2) check (hold_deposit is null or hold_deposit >= 0);
