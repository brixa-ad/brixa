"use server";

import { revalidatePath } from "next/cache";
import { validatePartnerSearch, type PartnerSearchErrors, type PartnerSearchInput } from "@/lib/partner-validation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type PartnerSaveResult = { ok: true; id: string } | { ok: false; errors?: PartnerSearchErrors; message?: "generic" };

const uniq = <T,>(list: T[]) => [...new Set(list)];

/** Add or edit a colleague's search (the one who entered it or a manager may edit — the database checks). */
export async function savePartnerSearch(input: PartnerSearchInput, id?: string): Promise<PartnerSaveResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "generic" };
  const errors = validatePartnerSearch(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const s = input.search;
  const row = {
    broker_name: input.brokerName.trim(),
    agency: input.agency.trim() || null,
    phone: input.phone.trim() || null,
    email: input.email.trim() || null,
    note: input.note.trim(),
    operation: s.operation,
    subtype_ids: uniq(s.subtypeIds),
    settlement_ids: uniq(s.settlementIds),
    neighborhood_ids: uniq(s.neighborhoodIds),
    budget_min: s.budgetMin,
    budget_max: s.budgetMax,
    currency: s.currency,
    area_min: s.areaMin,
    area_max: s.areaMax,
    rooms_min: s.roomsMin,
    rooms_max: s.roomsMax,
    feature_ids: uniq(s.featureIds),
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("partner_searches").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase
        .from("partner_searches")
        .insert({ ...row, organization_id: session.organizationId, created_by: session.userId })
        .select("id")
        .single();
  if (error || !data) {
    console.error("Saving a colleague's search failed:", error?.message ?? "no row");
    return { ok: false, message: "generic" };
  }
  revalidatePath("/partner-searches");
  return { ok: true, id: data.id };
}

export async function setPartnerSearchActive(id: string, active: boolean): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("partner_searches").update({ active }).eq("id", id).select("id");
  revalidatePath("/partner-searches");
  return { ok: !error && Boolean(data?.length) };
}

export async function deletePartnerSearch(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("partner_searches").delete().eq("id", id).select("id");
  revalidatePath("/partner-searches");
  return { ok: !error && Boolean(data?.length) };
}
