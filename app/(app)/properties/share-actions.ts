"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** A private link to a listing's public page, optionally for one client (noted in their history). */
export async function createShare(
  propertyId: string,
  clientId: string | null
): Promise<{ ok: true; token: string } | { ok: false }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("property_shares")
    .insert({
      property_id: propertyId,
      organization_id: session.organizationId,
      client_id: clientId,
      created_by: session.userId,
    })
    .select("token, property:properties(title)")
    .single();
  if (error || !data) {
    console.error("Sharing a listing failed:", error?.message ?? "no row");
    return { ok: false };
  }

  if (clientId) {
    const title = (data.property as unknown as { title: string } | null)?.title ?? "";
    await supabase.from("activities").insert({
      organization_id: session.organizationId,
      profile_id: session.userId,
      type: "message",
      client_id: clientId,
      property_id: propertyId,
      note: `🔗 ${title}`,
    });
    revalidatePath(`/clients/${clientId}`);
  }
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true, token: data.token };
}

export async function stopShare(shareId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId)
    .select("property_id, client_id")
    .maybeSingle();
  if (error || !data) return { ok: false };
  revalidatePath(`/properties/${data.property_id}`);
  if (data.client_id) revalidatePath(`/clients/${data.client_id}`);
  return { ok: true };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The owner's report for a period, as a private link (noted in the owner's history). */
export async function createOwnerReport(
  propertyId: string,
  input: { from: string; to: string; comment: string }
): Promise<{ ok: true; token: string } | { ok: false }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const comment = input.comment.trim().slice(0, 2000) || null;
  if (!DAY.test(input.from) || !DAY.test(input.to) || input.from > input.to) return { ok: false };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("owner_reports")
    .insert({
      property_id: propertyId,
      organization_id: session.organizationId,
      created_by: session.userId,
      period_start: input.from,
      period_end: input.to,
      comment,
    })
    .select("token, property:properties(title, owner_client_id)")
    .single();
  if (error || !data) {
    console.error("Creating an owner report failed:", error?.message ?? "no row");
    return { ok: false };
  }

  const property = data.property as unknown as { title: string; owner_client_id: string | null } | null;
  if (property?.owner_client_id) {
    await supabase.from("activities").insert({
      organization_id: session.organizationId,
      profile_id: session.userId,
      type: "message",
      client_id: property.owner_client_id,
      property_id: propertyId,
      note: `📊 ${property.title}`,
    });
    revalidatePath(`/clients/${property.owner_client_id}`);
  }
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true, token: data.token };
}

export async function stopOwnerReport(reportId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("owner_reports")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", reportId)
    .select("property_id")
    .maybeSingle();
  if (error || !data) return { ok: false };
  revalidatePath(`/properties/${data.property_id}`);
  return { ok: true };
}

/** A link to the listing's market analysis for its owner or a buyer (noted in the client's history). */
export async function createAnalysisShare(
  propertyId: string,
  audience: "owner" | "buyer",
  clientId: string | null
): Promise<{ ok: true; token: string } | { ok: false }> {
  const session = await getSession();
  if (!session || (audience !== "owner" && audience !== "buyer")) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analysis_shares")
    .insert({
      organization_id: session.organizationId,
      property_id: propertyId,
      audience,
      client_id: clientId,
      created_by: session.userId,
    })
    .select("token, property:properties(title)")
    .single();
  if (error || !data) {
    console.error("Sending an analysis failed:", error?.message ?? "no row");
    return { ok: false };
  }
  if (clientId) {
    const title = (data.property as unknown as { title: string } | null)?.title ?? "";
    await supabase.from("activities").insert({
      organization_id: session.organizationId,
      profile_id: session.userId,
      type: "message",
      client_id: clientId,
      property_id: propertyId,
      note: `📊 ${title}`,
    });
    revalidatePath(`/clients/${clientId}`);
  }
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true, token: data.token };
}

export async function stopAnalysisShare(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analysis_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select("property_id")
    .maybeSingle();
  if (error || !data) return { ok: false };
  revalidatePath(`/properties/${data.property_id}`);
  return { ok: true };
}
