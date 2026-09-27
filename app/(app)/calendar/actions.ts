"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** A new private calendar address; the old one stops working. */
export async function resetCalendarToken(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_calendar_token");
  if (error) console.error("Resetting the calendar address failed:", error.message);
  revalidatePath("/calendar");
  return { ok: !error };
}
