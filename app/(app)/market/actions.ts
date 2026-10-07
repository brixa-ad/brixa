"use server";

import { revalidatePath } from "next/cache";
import { isDay } from "@/lib/deal-validation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type MarketPricesInput = {
  operation: "sale" | "rent";
  settlementId: string;
  prices: { neighborhoodId: string | null; price: number | null }[];
  source: string;
  asOf: string;
};

/** A manager saves a town's average prices (an empty price removes that row). */
export async function saveMarketPrices(input: MarketPricesInput): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isLeader) return { ok: false };
  if (
    (input.operation !== "sale" && input.operation !== "rent") ||
    !input.settlementId ||
    input.source.trim().length > 120 ||
    !isDay(input.asOf) ||
    input.prices.length > 500 ||
    !input.prices.every((p) => p.price === null || (Number.isFinite(p.price) && p.price > 0 && p.price < 1_000_000))
  ) {
    return { ok: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_market_prices", {
    target_org: session.organizationId,
    target_operation: input.operation,
    target_settlement: input.settlementId,
    prices: input.prices.map((p) => ({ neighborhood_id: p.neighborhoodId, price: p.price })),
    price_source: input.source.trim() || null,
    price_date: input.asOf,
  });
  if (error) {
    console.error("Saving market prices failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/market");
  return { ok: true };
}

/** A manager works today's market out again now (after entering many listings, say). */
export async function refreshMarketToday(): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isLeader) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("refresh_market_today", { target_org: session.organizationId });
  if (error) {
    console.error("Refreshing the market failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/market");
  return { ok: true };
}

/** The owner or an office manager: the neighbourhoods a pasted table has and the town doesn't (villages stay out). */
export async function addNeighborhoods(settlementId: string, names: string[]): Promise<{ ok: boolean; hoods: { id: string; name: string }[] }> {
  const session = await getSession();
  if (!session?.isLeader || !Array.isArray(names) || names.length === 0) return { ok: false, hoods: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_neighborhoods", {
    target_settlement: settlementId,
    names: names.filter((n) => typeof n === "string").slice(0, 80),
  });
  if (error) {
    console.error("Adding neighbourhoods failed:", error.message);
    return { ok: false, hoods: [] };
  }
  revalidatePath("/market");
  return { ok: true, hoods: (data ?? []) as { id: string; name: string }[] };
}

export type FoundTown = { id: string; name: string; region: string | null; neighborhoods: { id: string; name: string }[] };

/** Any town or village by the start of its name (towns first) — with its neighbourhoods, for the price table. */
export async function findTowns(query: string): Promise<FoundTown[]> {
  const session = await getSession();
  const q = String(query ?? "").trim().replace(/^(гр\.|с\.)\s*/i, "").replace(/[%_]/g, "");
  if (!session?.isLeader || q.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("geo_settlements")
    .select("id, name, settlement_type, region:geo_regions(name), hoods:geo_neighborhoods(id, name)")
    .ilike("name", `${q}%`)
    .order("settlement_type", { ascending: true })
    .order("name")
    .limit(12);
  type Raw = { id: string; name: string; settlement_type: string; region: { name: string } | { name: string }[] | null; hoods: { id: string; name: string }[] };
  return ((data ?? []) as unknown as Raw[])
    .sort((a, b) => Number(b.settlement_type === "гр.") - Number(a.settlement_type === "гр."))
    .map((s) => ({
      id: s.id,
      name: `${s.settlement_type} ${s.name}`,
      region: (Array.isArray(s.region) ? s.region[0]?.name : s.region?.name) ?? null,
      neighborhoods: [...(s.hoods ?? [])].sort((a, b) => a.name.localeCompare(b.name, "bg")),
    }));
}
