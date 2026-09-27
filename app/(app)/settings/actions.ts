"use server";

import { revalidatePath } from "next/cache";
import { BOTTOM_NAV_MAX, navKeysFor } from "@/lib/nav";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Save the phone's bottom bar (null = back to the default). */
export async function saveBottomNav(keys: string[] | null): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };

  if (keys !== null) {
    const allowed = navKeysFor(session.isManager) as string[];
    const unique = [...new Set(keys)];
    if (unique.length === 0 || unique.length > BOTTOM_NAV_MAX || !unique.every((key) => allowed.includes(key))) {
      return { ok: false };
    }
    keys = unique;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ bottom_nav: keys }).eq("id", session.userId);
  if (error) {
    console.error("Saving the bottom bar failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
