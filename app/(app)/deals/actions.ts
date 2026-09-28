"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEAL_LIMITS, isDay, validateDeal, type DealErrors, type DealInput } from "@/lib/deal-validation";
import { CURRENCIES, DEAL_STAGES, isOneOf } from "@/lib/options";
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
    input.clientId
      ? supabase
          .from("clients")
          .select("id")
          .eq("id", input.clientId)
          .not("responsible_broker_id", "is", null)
          .maybeSingle()
      : { data: true as const },
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
    // a double-sided deal has no other agency, and the other way round
    double_sided: input.doubleSided && !input.withPartner,
    buyer_rate: input.doubleSided && !input.withPartner ? input.buyerRate : null,
    partner_agency: input.withPartner ? input.partnerAgency.trim() : null,
    partner_broker: input.withPartner ? input.partnerBroker.trim() || null : null,
    partner_side: input.withPartner ? input.partnerSide : null,
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

/** Schedule a step for a day (and optionally a time) — the reminders run off these. No day = unschedule. */
export async function scheduleDealStep(dealId: string, stage: string, day: string | null, time: string | null) {
  if (
    !isOneOf(DEAL_STAGES, stage) ||
    (day !== null && !isDay(day)) ||
    (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
  ) {
    return { ok: false, message: "generic" } as const;
  }
  return update(dealId, { [`${stage}_on`]: day, [`${stage}_time`]: day ? time : null });
}

export type DealPayments = {
  depositAmount: number | null;
  preliminaryBank: number | null;
  preliminaryCash: number | null;
  notaryBank: number | null;
  notaryCash: number | null;
};

const amountOk = (value: number | null) =>
  value === null || (Number.isFinite(value) && value >= 0 && value <= DEAL_LIMITS.amount);

export async function saveDealPayments(dealId: string, p: DealPayments, referral: DealReferral) {
  if (!Object.values(p).every(amountOk)) return { ok: false, message: "generic" } as const;
  const name = referral.name.trim();
  const percent = referral.percent;
  if (
    name.length > DEAL_LIMITS.name ||
    (percent !== null && !(Number.isFinite(percent) && percent >= 0 && percent <= 100)) ||
    (referral.paidOn !== null && !isDay(referral.paidOn))
  ) {
    return { ok: false, message: "generic" } as const;
  }
  const none = !name && !percent;
  return update(dealId, {
    deposit_amount: p.depositAmount,
    preliminary_bank: p.preliminaryBank,
    preliminary_cash: p.preliminaryCash,
    notary_bank: p.notaryBank,
    notary_cash: p.notaryCash,
    referral_name: none ? null : name || null,
    referral_percent: none ? null : percent,
    referral_paid_on: none ? null : referral.paidOn,
  });
}

export type DealReferral = { name: string; percent: number | null; paidOn: string | null };

export type OfferInput = {
  amount: number;
  currency: string;
  offeredBy: string;
  agency: string;
  offeredOn: string;
  note: string;
  /** "стоп капаро", euro */
  holdDeposit: number | null;
};

function offerOk(input: OfferInput) {
  const offeredBy = input.offeredBy.trim();
  return (
    amountOk(input.amount) &&
    input.amount !== null &&
    amountOk(input.holdDeposit) &&
    isOneOf(CURRENCIES, input.currency) &&
    Boolean(offeredBy) &&
    offeredBy.length <= DEAL_LIMITS.name &&
    input.agency.trim().length <= DEAL_LIMITS.name &&
    isDay(input.offeredOn) &&
    input.note.length <= 1000
  );
}

const offerRow = (input: OfferInput) => ({
  amount: input.amount,
  currency: input.currency,
  offered_by: input.offeredBy.trim(),
  agency: input.agency.trim() || null,
  offered_on: input.offeredOn,
  note: input.note.trim() || null,
  hold_deposit: input.holdDeposit,
});

/** Correct an offer — amount, who, when, the stop deposit (an accepted one updates the agreed price). */
export async function updateOffer(offerId: string, input: OfferInput): Promise<DealActionResult> {
  if (!offerOk(input)) return { ok: false, message: "generic" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal_offers")
    .update(offerRow(input))
    .eq("id", offerId)
    .select("deal_id, status, amount, currency")
    .maybeSingle();
  if (error || !data) {
    console.error("Updating offer failed:", error?.message ?? "no row");
    return { ok: false, message: "generic" };
  }
  if (data.status === "accepted") return update(data.deal_id, { price: data.amount, currency: data.currency });
  refresh({ id: data.deal_id, property_id: null, client_id: null });
  return { ok: true };
}

export async function addOffer(dealId: string, input: OfferInput): Promise<DealActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "generic" };
  if (!offerOk(input)) return { ok: false, message: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.from("deal_offers").insert({
    ...offerRow(input),
    deal_id: dealId,
    created_by: session.userId,
  });
  if (error) {
    console.error("Adding offer failed:", error.message);
    return { ok: false, message: "generic" };
  }
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

/** Accepting an offer makes its amount the deal's agreed price. */
export async function setOfferStatus(offerId: string, status: "open" | "accepted" | "rejected"): Promise<DealActionResult> {
  if (!["open", "accepted", "rejected"].includes(status)) return { ok: false, message: "generic" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal_offers")
    .update({ status })
    .eq("id", offerId)
    .select("deal_id, amount, currency")
    .maybeSingle();
  if (error || !data) {
    console.error("Updating offer failed:", error?.message ?? "no row");
    return { ok: false, message: "generic" };
  }
  if (status === "accepted") return update(data.deal_id, { price: data.amount, currency: data.currency });
  revalidatePath(`/deals/${data.deal_id}`);
  return { ok: true };
}

export async function deleteOffer(offerId: string): Promise<DealActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("deal_offers").delete().eq("id", offerId).select("deal_id");
  if (error || !data?.length) return { ok: false, message: "generic" };
  revalidatePath(`/deals/${data[0].deal_id}`);
  return { ok: true };
}
