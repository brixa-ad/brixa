"use server";

import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** A link to the client's search for colleagues: criteria and broker only, never the client. */
export async function createSearchShare(
  clientId: string,
  comment: string
): Promise<{ ok: true; token: string } | { ok: false }> {
  const session = await getSession();
  if (!session || comment.length > 1000) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("search_shares")
    .insert({
      client_id: clientId,
      organization_id: session.organizationId,
      created_by: session.userId,
      comment: comment.trim() || null,
    })
    .select("token")
    .single();
  if (error || !data) {
    console.error("Sharing a search failed:", error?.message ?? "no row");
    return { ok: false };
  }
  return { ok: true, token: data.token };
}
