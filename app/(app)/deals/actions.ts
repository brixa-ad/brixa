"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEAL_LIMITS, isDay, validateDeal, type DealErrors, type DealInput } from "@/lib/deal-validation";
import { DEAL_STAGES, isOneOf } from "@/lib/options";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type DealSaveResult =
  | { ok: true; id: string }
  | { ok: false; errors?: DealErrors; message?: "generic" | "confirmed" };
export type DealActionResult = { ok: true } | { ok: false; message: "generic" | "confirmed" };

type Linked = { id: string; property_id: string | null; client_id: string | null };

function refresh(deal: Linked | null) {
  revalidatePath("/");
  revalidatePath("/deals");
  if (!deal) return;
  revalidatePath(`/deals/${deal.id}`);
  if (deal.property_id) revalidatePath(`/properties/${deal.property_id}`);
  if (deal.client_id) revalidatePath(`/clients/${deal.client_id}`);
}

/** The database refuses brokers' changes to a confirmed deal with this code. */
const failure = (message: string | undefined) => (message?.includes("deal_confirmed") ? "confirmed" : "generic");

export async function saveDeal(input: DealInput, dealId?: string): Promise<DealSaveResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "generic" };

  const errors = validateDeal(input);
  // The commission counts for whoever the deal is on — brokers can only put it on themselves.
  if (!session.isManager && input.brokerId !== session.userId) errors.brokerId = "invalid";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const supabase = await createClient();

  // Linked records must be visible to the person saving (RLS does the checking).
  const [member, client, property] = await Promise.all([
    supabase
      .from("organization_members")
      .select("profile_id")
      .eq("organization_id", session.organizationId)
      .eq("profile_id", input.brokerId)
      .maybeSingle(),
    input.clientId ? supabase.from("clients").select("id").eq("id", input.clientId).maybeSingle() : { data: true },
    input.propertyId
      ? supabase.from("properties").select("id").eq("id", input.propertyId).maybeSingle()
      : { data: true },
  ]);
  if (!member.data) return { ok: false, errors: { brokerId: "invalid" } };
  if (!client.data) return { ok: false, errors: { clientId: "invalid" } };
  if (!property.data) return { ok: false, errors: { propertyId: "invalid" } };

  const row = {
    kind: input.kind,
    property_id: input.propertyId,
    client_id: input.clientId,
    broker_id: input.brokerId,
    stage: input.stage,
    price: input.price,
    currency: input.currency,
    commission: input.commission,
    notes: input.notes.trim() || null,
  };

  const { data, error } = dealId
    ? await supabase.from("deals").update(row).eq("id", dealId).select("id, property_id, client_id").maybeSingle()
    : await supabase
        .from("deals")
        .insert({ ...row, organization_id: session.organizationId, created_by: session.userId })
        .select("id, property_id, client_id")
        .single();

  if (error || !data) {
    console.error("Saving deal failed:", error?.message ?? "no row");
    return { ok: false, message: failure(error?.message) };
  }

  refresh(data);
  return { ok: true, id: data.id };
}

async function update(dealId: string, changes: Record<string, unknown>): Promise<DealActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .update(changes)
    .eq("id", dealId)
    .select("id, property_id, client_id")
    .maybeSingle();
  if (error || !data) {
    console.error("Updating deal failed:", error?.message ?? "no row");
    return { ok: false, message: failure(error?.message) };
  }
  refresh(data);
  return { ok: true };
}

export async function setDealStage(dealId: string, stage: string) {
  if (!isOneOf(DEAL_STAGES, stage)) return { ok: false, message: "generic" } as const;
  return update(dealId, { stage });
}

/** Won, with the real commission. A broker's closing waits for a manager (the database handles that). */
export async function closeDeal(dealId: string, commission: number, closedOn: string) {
  if (!Number.isFinite(commission) || commission < 0 || commission > DEAL_LIMITS.amount || !isDay(closedOn)) {
    return { ok: false, message: "generic" } as const;
  }
  return update(dealId, { status: "won", commission, closed_on: closedOn });
}

export async function markDealLost(dealId: string, reason: string) {
  return update(dealId, { status: "lost", lost_reason: reason.trim().slice(0, DEAL_LIMITS.reason) || null });
}

/** Back to "in progress" — also how a manager sends a closing back to the broker. */
export async function reopenDeal(dealId: string) {
  return update(dealId, { status: "open" });
}

export async function confirmDeal(dealId: string) {
  return update(dealId, { confirmed_at: new Date().toISOString() });
}

export async function deleteDeal(dealId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("deals").delete().eq("id", dealId).select("id, property_id, client_id");
  if (error || !data?.length) return { ok: false };
  refresh(data[0]);
  redirect("/deals");
}
