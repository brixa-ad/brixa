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
