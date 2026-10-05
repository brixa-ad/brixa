"use server";

import { revalidatePath } from "next/cache";
import { portalOf } from "@/lib/rating";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type ComparableInput = { url: string; title: string; price: number; area: number; floor: number | null };

/** A similar listing the broker found on a portal: it counts in the listing's market and its analysis. */
export async function addComparable(propertyId: string, input: ComparableInput): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const url = String(input.url ?? "").trim();
  const valid =
    Number.isFinite(input.price) &&
    input.price > 0 &&
    input.price < 100_000_000 &&
    Number.isFinite(input.area) &&
    input.area > 0 &&
    input.area < 100_000 &&
    (input.floor === null || (Number.isInteger(input.floor) && input.floor >= -5 && input.floor <= 200)) &&
    (url === "" || (/^https?:\/\//i.test(url) && url.length <= 500));
  if (!valid) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("property_comparables").insert({
    organization_id: session.organizationId,
    property_id: propertyId,
    url: url || null,
    source: portalOf(url || null),
    title: String(input.title ?? "").trim().slice(0, 160) || null,
    price: Math.round(input.price),
    currency: "EUR",
    area: Math.round(input.area * 100) / 100,
    floor: input.floor,
  });
  if (error) {
    console.error("Adding a comparable failed:", error.message);
    return { ok: false };
  }
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

export async function removeComparable(id: string, propertyId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("property_comparables").delete().eq("id", id).select("id");
  revalidatePath(`/properties/${propertyId}`);
  return { ok: !error && Boolean(data?.length) };
}
