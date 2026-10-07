import "server-only";
import { cache } from "react";
import { toMarketFacts, type MarketFacts } from "./market";
import { parseRating, type Rating } from "./rating";
import { createClient } from "./supabase/server";

/** A comparable the broker found on a portal. */
export type AddedComparable = {
  id: string;
  url: string | null;
  source: string | null;
  title: string | null;
  area: number;
  floor: number | null;
  priceEur: number;
  sqm: number;
};

/** One of the agency's own similar listings nearby. */
export type OwnComparable = {
  title: string;
  neighborhood: string | null;
  area: number;
  floor: number | null;
  priceEur: number;
  sqm: number;
  status: string;
};

export type NearbySale = { area: number; priceEur: number; sqm: number; soldOn: string; sameNeighborhood: boolean };

export type Analysis = {
  facts: MarketFacts;
  rating: Rating | null;
  added: AddedComparable[];
  listings: OwnComparable[];
  sales: NearbySale[];
};

const n = (value: unknown) => Number(value);
const nOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** A listing against the market: the stars, the comparables and the sales around (null: not a listing). */
export const getAnalysis = cache(async (propertyId: string): Promise<Analysis | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("property_analysis", { target_property: propertyId });
  if (error) {
    console.error("The analysis failed:", error.message);
    return null;
  }
  return parseAnalysis(data);
});

/** The analysis as the database sends it (property_analysis, shared_analysis). */
export function parseAnalysis(data: unknown): Analysis | null {
  const facts = toMarketFacts(data);
  if (!data || !facts) return null;
  const raw = data as {
    rating: unknown;
    added: Record<string, unknown>[];
    listings: Record<string, unknown>[];
    sales: Record<string, unknown>[];
  };
  return {
    facts,
    rating: parseRating(raw.rating),
    added: (raw.added ?? []).map((c) => ({
      id: String(c.id),
      url: (c.url as string | null) ?? null,
      source: (c.source as string | null) ?? null,
      title: (c.title as string | null) ?? null,
      area: n(c.area),
      floor: nOrNull(c.floor),
      priceEur: n(c.price_eur),
      sqm: n(c.sqm),
    })),
    listings: (raw.listings ?? []).map((c) => ({
      title: String(c.title ?? ""),
      neighborhood: (c.neighborhood as string | null) ?? null,
      area: n(c.area),
      floor: nOrNull(c.floor),
      priceEur: n(c.price_eur),
      sqm: n(c.sqm),
      status: String(c.status ?? "active"),
    })),
    sales: (raw.sales ?? []).map((s) => ({
      area: n(s.area),
      priceEur: n(s.price_eur),
      sqm: n(s.sqm),
      soldOn: String(s.sold_on),
      sameNeighborhood: Boolean(s.same_neighborhood),
    })),
  };
}
