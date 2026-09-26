import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchInput } from "./client-validation";

/** A property may cost up to this much over the buyer's maximum budget. */
export const BUDGET_TOLERANCE = 0.1;
const CANDIDATE_LIMIT = 500;
// The lev is pegged to the euro; USD has no fixed rate, so it's only compared with USD.
const TO_EUR: Record<string, number | undefined> = { EUR: 1, BGN: 1 / 1.95583 };

export type Match = {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  area: number | null;
  rooms: number | null;
  settlement: { name: string; settlement_type: string } | null;
  neighborhood: { name: string } | null;
  coverPath: string | null;
  brokerId: string | null;
  broker: { full_name: string | null; email: string; avatar_path: string | null } | null;
  score: number;
  /** percent over the maximum budget (only when over it) */
  overBudgetPct: number | null;
};

type Candidate = {
  id: string;
  title: string;
  current_price: number | null;
  currency: string;
  area: number | null;
  rooms: number | null;
  settlement_id: string | null;
  neighborhood_id: string | null;
  responsible_broker_id: string | null;
  settlement: Match["settlement"];
  neighborhood: Match["neighborhood"];
  broker: Match["broker"];
  photos: { storage_path: string }[];
  feature_values: { feature_id: string }[];
};

function convert(amount: number, from: string, to: string): number | null {
  if (from === to) return amount;
  const fromRate = TO_EUR[from];
  const toRate = TO_EUR[to];
  if (fromRate === undefined || toRate === undefined) return null;
  return (amount * fromRate) / toRate;
}

const inRange = (value: number, min: number | null, max: number | null) =>
  (min === null || value >= min) && (max === null || value <= max);

/** Active agency listings that fit a buyer's / tenant's search, best first. */
export async function findMatches(
  supabase: SupabaseClient,
  organizationId: string,
  search: SearchInput
): Promise<Match[]> {
  let query = supabase
    .from("properties")
    .select(
      `id, title, current_price, currency, area, rooms, settlement_id, neighborhood_id, responsible_broker_id,
      settlement:geo_settlements(name, settlement_type),
      neighborhood:geo_neighborhoods(name),
      broker:profiles!properties_responsible_broker_id_fkey(full_name, email, avatar_path),
      photos:property_photos(storage_path),
      feature_values:property_feature_values(feature_id)`
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .eq("operation_type", search.operation)
    .order("position", { referencedTable: "property_photos" })
    .limit(1, { referencedTable: "property_photos" })
    .limit(CANDIDATE_LIMIT);

  if (search.subtypeIds.length) query = query.in("subtype_id", search.subtypeIds);
  if (search.settlementIds.length) query = query.in("settlement_id", search.settlementIds);

  const [{ data, error }, neighborhoodsRes] = await Promise.all([
    query,
    search.neighborhoodIds.length
      ? supabase.from("geo_neighborhoods").select("id, settlement_id").in("id", search.neighborhoodIds)
      : Promise.resolve({ data: [] as { id: string; settlement_id: string }[] }),
  ]);

  if (error) {
    console.error("Matching failed:", error.message);
    return [];
  }

  // Settlements where the buyer narrowed down to specific neighborhoods.
  const narrowed = new Set((neighborhoodsRes.data ?? []).map((n) => n.settlement_id));
  const wantedNeighborhoods = new Set(search.neighborhoodIds);
  const requiredFeatures = search.featureIds;

  const matches: Match[] = [];

  for (const p of (data ?? []) as unknown as Candidate[]) {
    let score = 100;
    let overBudgetPct: number | null = null;

    if (p.settlement_id && narrowed.has(p.settlement_id)) {
      if (!p.neighborhood_id || !wantedNeighborhoods.has(p.neighborhood_id)) continue;
    }

    if (requiredFeatures.length) {
      const has = new Set(p.feature_values.map((f) => f.feature_id));
      if (!requiredFeatures.every((id) => has.has(id))) continue;
    }

    const price = p.current_price === null ? null : Number(p.current_price);
    if (price === null) {
      score -= 10;
    } else if (search.budgetMax !== null || search.budgetMin !== null) {
      const inBuyerCurrency = convert(price, p.currency, search.currency);
      if (inBuyerCurrency === null) {
        score -= 10; // can't compare currencies
      } else {
        if (search.budgetMax !== null && inBuyerCurrency > search.budgetMax) {
          if (inBuyerCurrency > search.budgetMax * (1 + BUDGET_TOLERANCE)) continue;
          overBudgetPct = Math.ceil(((inBuyerCurrency - search.budgetMax) / search.budgetMax) * 100);
          score -= 15;
        }
        if (search.budgetMin !== null && inBuyerCurrency < search.budgetMin) score -= 10;
      }
    }

    const area = p.area === null ? null : Number(p.area);
    if (search.areaMin !== null || search.areaMax !== null) {
      if (area === null) score -= 5;
      else if (!inRange(area, search.areaMin, search.areaMax)) continue;
    }

    if (search.roomsMin !== null || search.roomsMax !== null) {
      if (p.rooms === null) score -= 5;
      else if (!inRange(p.rooms, search.roomsMin, search.roomsMax)) continue;
    }

    matches.push({
      id: p.id,
      title: p.title,
      price,
      currency: p.currency,
      area,
      rooms: p.rooms,
      settlement: p.settlement,
      neighborhood: p.neighborhood,
      coverPath: p.photos[0]?.storage_path ?? null,
      brokerId: p.responsible_broker_id,
      broker: p.broker,
      score,
      overBudgetPct,
    });
  }

  return matches.sort((a, b) => b.score - a.score || (a.price ?? Infinity) - (b.price ?? Infinity));
}
