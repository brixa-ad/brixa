"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** The owner fills BRIXA with made-up listings, clients, deals and tasks to look around with. */
export async function loadSampleData(): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isOwner) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("load_sample_data");
  if (error) console.error("Loading the samples failed:", error.message);
  revalidatePath("/", "layout");
  return { ok: !error };
}

/** …and takes them all away; the agency's real data stays. */
export async function removeSampleData(): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isOwner) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_sample_data");
  if (error) console.error("Removing the samples failed:", error.message);
  revalidatePath("/", "layout");
  return { ok: !error };
}
