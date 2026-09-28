"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasOffer, isOffering, isSeeking, validateClient, type ClientErrors, type ClientInput } from "@/lib/client-validation";
import { CLIENT_STAGES, isOneOf } from "@/lib/options";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type ClientSaveResult =
  | { ok: true; id: string }
  | { ok: false; errors?: ClientErrors; duplicateOf?: string; message?: "generic" | "noOrg" | "notFound" };

const uniq = (ids: string[]) => [...new Set(ids.filter(Boolean))];

const hasReferrer = (source: string | null) => source === "referral";

async function prepare(input: ClientInput, clientId: string | null) {
  const session = await getSession();
  if (!session) return { ok: false as const, message: "noOrg" as const };

  const errors = validateClient(input);
  // Brokers own the clients they add; managers can assign any colleague.
  if (!session.isManager && input.brokerId && input.brokerId !== session.userId) {
    errors.brokerId = "invalid";
  }
  if (Object.keys(errors).length > 0) return { ok: false as const, errors };

  const supabase = await createClient();

  const free = session.isManager && input.brokerId === "free";
  if (session.isManager && !free && input.brokerId && input.brokerId !== session.userId) {
    const { data: member } = await supabase
      .from("organization_members")
      .select("profile_id")
      .eq("organization_id", session.organizationId)
      .eq("profile_id", input.brokerId)
      .maybeSingle();
    if (!member) return { ok: false as const, errors: { brokerId: "invalid" } as ClientErrors };
  }

  if (input.phone.trim()) {
    const { data: owner } = await supabase.rpc("client_phone_owner", {
      target_org: session.organizationId,
      raw_phone: input.phone,
      exclude_client: clientId,
    });
    if (owner) return { ok: false as const, duplicateOf: owner as string };
  }

  const row = {
    full_name: input.fullName.trim(),
    phone: input.phone.trim() || null,
    email: input.email.trim() || null,
    types: uniq(input.types),
    client_class: input.clientClass,
    source: input.source,
    referrer: hasReferrer(input.source) ? input.referrer.trim() || null : null,
    stage: input.stage,
    notes: input.notes.trim() || null,
    responsible_broker_id: free ? null : session.isManager ? (input.brokerId ?? session.userId) : session.userId,
  };

  const s = input.search;
  const searchRow = isSeeking(input.types)
    ? {
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
      }
    : null;

  // what a seller / landlord has — even without a listing
  const o = input.offer;
  const offerRow =
    isOffering(input.types) && hasOffer(o)
      ? {
          operation: o.operation,
          subtype_id: o.subtypeId,
          settlement_id: o.settlementId,
          neighborhood_id: o.settlementId ? o.neighborhoodId : null,
          area: o.area,
          rooms: o.rooms,
          price: o.price,
          currency: o.currency,
        }
      : null;

  return { ok: true as const, session, supabase, row, searchRow, offerRow };
}

async function saveSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  searchRow: Record<string, unknown> | null
) {
  if (searchRow) {
    const { error } = await supabase.from("client_searches").upsert({ client_id: clientId, ...searchRow });
    if (error) console.error("Saving search failed:", error.message);
  } else {
    await supabase.from("client_searches").delete().eq("client_id", clientId);
  }
}

async function saveOffer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  offerRow: Record<string, unknown> | null
) {
  if (offerRow) {
    const { error } = await supabase.from("client_offers").upsert({ client_id: clientId, ...offerRow });
    if (error) console.error("Saving offer failed:", error.message);
  } else {
    await supabase.from("client_offers").delete().eq("client_id", clientId);
  }
}

async function duplicateFromError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  phone: string
) {
  // Unique-index race: someone saved the same phone a moment earlier.
  const { data } = await supabase.rpc("client_phone_owner", { target_org: organizationId, raw_phone: phone });
  return (data as string | null) ?? "—";
}

export async function createClientRecord(input: ClientInput): Promise<ClientSaveResult> {
  const prepared = await prepare(input, null);
  if (!prepared.ok) return prepared;
  const { session, supabase, row, searchRow, offerRow } = prepared;

  const { data, error } = await supabase
    .from("clients")
    .insert({ ...row, organization_id: session.organizationId, created_by: session.userId })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, duplicateOf: await duplicateFromError(supabase, session.organizationId, input.phone) };
    }
    console.error("Create client failed:", error?.message);
    return { ok: false, message: "generic" };
  }

  await Promise.all([saveSearch(supabase, data.id, searchRow), saveOffer(supabase, data.id, offerRow)]);
  revalidatePath("/clients");
  return { ok: true, id: data.id };
}

export async function updateClientRecord(id: string, input: ClientInput): Promise<ClientSaveResult> {
  const prepared = await prepare(input, id);
  if (!prepared.ok) return prepared;
  const { session, supabase, row, searchRow, offerRow } = prepared;

  const { data, error } = await supabase.from("clients").update(row).eq("id", id).select("id").maybeSingle();

  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, duplicateOf: await duplicateFromError(supabase, session.organizationId, input.phone) };
    }
    console.error("Update client failed:", error?.message ?? "no row");
    return { ok: false, message: error ? "generic" : "notFound" };
  }

  await Promise.all([saveSearch(supabase, id, searchRow), saveOffer(supabase, id, offerRow)]);
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true, id };
}

export async function setClientStage(id: string, stage: string) {
  if (!isOneOf(CLIENT_STAGES, stage)) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.from("clients").update({ stage }).eq("id", id).select("id");
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: !error && Boolean(data?.length) };
}

export async function deleteClientRecord(id: string) {
  const session = await getSession();
  if (!session?.isManager) return { ok: false };

  const supabase = await createClient();
  const { data, error } = await supabase.from("clients").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false };

  revalidatePath("/clients");
  redirect("/clients");
}
