"use server";

import { revalidatePath } from "next/cache";
import { validateProfile, type ProfileErrors, type ProfileInput } from "@/lib/profile";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(
  input: ProfileInput
): Promise<{ ok: true } | { ok: false; errors?: ProfileErrors }> {
  const errors = validateProfile(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const session = await getSession();
  if (!session) return { ok: false };

  const areas = [...new Set(input.areas.map((area) => area.trim()).filter(Boolean))];

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName.trim(),
      phone: input.phone.trim() || null,
      job_title: input.jobTitle.trim() || null,
      bio: input.bio.trim() || null,
      areas,
    })
    .eq("id", session.userId);

  if (error) {
    console.error("Update profile failed:", error.message);
    return { ok: false };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
