"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateClosedDeal, type ClosedDealErrors, type ClosedDealInput } from "@/lib/closed-deal-validation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type ClosedSaveResult = { ok: true } | { ok: false; errors?: ClosedDealErrors; message?: "generic" };

/** A manager records (or corrects) a closed deal. */
export async function saveClosedDeal(input: ClosedDealInput, id?: string): Promise<ClosedSaveResult> {
  const session = await getSession();
  if (!session?.isManager) return { ok: false, message: "generic" };
  const errors = validateClosedDeal(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const supabase = await createClient();
  const colleagueIsOurs = input.colleague !== "" && input.colleague !== "other";

  // both brokers have to be in the agency
  const ids = [input.brokerId!, ...(colleagueIsOurs ? [input.colleague] : [])];
  const { data: members } = await supabase
    .from("organization_members")
    .select("profile_id")
    .eq("organization_id", session.organizationId)
    .in("profile_id", ids);
  const found = new Set((members ?? []).map((m) => m.profile_id));
  if (!found.has(input.brokerId!)) return { ok: false, errors: { brokerId: "invalid" } };
  if (colleagueIsOurs && !found.has(input.colleague)) return { ok: false, errors: { colleague: "invalid" } };

  const row = {
    reported_on: input.reportedOn,
    subtype_id: input.subtypeId,
    settlement_id: input.settlementId,
    neighborhood_id: input.settlementId ? input.neighborhoodId : null,
    address: input.address.trim() || null,
    side: input.side,
    conditions: [...new Set(input.conditions)],
    construction: input.construction,
    parking: input.parking || input.parkingPrice !== null,
    area: input.area,
    price: input.price,
    parking_price: input.parkingPrice,
    broker_id: input.brokerId,
    colleague_id: colleagueIsOurs ? input.colleague : null,
    colleague_name: input.colleague === "other" ? input.colleagueName.trim() || null : null,
    colleague_agency: input.colleague === "other" ? input.colleagueAgency.trim() || null : null,
    double_sided: colleagueIsOurs || (input.colleague === "" && input.doubleSided),
    property_id: input.propertyId,
    note: input.note.trim() || null,
  };

  const { error } = id
    ? await supabase.from("closed_deals").update(row).eq("id", id)
    : await supabase.from("closed_deals").insert({ ...row, organization_id: session.organizationId, created_by: session.userId });
  if (error) {
    console.error("Saving a closed deal failed:", error.message);
    return { ok: false, message: "generic" };
  }
  revalidatePath("/closed-deals");
  revalidatePath("/market");
  return { ok: true };
}

export async function deleteClosedDeal(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("closed_deals").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false };
  revalidatePath("/closed-deals");
  revalidatePath("/market");
  redirect("/closed-deals");
}
