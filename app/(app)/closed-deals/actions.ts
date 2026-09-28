"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { closedAddress, validateClosedDeal, type ClosedDealErrors, type ClosedDealInput } from "@/lib/closed-deal-validation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type ClosedSaveResult = { ok: true } | { ok: false; errors?: ClosedDealErrors; message?: "generic" };

const orNull = (value: string) => value.trim() || null;

/** A manager records (or corrects) a closed deal. */
export async function saveClosedDeal(input: ClosedDealInput, id?: string): Promise<ClosedSaveResult> {
  const session = await getSession();
  if (!session?.isManager) return { ok: false, message: "generic" };
  const errors = validateClosedDeal(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const row = {
    reported_on: input.reportedOn,
    subtype_id: input.subtypeId,
    settlement_id: input.settlementId,
    neighborhood_id: input.settlementId ? input.neighborhoodId : null,
    street: orNull(input.street),
    street_no: orNull(input.streetNo),
    block: orNull(input.block),
    entrance: orNull(input.entrance),
    floor: orNull(input.floor),
    apartment: orNull(input.apartment),
    address: closedAddress(input) || null,
    side: input.side,
    conditions: [...new Set(input.conditions)],
    construction: input.construction,
    parking: input.parking || input.parkingPrice !== null,
    area: input.area,
    price: input.price,
    parking_price: input.parkingPrice,
    broker_name: input.brokerName.trim(),
    // one broker on both sides: nobody else to name
    colleague_name: input.doubleSided ? null : orNull(input.colleagueName),
    colleague_agency: input.doubleSided ? null : orNull(input.colleagueAgency),
    double_sided: input.doubleSided,
    property_id: input.propertyId,
    note: orNull(input.note),
  };

  const supabase = await createClient();
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
