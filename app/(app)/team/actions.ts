"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail } from "@/lib/validation";

export type TeamState = {
  error?: "invalidEmail" | "alreadyMember" | "alreadyInvited" | "forbidden" | "generic";
  success?: boolean;
};

export async function inviteMember(_: TeamState, formData: FormData): Promise<TeamState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = formData.get("role") === "manager" ? "manager" : "broker";
  if (!isValidEmail(email)) return { error: "invalidEmail" };

  const session = await getSession();
  if (!session?.isManager) return { error: "forbidden" };
  // Only the owner brings in other managers.
  if (role === "manager" && session.role !== "owner") return { error: "forbidden" };

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
    role,
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

/** Remove a colleague; their properties move to `reassignTo` in the same transaction. */
export async function removeMember(profileId: string, reassignTo: string) {
  const session = await getSession();
  if (!session?.isManager) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", {
    target_org: session.organizationId,
    target_profile: profileId,
    reassign_to: reassignTo,
  });

  if (error) {
    console.error("Remove member failed:", error.message);
    return { ok: false };
  }

  revalidatePath("/team");
  revalidatePath("/properties");
  return { ok: true };
}

export async function setMemberRole(profileId: string, role: string) {
  const session = await getSession();
  if (session?.role !== "owner") return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", {
    target_org: session.organizationId,
    target_profile: profileId,
    new_role: role,
  });

  if (error) {
    console.error("Set role failed:", error.message);
    return { ok: false };
  }

  revalidatePath("/team");
  return { ok: true };
}

export async function renameOrganization(_: TeamState, formData: FormData): Promise<TeamState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "generic" };

  const session = await getSession();
  if (session?.role !== "owner") return { error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: name.slice(0, 120) })
    .eq("id", session.organizationId);

  if (error) return { error: "generic" };

  revalidatePath("/", "layout");
  return { success: true };
}
