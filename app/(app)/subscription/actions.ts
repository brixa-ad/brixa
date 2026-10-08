"use server";

import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** The agency's owner asks for a package: BRIXA hears and gets in touch about the payment. */
export async function requestPlan(code: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isOwner) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_plan", { wanted: code });
  if (error) console.error("Plan request failed:", error.message);
  return { ok: !error };
}
