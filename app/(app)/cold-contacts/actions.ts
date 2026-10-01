"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { LEAD_FORM_SOURCES, LEAD_FORM_TYPES } from "@/lib/leads";

/** A folder for a survey or an ad (one Google Form). Managers for anyone, a broker for themselves. */
export async function createLeadForm(input: {
  name: string;
  brokerId: string | null;
  clientType: string;
  source: string;
}): Promise<{ ok: true; id: string; token: string } | { ok: false }> {
  const session = await getSession();
  const name = input.name.trim();
  if (
    !session ||
    name.length < 2 ||
    name.length > 80 ||
    !(LEAD_FORM_TYPES as readonly string[]).includes(input.clientType) ||
    !(LEAD_FORM_SOURCES as readonly string[]).includes(input.source)
  ) {
    return { ok: false };
  }
  // a broker's folder is their own
  const brokerId = session.isManager ? input.brokerId : session.userId;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_forms")
    .insert({
      organization_id: session.organizationId,
      name,
      broker_id: brokerId,
      client_type: input.clientType,
      source: input.source,
      created_by: session.userId,
    })
    .select("id, token")
    .single();
  if (error || !data) {
    console.error("Creating a lead form failed:", error?.message ?? "no row");
    return { ok: false };
  }
  revalidatePath("/cold-contacts");
  return { ok: true, id: data.id, token: data.token };
}

/** The folder stops taking answers; its contacts stay. */
export async function archiveLeadForm(id: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("lead_forms").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("Archiving a lead form failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/cold-contacts");
  return { ok: true };
}
