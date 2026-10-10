import "server-only";
import { cache } from "react";
import { LOAN_STATES, emptySearch, type FinancingInput, type OfferInput, type SearchInput } from "./client-validation";
import { fetchAllSettlements, getMyPeople } from "./lookups";
import { CURRENCIES, isOneOf, type ClientClass, type ClientStage, type ClientType } from "./options";
import { createClient } from "./supabase/server";
import type { Category, Feature, Member, Region, Settlement, Subtype } from "./types";

type SearchRow = {
  operation: string;
  subtype_ids: string[];
  settlement_ids: string[];
  neighborhood_ids: string[];
  budget_min: number | string | null;
  budget_max: number | string | null;
  currency: string;
  area_min: number | string | null;
  area_max: number | string | null;
  rooms_min: number | null;
  rooms_max: number | null;
  feature_ids: string[];
};

type OfferRow = {
  operation: string;
  subtype_id: string | null;
  settlement_id: string | null;
  neighborhood_id: string | null;
  area: number | string | null;
  rooms: number | null;
  price: number | string | null;
  currency: string;
};

type FinancingRow = {
  loan: string | null;
  own_funds: number | string | null;
  bank_amount: number | string | null;
  bank_referred: boolean;
  bank_name: string | null;
  bank_fee: number | string | null;
  bank_fee_received_on: string | null;
};

export function financingFromRow(row: FinancingRow | null): FinancingInput | null {
  if (!row) return null;
  const amount = (value: number | string | null) => (value === null ? null : Number(value));
  return {
    loan: isOneOf(LOAN_STATES, row.loan) ? row.loan : null,
    ownFunds: amount(row.own_funds),
    bankAmount: amount(row.bank_amount),
    bankReferred: row.bank_referred,
    bankName: row.bank_name ?? "",
    bankFee: amount(row.bank_fee),
    bankFeeReceivedOn: row.bank_fee_received_on,
  };
}

export function offerFromRow(row: OfferRow | null): OfferInput | null {
  if (!row) return null;
  return {
    operation: row.operation === "rent" ? "rent" : "sale",
    subtypeId: row.subtype_id,
    settlementId: row.settlement_id,
    neighborhoodId: row.neighborhood_id,
    area: row.area === null ? null : Number(row.area),
    rooms: row.rooms,
    price: row.price === null ? null : Number(row.price),
    currency: isOneOf(CURRENCIES, row.currency) ? row.currency : "EUR",
  };
}

export type ClientDetail = {
  id: string;
  organization_id: string;
  responsible_broker_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  types: ClientType[];
  client_class: ClientClass;
  source: string | null;
  referrer: string | null;
  stage: ClientStage;
  notes: string | null;
  birth_day: number | null;
  birth_month: number | null;
  /** when the next contact is due (null: free contact, closed deal or lost) */
  follow_up_at: string | null;
  /** gets a short market note every month */
  monthly_news: boolean;
  created_at: string;
  updated_at: string;
  broker: { full_name: string | null; email: string; avatar_path: string | null } | null;
  search: SearchInput | null;
  offer: OfferInput | null;
  financing: FinancingInput | null;
};

const num = (value: number | string | null) => (value === null ? null : Number(value));

export function searchFromRow(row: SearchRow | null): SearchInput | null {
  if (!row) return null;
  return {
    operation: row.operation === "rent" ? "rent" : "sale",
    subtypeIds: row.subtype_ids ?? [],
    settlementIds: row.settlement_ids ?? [],
    neighborhoodIds: row.neighborhood_ids ?? [],
    budgetMin: num(row.budget_min),
    budgetMax: num(row.budget_max),
    currency: isOneOf(CURRENCIES, row.currency) ? row.currency : "EUR",
    areaMin: num(row.area_min),
    areaMax: num(row.area_max),
    roomsMin: row.rooms_min,
    roomsMax: row.rooms_max,
    featureIds: row.feature_ids ?? [],
  };
}

/** Cached per request; null when missing or not visible to this user (RLS). */
export const getClient = cache(async (id: string): Promise<ClientDetail | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select(
      `id, organization_id, responsible_broker_id, full_name, phone, email, types, client_class, source, referrer, stage,
      notes, birth_day, birth_month, follow_up_at, monthly_news, created_at, updated_at,
      broker:profiles!clients_responsible_broker_id_fkey(full_name, email, avatar_path),
      search:client_searches(*),
      offer:client_offers(*),
      financing:client_financing(*)`
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Loading client failed:", error.message);
    return null;
  }
  if (!data) return null;

  const rawSearch = data.search as unknown as SearchRow | SearchRow[] | null;
  const searchRow = Array.isArray(rawSearch) ? (rawSearch[0] ?? null) : rawSearch;
  const rawOffer = data.offer as unknown as OfferRow | OfferRow[] | null;
  const offerRow = Array.isArray(rawOffer) ? (rawOffer[0] ?? null) : rawOffer;
  const rawFinancing = data.financing as unknown as FinancingRow | FinancingRow[] | null;
  const financingRow = Array.isArray(rawFinancing) ? (rawFinancing[0] ?? null) : rawFinancing;

  return {
    ...(data as unknown as Omit<ClientDetail, "search" | "offer" | "financing">),
    search: searchFromRow(searchRow),
    offer: offerFromRow(offerRow),
    financing: financingFromRow(financingRow),
  };
});

export type ClientFormLookups = {
  categories: Category[];
  subtypes: Subtype[];
  features: Feature[];
  regions: Region[];
  settlements: Settlement[];
  members: Member[];
};

export async function getClientFormLookups(): Promise<ClientFormLookups> {
  const supabase = await createClient();
  const [categories, subtypes, features, regions, settlements, members] = await Promise.all([
    supabase.from("property_categories").select("id, code, name, name_en").order("sort_order"),
    supabase.from("property_subtypes").select("id, category_id, code, name, name_en").order("sort_order"),
    supabase.from("property_features").select("id, code, name, name_en").order("name"),
    supabase.from("geo_regions").select("id, code, name").order("name"),
    fetchAllSettlements(supabase),
    getMyPeople(supabase),
  ]);

  return {
    categories: categories.data ?? [],
    subtypes: subtypes.data ?? [],
    features: features.data ?? [],
    regions: (regions.data ?? []).sort((a, b) => a.name.localeCompare(b.name, "bg")),
    settlements,
    members,
  };
}

export { emptySearch };
