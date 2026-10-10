"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/app/(app)/tasks/actions";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

function refresh(clientId?: string) {
  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath("/follow-up");
  revalidatePath("/clients");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

/** A piece of market news: sent (into the client's history, as a message) or left out. */
export async function settleNews(id: string, sent: boolean, note: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("settle_client_news", { target: id, sent });
  if (error) console.error("Settling the news failed:", error.message);
  if (data !== true) return { ok: false };
  if (sent) {
    const { data: row } = await supabase.from("client_news").select("client_id").eq("id", id).maybeSingle();
    if (row) await logActivity({ type: "message", clientId: row.client_id, propertyId: null, note });
  }
  return { ok: true };
}

/** Take a free contact — the first broker to press wins. */
export async function claimClient(clientId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_client", { target: clientId });
  if (error) console.error("Taking a free contact failed:", error.message);
  refresh(clientId);
  return { ok: data === true };
}

/** Managers: hand a client to a colleague, or back to the free contacts. */
export async function assignClient(clientId: string, brokerId: string | "free"): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isManager) return { ok: false };
  const supabase = await createClient();
  if (brokerId !== "free") {
    const { data: member } = await supabase
      .from("organization_members")
      .select("profile_id")
      .eq("organization_id", session.organizationId)
      .eq("profile_id", brokerId)
      .maybeSingle();
    if (!member) return { ok: false };
  }
  const { error } = await supabase
    .from("clients")
    .update({ responsible_broker_id: brokerId === "free" ? null : brokerId })
    .eq("id", clientId);
  if (error) console.error("Handing over a client failed:", error.message);
  refresh(clientId);
  return { ok: !error };
}

export type FollowUpRules = { firstHours: number; daysA: number; daysB: number; daysC: number; releaseDays: number };

export async function saveFollowUpRules(rules: FollowUpRules): Promise<{ ok: boolean }> {
  const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (
    !whole(rules.firstHours, 1, 720) ||
    !whole(rules.daysA, 1, 365) ||
    !whole(rules.daysB, 1, 365) ||
    !whole(rules.daysC, 1, 365) ||
    !whole(rules.releaseDays, 0, 365)
  ) {
    return { ok: false };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_follow_up_rules", {
    first_hours: rules.firstHours,
    days_a: rules.daysA,
    days_b: rules.daysB,
    days_c: rules.daysC,
    release_days: rules.releaseDays,
  });
  if (error) console.error("Saving follow-up rules failed:", error.message);
  refresh();
  revalidatePath("/settings");
  return { ok: !error };
}
