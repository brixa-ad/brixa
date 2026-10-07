"use server";

import { revalidatePath } from "next/cache";
import { teamLedBy } from "@/lib/hierarchy";
import { getHierarchy } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";
import { isValidEmail } from "@/lib/validation";

export type TeamState = {
  error?: "invalidEmail" | "alreadyMember" | "alreadyInvited" | "forbidden" | "noOfficeYet" | "generic";
  success?: boolean;
};

const idOrNull = (value: FormDataEntryValue | null) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

/**
 * Invite a colleague by email, into an office and a team. The owner anyone anywhere; an office
 * manager managers and brokers into their office; a team manager brokers into their team.
 */
export async function inviteMember(_: TeamState, formData: FormData): Promise<TeamState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 120) || null;
  const asked = formData.get("role");
  const role: Role = asked === "office_manager" || asked === "manager" ? asked : "broker";
  if (!isValidEmail(email)) return { error: "invalidEmail" };

  const session = await getSession();
  if (!session?.isManager) return { error: "forbidden" };

  const supabase = await createClient();
  const { offices, teams } = await getHierarchy(supabase, session.organizationId);
  let officeId = idOrNull(formData.get("office_id"));
  let teamId = idOrNull(formData.get("team_id"));

  if (session.role === "office_manager") {
    if (role === "office_manager") return { error: "forbidden" };
    if (!session.officeId) return { error: "noOfficeYet" };
    officeId = session.officeId;
  } else if (session.role === "manager") {
    if (role !== "broker") return { error: "forbidden" };
    const mine = teamLedBy(session.userId, teams);
    teamId = mine?.id ?? null;
    officeId = mine?.office_id ?? session.officeId;
  }
  // an office manager leads a whole office, not a team
  if (role === "office_manager") teamId = null;
  const team = teamId ? teams.find((t) => t.id === teamId) : null;
  if (teamId && !team) return { error: "generic" };
  // the team's office goes with the team
  if (team?.office_id) officeId = team.office_id;
  if (officeId && !offices.some((o) => o.id === officeId)) return { error: "generic" };

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
    full_name: fullName,
    office_id: officeId,
    team_id: teamId,
    invited_by: session.userId,
  });

  if (error) {
    // 23505 = unique violation on the pending-invitation index
    if (error.code !== "23505") console.error("Invitation failed:", error.message);
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

/** The owner gives any role (but the owner's); an office manager makes managers and brokers in their office. */
export async function setMemberRole(profileId: string, role: string) {
  const session = await getSession();
  if (!session?.isLeader) return { ok: false };

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

/** Put someone into an office and a team (the team's office wins). */
export async function moveMember(profileId: string, officeId: string | null, teamId: string | null) {
  const session = await getSession();
  if (!session?.isLeader) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_member", {
    target_org: session.organizationId,
    target_profile: profileId,
    new_office: officeId || null,
    new_team: teamId || null,
  });

  if (error) {
    console.error("Moving a member failed:", error.message);
    return { ok: false };
  }

  revalidatePath("/team");
  return { ok: true };
}

export type OfficeInput = { id: string | null; name: string; city: string; address: string; phone: string };

/** The owner opens or changes an office. */
export async function saveOffice(input: OfficeInput): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isOwner) return { ok: false };
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false };
  const text = (value: string, max: number) => String(value ?? "").trim().slice(0, max) || null;
  const row = { name, city: text(input.city, 80), address: text(input.address, 200), phone: text(input.phone, 40) };

  const supabase = await createClient();
  const { error } = input.id
    ? await supabase.from("offices").update(row).eq("id", input.id).eq("organization_id", session.organizationId)
    : await supabase.from("offices").insert({ ...row, organization_id: session.organizationId });
  if (error) {
    console.error("Saving an office failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/team");
  return { ok: true };
}

/** The owner closes an office: its people and teams stay, without an office. */
export async function deleteOffice(id: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isOwner) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("offices").delete().eq("id", id).eq("organization_id", session.organizationId);
  if (error) console.error("Deleting an office failed:", error.message);
  revalidatePath("/team");
  return { ok: !error };
}

export type TeamInput = { id: string | null; officeId: string | null; name: string; managerId: string | null };

/**
 * The owner (anywhere) or an office manager (in their office) makes or changes a team. A broker
 * chosen to lead it becomes a team manager and joins it; moving the team moves its people.
 */
export async function saveTeam(input: TeamInput): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isLeader) return { ok: false };
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 80) return { ok: false };
  const officeId = session.isOwner ? input.officeId || null : session.officeId;
  if (!session.isOwner && !officeId) return { ok: false };

  const supabase = await createClient();
  const org = session.organizationId;
  let teamId = input.id;
  let before: { office_id: string | null; manager_id: string | null } | null = null;

  if (teamId) {
    const { data } = await supabase.from("teams").select("office_id, manager_id").eq("id", teamId).eq("organization_id", org).maybeSingle();
    before = data;
    if (!before) return { ok: false };
    const { error } = await supabase.from("teams").update({ name, office_id: officeId }).eq("id", teamId);
    if (error) {
      console.error("Saving a team failed:", error.message);
      return { ok: false };
    }
    // a team moved to another office takes its people along
    if (before.office_id !== officeId) {
      const { data: people } = await supabase.from("organization_members").select("profile_id").eq("organization_id", org).eq("team_id", teamId);
      for (const person of people ?? []) {
        await supabase.rpc("assign_member", { target_org: org, target_profile: person.profile_id, new_office: officeId, new_team: teamId });
      }
    }
  } else {
    const { data, error } = await supabase.from("teams").insert({ organization_id: org, office_id: officeId, name }).select("id").single();
    if (error || !data) {
      console.error("Creating a team failed:", error?.message);
      return { ok: false };
    }
    teamId = data.id as string;
  }

  const managerId = input.managerId || null;
  if (managerId !== (before?.manager_id ?? null)) {
    if (managerId) {
      const { data: person } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", org)
        .eq("profile_id", managerId)
        .maybeSingle();
      if (!person || (person.role !== "broker" && person.role !== "manager")) return { ok: false };
      const failed = (error: { message: string } | null) => {
        if (error) console.error("Setting a team's manager failed:", error.message);
        return Boolean(error);
      };
      if (person.role === "broker") {
        const { error } = await supabase.rpc("set_member_role", { target_org: org, target_profile: managerId, new_role: "manager" });
        if (failed(error)) return { ok: false };
      }
      const { error: moved } = await supabase.rpc("assign_member", {
        target_org: org,
        target_profile: managerId,
        new_office: officeId,
        new_team: teamId,
      });
      if (failed(moved)) return { ok: false };
      const { error: led } = await supabase.from("teams").update({ manager_id: managerId }).eq("id", teamId);
      if (failed(led)) return { ok: false };
    } else {
      const { error } = await supabase.from("teams").update({ manager_id: null }).eq("id", teamId);
      if (error) return { ok: false };
    }
  }

  revalidatePath("/team");
  return { ok: true };
}

/** Its people stay in the office, without a team. */
export async function deleteTeam(id: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isLeader) return { ok: false };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("teams")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("organization_id", session.organizationId);
  if (error) console.error("Deleting a team failed:", error.message);
  revalidatePath("/team");
  return { ok: !error && count === 1 };
}

export async function renameOrganization(_: TeamState, formData: FormData): Promise<TeamState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "generic" };

  const session = await getSession();
  if (!session?.isOwner) return { error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: name.slice(0, 120) })
    .eq("id", session.organizationId);

  if (error) return { error: "generic" };

  revalidatePath("/", "layout");
  return { success: true };
}

export type GoalRow = {
  profileId: string;
  dailyCalls: number;
  dailyViewings: number;
  dailyListings: number;
  monthlyTarget: number;
  yearlyTarget: number;
  /** what the broker wins for hitting the target */
  monthlyBonus: string;
  yearlyBonus: string;
};

const whole = (value: number, max: number) => Number.isInteger(value) && value >= 0 && value <= max;

/** Managers set each colleague's daily goals and commission targets. */
export async function saveGoals(rows: GoalRow[]): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isManager) return { ok: false };
  const valid = rows.every(
    (r) =>
      typeof r.profileId === "string" &&
      whole(r.dailyCalls, 500) &&
      whole(r.dailyViewings, 100) &&
      whole(r.dailyListings, 100) &&
      Number.isFinite(r.monthlyTarget) &&
      r.monthlyTarget >= 0 &&
      r.monthlyTarget <= 100_000_000 &&
      Number.isFinite(r.yearlyTarget) &&
      r.yearlyTarget >= 0 &&
      r.yearlyTarget <= 100_000_000 &&
      typeof r.monthlyBonus === "string" &&
      r.monthlyBonus.length <= 200 &&
      typeof r.yearlyBonus === "string" &&
      r.yearlyBonus.length <= 200
  );
  if (!valid || rows.length === 0) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("broker_goals").upsert(
    rows.map((r) => ({
      organization_id: session.organizationId,
      profile_id: r.profileId,
      daily_calls: r.dailyCalls,
      daily_viewings: r.dailyViewings,
      daily_listings: r.dailyListings,
      monthly_target: r.monthlyTarget,
      yearly_target: r.yearlyTarget,
      monthly_bonus: r.monthlyBonus.trim() || null,
      yearly_bonus: r.yearlyBonus.trim() || null,
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "organization_id,profile_id" }
  );
  if (error) {
    console.error("Saving goals failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/");
  revalidatePath("/team/goals");
  return { ok: true };
}

export type GroupGoalRow = { scope: "agency" | "office" | "team"; scopeId: string | null; target: number | null };

/** A leader sets the month's commission goals of the agency, offices or teams they may (an empty one is removed). */
export async function saveGroupGoals(month: string, rows: GroupGoalRow[]): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isManager || !/^\d{4}-\d{2}-01$/.test(month) || !Array.isArray(rows) || rows.length > 200) return { ok: false };
  const supabase = await createClient();
  let ok = true;
  for (const row of rows) {
    if (!["agency", "office", "team"].includes(row.scope) || (row.scope === "agency") !== (row.scopeId === null)) return { ok: false };
    if (row.target !== null && !(Number.isFinite(row.target) && row.target > 0 && row.target < 1_000_000_000)) return { ok: false };
    // the one goal of this scope and month
    const find = () => {
      const q = supabase
        .from("group_goals")
        .select("id")
        .eq("organization_id", session.organizationId)
        .eq("scope", row.scope)
        .eq("month", month);
      return row.scopeId === null ? q.is("scope_id", null) : q.eq("scope_id", row.scopeId);
    };
    const { data: existing } = await find().maybeSingle();
    if (row.target === null) {
      if (existing) {
        const { error } = await supabase.from("group_goals").delete().eq("id", existing.id);
        if (error) ok = false;
      }
      continue;
    }
    const { error } = existing
      ? await supabase.from("group_goals").update({ target: row.target, updated_by: session.userId, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : await supabase.from("group_goals").insert({
          organization_id: session.organizationId,
          scope: row.scope,
          scope_id: row.scopeId,
          month,
          target: row.target,
        });
    if (error) {
      console.error("Saving a group goal failed:", error.message);
      ok = false;
    }
  }
  revalidatePath("/team/goals");
  revalidatePath("/");
  return { ok };
}

export type HandOverPart = "clients" | "properties" | "deals" | "tasks";

/** A leader hands a broker's work (the parts chosen) to themself or to someone they lead. */
export async function handOverWork(
  fromProfile: string,
  toProfile: string,
  what: HandOverPart[]
): Promise<{ ok: boolean; counts?: Record<HandOverPart, number> }> {
  const session = await getSession();
  const parts = (what ?? []).filter((w): w is HandOverPart => ["clients", "properties", "deals", "tasks"].includes(w));
  if (!session?.isManager || parts.length === 0 || !fromProfile || !toProfile || fromProfile === toProfile) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hand_over_work", {
    target_org: session.organizationId,
    from_profile: fromProfile,
    to_profile: toProfile,
    what: parts,
  });
  if (error) {
    console.error("Handing over failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/team");
  revalidatePath("/clients");
  revalidatePath("/properties");
  return { ok: true, counts: data as Record<HandOverPart, number> };
}
