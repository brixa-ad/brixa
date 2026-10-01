import "server-only";
import { createClient } from "./supabase/server";
import type { MarketOperation } from "./market";

/** One place (a neighbourhood or the whole town) and one type (or every type), on one day. */
export type MarketCell = {
  day: string;
  settlement_id: string;
  neighborhood_id: string | null;
  subtype_id: string | null;
  listings: number;
  listing_avg: number | null;
  listing_median: number | null;
  sold_count: number;
  sold_avg: number | null;
  demand: number;
  town: string;
  neighborhood: string | null;
  subtype: { code: string; name: string; name_en: string | null; sort_order: number } | null;
};

type Raw = Omit<MarketCell, "town" | "neighborhood" | "subtype" | "listing_avg" | "listing_median" | "sold_avg"> & {
  listing_avg: string | number | null;
  listing_median: string | number | null;
  sold_avg: string | number | null;
  settlement: { name: string; settlement_type: string } | { name: string; settlement_type: string }[] | null;
  hood: { name: string } | { name: string }[] | null;
  subtype: MarketCell["subtype"] | NonNullable<MarketCell["subtype"]>[];
};

const SELECT = `day, settlement_id, neighborhood_id, subtype_id, listings, listing_avg, listing_median, sold_count, sold_avg, demand,
  settlement:geo_settlements(name, settlement_type), hood:geo_neighborhoods(name), subtype:property_subtypes(code, name, name_en, sort_order)`;

const first = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));
const num = (value: string | number | null) => (value === null ? null : Number(value));

function toCell(raw: Raw): MarketCell {
  const town = first(raw.settlement);
  return {
    day: raw.day,
    settlement_id: raw.settlement_id,
    neighborhood_id: raw.neighborhood_id,
    subtype_id: raw.subtype_id,
    listings: raw.listings,
    listing_avg: num(raw.listing_avg),
    listing_median: num(raw.listing_median),
    sold_count: raw.sold_count,
    sold_avg: num(raw.sold_avg),
    demand: raw.demand,
    town: town ? `${town.settlement_type} ${town.name}` : "—",
    neighborhood: first(raw.hood)?.name ?? null,
    subtype: first(raw.subtype),
  };
}

/** The latest day's numbers — and those of about a month before (for the change). */
export async function getMarketDay(organizationId: string, operation: MarketOperation) {
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("market_daily")
    .select("day")
    .eq("organization_id", organizationId)
    .eq("operation", operation)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { day: null, cells: [] as MarketCell[], before: null as string | null, previous: [] as MarketCell[] };

  // about 30 days before (else the oldest day there is)
  const monthAgo = new Date(Date.parse(`${latest.day}T12:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: rows, error }, { data: older }, { data: oldest }] = await Promise.all([
    supabase.from("market_daily").select(SELECT).eq("organization_id", organizationId).eq("operation", operation).eq("day", latest.day).limit(5000),
    supabase
      .from("market_daily")
      .select("day")
      .eq("organization_id", organizationId)
      .eq("operation", operation)
      .lte("day", monthAgo)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("market_daily")
      .select("day")
      .eq("organization_id", organizationId)
      .eq("operation", operation)
      .lt("day", latest.day)
      .order("day", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error) console.error("The market's day failed:", error.message);
  const before = older?.day ?? oldest?.day ?? null;
  let previous: MarketCell[] = [];
  if (before) {
    const { data } = await supabase
      .from("market_daily")
      .select(SELECT)
      .eq("organization_id", organizationId)
      .eq("operation", operation)
      .eq("day", before)
      .limit(5000);
    previous = ((data ?? []) as unknown as Raw[]).map(toCell);
  }
  return { day: latest.day as string, cells: ((rows ?? []) as unknown as Raw[]).map(toCell), before, previous };
}

/** One place and type, day by day (the last half year). */
export async function getMarketHistory(
  organizationId: string,
  operation: MarketOperation,
  settlementId: string,
  neighborhoodId: string | null,
  subtypeId: string | null
) {
  const supabase = await createClient();
  const since = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10);
  let query = supabase
    .from("market_daily")
    .select("day, listings, listing_avg, sold_avg, demand")
    .eq("organization_id", organizationId)
    .eq("operation", operation)
    .eq("settlement_id", settlementId)
    .gte("day", since)
    .order("day");
  query = neighborhoodId ? query.eq("neighborhood_id", neighborhoodId) : query.is("neighborhood_id", null);
  query = subtypeId ? query.eq("subtype_id", subtypeId) : query.is("subtype_id", null);
  const { data } = await query;
  return (data ?? []).map((row) => ({
    day: row.day as string,
    listings: row.listings as number,
    listing_avg: num(row.listing_avg),
    sold_avg: num(row.sold_avg),
    demand: row.demand as number,
  }));
}
