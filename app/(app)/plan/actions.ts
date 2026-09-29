"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Save my own goal for the year and why it matters (null goal = follow the manager's target). */
export async function savePlan(goal: number | null, why: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  if (goal !== null && (!Number.isFinite(goal) || goal < 0 || goal > 100_000_000)) return { ok: false };
  const bigWhy = String(why ?? "").trim();
  if (bigWhy.length > 500) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("broker_plans").upsert(
    {
      profile_id: session.userId,
      organization_id: session.organizationId,
      yearly_goal: goal === null ? null : Math.round(goal),
      big_why: bigWhy || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" }
  );
  if (error) {
    console.error("Saving the plan failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/plan");
  revalidatePath("/");
  return { ok: true };
}
