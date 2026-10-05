import "server-only";
import { cache } from "react";
import type { Dictionary } from "./i18n/dictionaries";
import { getCommissionDefaults, getMyPeople } from "./lookups";
import type { DealKind, DealStage, DealStatus } from "./options";
import { createClient } from "./supabase/server";

type Person = { full_name: string | null; email: string; avatar_path?: string | null };

export type DealRow = {
  id: string;
  kind: DealKind;
  stage: DealStage;
  status: DealStatus;
  price: number | null;
  currency: string;
  /** euro: expected while open, real once won */
  commission: number | null;
  /** what stays with the agency after the external broker's share — what counts */
  net_commission: number | null;
  referral_name: string | null;
  referral_percent: number | null;
  referral_paid_on: string | null;
  closed_on: string | null;
  confirmed_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  double_sided: boolean;
  buyer_rate: number | null;
  partner_agency: string | null;
  partner_broker: string | null;
  partner_side: "buyer" | "seller" | null;
  viewing_on: string | null;
  offer_on: string | null;
  deposit_on: string | null;
  preliminary_on: string | null;
  notary_on: string | null;
  /** HH:MM:SS when a step is scheduled at a set time */
  viewing_time: string | null;
  offer_time: string | null;
  deposit_time: string | null;
  preliminary_time: string | null;
  notary_time: string | null;
  deposit_amount: number | null;
  preliminary_bank: number | null;
  preliminary_cash: number | null;
  notary_bank: number | null;
  notary_cash: number | null;
  broker_id: string | null;
  created_by: string | null;
  property_id: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
  property: { id: string; title: string; status: string; current_price: number | null; currency: string } | null;
  offers: { amount: number; currency: string; status: string; offered_on: string; hold_deposit: number | null; created_at: string }[];
  /** null when not linked, or when the client isn't visible to this user */
  client: { id: string; full_name: string; phone: string | null } | null;
  broker: Person | null;
  confirmer: Person | null;
};

export const DEAL_SELECT = `id, kind, stage, status, price, currency, commission, net_commission, closed_on, confirmed_at, lost_reason, notes,
  double_sided, buyer_rate, partner_agency, partner_broker, partner_side,
  viewing_on, offer_on, deposit_on, preliminary_on, notary_on,
  viewing_time, offer_time, deposit_time, preliminary_time, notary_time,
  deposit_amount, preliminary_bank, preliminary_cash, notary_bank, notary_cash,
  referral_name, referral_percent, referral_paid_on,
  broker_id, created_by, property_id, client_id, created_at, updated_at,
  property:properties(id, title, status, current_price, currency),
  offers:deal_offers(amount, currency, status, offered_on, hold_deposit, created_at),
  client:clients(id, full_name, phone),
  broker:profiles!deals_broker_id_fkey(full_name, email, avatar_path),
  confirmer:profiles!deals_confirmed_by_fkey(full_name, email)`;

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export function toDeals(rows: unknown[] | null): DealRow[] {
  return ((rows ?? []) as DealRow[]).map((row) => ({
    ...row,
    price: num(row.price),
    commission: num(row.commission),
    net_commission: num(row.net_commission),
    referral_percent: num(row.referral_percent),
    buyer_rate: num(row.buyer_rate),
    deposit_amount: num(row.deposit_amount),
    preliminary_bank: num(row.preliminary_bank),
    preliminary_cash: num(row.preliminary_cash),
    notary_bank: num(row.notary_bank),
    notary_cash: num(row.notary_cash),
    property: row.property ? { ...row.property, current_price: num(row.property.current_price) } : null,
    offers: (row.offers ?? []).map((o) => ({ ...o, amount: Number(o.amount), hold_deposit: num(o.hold_deposit) })),
  }));
}

export function dealTitle(deal: Pick<DealRow, "property" | "client">, t: Dictionary) {
  return deal.property?.title ?? deal.client?.full_name ?? t.deals.untitled;
}

export const getDeal = cache(async (id: string): Promise<DealRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("deals").select(DEAL_SELECT).eq("id", id).maybeSingle();
  if (error) {
    console.error("Loading deal failed:", error.message);
    return null;
  }
  return data ? toDeals([data])[0] : null;
});

export type DealFormProperty = {
  id: string;
  title: string;
  operation_type: string;
  current_price: number | null;
  currency: string;
  commission_rate: number | null;
};

/** Choices for the deal form: colleagues, visible clients, listings for sale or rent. */
export async function getDealFormLookups(organizationId: string) {
  const supabase = await createClient();
  const [members, clients, properties, defaults] = await Promise.all([
    getMyPeople(supabase),
    supabase
      .from("clients")
      .select("id, full_name, phone")
      .eq("organization_id", organizationId)
      .not("responsible_broker_id", "is", null)
      .order("full_name")
      .limit(1000),
    supabase
      .from("properties")
      .select("id, title, operation_type, current_price, currency, commission_rate")
      .eq("organization_id", organizationId)
      .in("operation_type", ["sale", "rent"])
      .order("updated_at", { ascending: false })
      .limit(500),
    getCommissionDefaults(organizationId),
  ]);
  return {
    members,
    clients: clients.data ?? [],
    properties: ((properties.data ?? []) as DealFormProperty[]).map((p) => ({
      ...p,
      current_price: num(p.current_price),
      commission_rate: num(p.commission_rate),
    })),
    defaults,
  };
}
