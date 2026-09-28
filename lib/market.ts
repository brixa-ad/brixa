import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type MarketOperation = "sale" | "rent";

/** What the app says about one listing's price (see market_facts in the database). */
export type MarketFacts = {
  operation: MarketOperation;
  apartment: boolean;
  area: number | null;
  price_eur: number | null;
  own_sqm: number | null;
  reference: { sqm: number; source: string | null; as_of: string; level: "neighborhood" | "city" } | null;
  /** how wide the agency's own comparison is */
  scope: "neighborhood" | "city";
  active: { count: number; median_sqm: number | null };
  /** sales: the register and BRIXA deals; scope decided on its own */
  sold: { count: number; median_sqm: number | null; avg_days: number | null; scope: "neighborhood" | "city" };
  /** usual haggling: asking → final, as a fraction */
  discount: number | null;
  benchmark: { sqm: number; basis: "reference" | "listings" } | null;
  /** own €/m² against the benchmark, as a fraction (0.08 = 8% above) */
  diff: number | null;
  estimate: { low: number; mid: number; high: number } | null;
  expected_final: number | null;
};

export type MarketArea = {
  settlement_id: string;
  neighborhood_id: string | null;
  town: string;
  neighborhood: string | null;
  ref_sqm: number | null;
  source: string | null;
  as_of: string | null;
  active_count: number;
  active_sqm: number | null;
  sold_count: number;
  sold_sqm: number | null;
  sold_days: number | null;
};

export type MarketListing = {
  id: string;
  title: string;
  neighborhood: string | null;
  broker: string | null;
  own_sqm: number;
  bench: number;
  diff: number;
};

/** A listing off the market by at least this much is flagged. */
export const MARKET_TOLERANCE = 0.05;

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export function toMarketFacts(raw: unknown): MarketFacts | null {
  if (!raw) return null;
  const m = raw as MarketFacts;
  return {
    ...m,
    area: num(m.area),
    price_eur: num(m.price_eur),
    own_sqm: num(m.own_sqm),
    reference: m.reference ? { ...m.reference, sqm: Number(m.reference.sqm) } : null,
    active: { count: Number(m.active?.count ?? 0), median_sqm: num(m.active?.median_sqm) },
    sold: {
      scope: m.sold?.scope === "neighborhood" ? "neighborhood" : "city",
      count: Number(m.sold?.count ?? 0),
      median_sqm: num(m.sold?.median_sqm),
      avg_days: num(m.sold?.avg_days),
    },
    discount: num(m.discount),
    benchmark: m.benchmark ? { ...m.benchmark, sqm: Number(m.benchmark.sqm) } : null,
    diff: num(m.diff),
    estimate: m.estimate
      ? { low: Number(m.estimate.low), mid: Number(m.estimate.mid), high: Number(m.estimate.high) }
      : null,
    expected_final: num(m.expected_final),
  };
}

/** One listing against the market (null: not a listing, or not this agency's). */
export const getMarketSnapshot = cache(async (propertyId: string): Promise<MarketFacts | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("market_snapshot", { target_property: propertyId });
  if (error) {
    console.error("Market snapshot failed:", error.message);
    return null;
  }
  return toMarketFacts(data);
});

/** The Market page: every place the agency works in, and the listings off the market. */
export async function getMarketOverview(organizationId: string, operation: MarketOperation) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("market_overview", {
    target_org: organizationId,
    target_operation: operation,
  });
  if (error) console.error("Market overview failed:", error.message);
  const raw = (data ?? { areas: [], listings: [] }) as { areas: MarketArea[]; listings: MarketListing[] };
  return {
    areas: raw.areas.map((a) => ({
      ...a,
      ref_sqm: num(a.ref_sqm),
      active_count: Number(a.active_count),
      active_sqm: num(a.active_sqm),
      sold_count: Number(a.sold_count),
      sold_sqm: num(a.sold_sqm),
      sold_days: num(a.sold_days),
    })),
    listings: raw.listings.map((l) => ({ ...l, own_sqm: Number(l.own_sqm), bench: Number(l.bench), diff: Number(l.diff) })),
  };
}

export type MarketTown = {
  id: string;
  name: string;
  neighborhoods: { id: string; name: string }[];
};

/** Towns a manager can set prices for: the ones with neighborhoods, and any the agency has listings in. */
export async function getMarketTowns(organizationId: string): Promise<MarketTown[]> {
  const supabase = await createClient();
  const [{ data: hoods }, { data: listed }] = await Promise.all([
    supabase
      .from("geo_neighborhoods")
      .select("id, name, settlement:geo_settlements(id, name, settlement_type)")
      .order("name")
      .limit(2000),
    supabase
      .from("properties")
      .select("settlement:geo_settlements(id, name, settlement_type)")
      .eq("organization_id", organizationId)
      .not("settlement_id", "is", null)
      .limit(2000),
  ]);

  type Town = { id: string; name: string; settlement_type: string } | null;
  const towns = new Map<string, MarketTown>();
  const listings = new Map<string, number>();
  const add = (town: Town) => {
    if (town && !towns.has(town.id)) towns.set(town.id, { id: town.id, name: `${town.settlement_type} ${town.name}`, neighborhoods: [] });
    return town ? towns.get(town.id)! : null;
  };
  for (const row of (hoods ?? []) as unknown as { id: string; name: string; settlement: Town }[]) {
    add(row.settlement)?.neighborhoods.push({ id: row.id, name: row.name });
  }
  for (const row of (listed ?? []) as unknown as { settlement: Town }[]) {
    const town = add(row.settlement);
    if (town) listings.set(town.id, (listings.get(town.id) ?? 0) + 1);
  }
  for (const town of towns.values()) town.neighborhoods.sort((a, b) => a.name.localeCompare(b.name, "bg"));
  // where the agency works most comes first
  return [...towns.values()].sort(
    (a, b) =>
      (listings.get(b.id) ?? 0) - (listings.get(a.id) ?? 0) ||
      b.neighborhoods.length - a.neighborhoods.length ||
      a.name.localeCompare(b.name, "bg")
  );
}

/** The reference prices the agency keeps, by town. */
export async function getMarketPrices(organizationId: string, operation: MarketOperation) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("market_prices")
    .select("settlement_id, neighborhood_id, price_per_sqm, source, as_of")
    .eq("organization_id", organizationId)
    .eq("operation", operation);
  return ((data ?? []) as { settlement_id: string; neighborhood_id: string | null; price_per_sqm: number; source: string | null; as_of: string }[]).map(
    (row) => ({ ...row, price_per_sqm: Number(row.price_per_sqm) })
  );
}
