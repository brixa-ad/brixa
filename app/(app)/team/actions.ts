"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail } from "@/lib/validation";

export type TeamState = {
  error?: "invalidEmail" | "alreadyMember" | "alreadyInvited" | "onlyOwner" | "generic";
  success?: boolean;
};

export async function inviteMember(_: TeamState, formData: FormData): Promise<TeamState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return { error: "invalidEmail" };

  const session = await getSession();
  if (!session || session.role !== "owner") return { error: "onlyOwner" };

  const supabase = await createClient();

  const { data: members } = await supabase
    .from("organization_members")
    .select("profiles(email)")
    .eq("organization_id", session.organizationId);

  const alreadyMember = (members ?? []).some(
    (m) => (m.profiles as unknown as { email: string } | null)?.email.toLowerCase() === email
  );
  if (alreadyMember) return { error: "alreadyMember" };

  const { error } = await supabase.from("organization_invitations").insert({
    organization_id: session.organizationId,
    email,
    invited_by: session.userId,
  });

  if (error) {
    // 23505 = unique violation on the pending-invitation index
    return { error: error.code === "23505" ? "alreadyInvited" : "generic" };
  }

  revalidatePath("/team");
  return { success: true };
}

export async function revokeInvitation(id: string) {
  const supabase = await createClient();
  await supabase.from("organization_invitations").delete().eq("id", id);
  revalidatePath("/team");
}

export async function removeMember(profileId: string) {
  const session = await getSession();
  if (!session || session.role !== "owner") return;

  const supabase = await createClient();
  await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", session.organizationId)
    .eq("profile_id", profileId);

  revalidatePath("/team");
}

export async function renameOrganization(_: TeamState, formData: FormData): Promise<TeamState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "generic" };

  const session = await getSession();
  if (!session || session.role !== "owner") return { error: "onlyOwner" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: name.slice(0, 120) })
    .eq("id", session.organizationId);

  if (error) return { error: "generic" };

  revalidatePath("/", "layout");
  return { success: true };
}
