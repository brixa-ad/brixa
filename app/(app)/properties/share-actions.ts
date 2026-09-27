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
