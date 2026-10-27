"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const PATH = "/market/scout";

export type WatchInput = {
  operation: "sale" | "rent";
  settlementIds: string[];
  neighborhoodIds: string[];
  subtypeIds: string[];
  priceMax: number | null;
  privateOnly: boolean;
};

/** A new search: one per place picked (each place with its own neighbourhoods). */
export async function saveWatch(input: WatchInput): Promise<{ ok: boolean; error?: "tooMany" | "needTown" | "generic" }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "generic" };
  const towns = [...new Set(input.settlementIds)].slice(0, 5);
  if (towns.length === 0) return { ok: false, error: "needTown" };
  const supabase = await createClient();
  const { data: hoods } = input.neighborhoodIds.length
    ? await supabase.from("geo_neighborhoods").select("id, settlement_id").in("id", input.neighborhoodIds)
    : { data: [] as { id: string; settlement_id: string }[] };
  const price = input.priceMax !== null && Number.isFinite(input.priceMax) && input.priceMax > 0 ? Math.round(input.priceMax) : null;

  const { error } = await supabase.from("market_watches").insert(
    towns.map((town) => ({
      organization_id: session.organizationId,
      profile_id: session.userId,
      operation: input.operation === "rent" ? "rent" : "sale",
      settlement_id: town,
      neighborhood_ids: (hoods ?? []).filter((h) => h.settlement_id === town).map((h) => h.id),
      subtype_ids: [...new Set(input.subtypeIds)],
      price_max: price,
      private_only: input.privateOnly,
    }))
  );
  if (error) {
    if (error.message.includes("too many watches")) return { ok: false, error: "tooMany" };
    console.error("Saving a market watch failed:", error.message);
    return { ok: false, error: "generic" };
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function setWatchActive(id: string, active: boolean) {
  const supabase = await createClient();
  await supabase.from("market_watches").update({ active }).eq("id", id);
  revalidatePath(PATH);
}

export async function deleteWatch(id: string) {
  const supabase = await createClient();
  await supabase.from("market_watches").delete().eq("id", id);
  revalidatePath(PATH);
}

/** Today's search for a watch, at once (still one a day). */
export async function runWatch(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("run_market_watch", { target: id });
  if (error) console.error("Starting a market search failed:", error.message);
  return { ok: data === true };
}

export async function followListing(listingId: string, on: boolean) {
  const session = await getSession();
  if (!session) return;
  const supabase = await createClient();
  if (on) await supabase.from("market_tracks").insert({ listing_id: listingId, profile_id: session.userId });
  else await supabase.from("market_tracks").delete().eq("listing_id", listingId).eq("profile_id", session.userId);
  revalidatePath(PATH);
}

export async function followLink(link: string): Promise<{ ok: boolean }> {
  const url = link.trim();
  if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url) || url.length > 600) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("follow_market_listing", { link: url });
  if (error) console.error("Following a listing failed:", error.message);
  revalidatePath(PATH);
  return { ok: Boolean(data) };
}

/** A listing that fits a buyer went to them (written in the client's history), or doesn't fit after all. */
export async function markMatch(id: string, how: "sent" | "dismissed", note?: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("market_matches")
    .update(how === "sent" ? { sent_at: new Date().toISOString() } : { dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .select("client_id")
    .maybeSingle();
  if (how === "sent" && data?.client_id && note) {
    const { logActivity } = await import("../../tasks/actions");
    await logActivity({ type: "message", clientId: data.client_id, propertyId: null, note: note.slice(0, 1000) });
  }
  revalidatePath(PATH);
}
