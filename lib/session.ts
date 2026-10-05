import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Role } from "./types";

export type SessionContext = {
  userId: string;
  email: string;
  fullName: string | null;
  avatarPath: string | null;
  /** the phone bottom bar as saved in Settings (null = default) */
  bottomNav: string[] | null;
  organizationId: string;
  organizationName: string;
  role: Role;
  /** a leader of any kind (owner, office manager, team manager): sees and manages their people */
  isManager: boolean;
  /** the owner (управител): the whole agency and its settings */
  isOwner: boolean;
  /** the owner or an office manager: the market, the marketing plan, offices and teams */
  isLeader: boolean;
  officeId: string | null;
  teamId: string | null;
  /** signed up as an agency or as a broker on their own */
  kind: "agency" | "solo";
  /** a broker on their own, still alone: no team parts */
  solo: boolean;
};

/**
 * The signed-in user plus their agency. Cached per request.
 * Redirects to /login when signed out. Returns null when the user has no agency.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, avatar_path, bottom_nav").eq("id", user.id).maybeSingle(),
    supabase
      .from("organization_members")
      .select("organization_id, role, office_id, team_id, organizations(name, kind)")
      .eq("profile_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);

  if (!membership) return null;

  const org = membership.organizations as unknown as { name: string; kind: "agency" | "solo" } | null;
  const { count: members } = await supabase
    .from("organization_members")
    .select("profile_id", { count: "exact", head: true })
    .eq("organization_id", membership.organization_id);

  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? "",
    fullName: profile?.full_name ?? null,
    avatarPath: profile?.avatar_path ?? null,
    bottomNav: profile?.bottom_nav ?? null,
    organizationId: membership.organization_id,
    organizationName: org?.name ?? "",
    role: membership.role as Role,
    isManager: membership.role !== "broker",
    isOwner: membership.role === "owner",
    isLeader: membership.role === "owner" || membership.role === "office_manager",
    officeId: membership.office_id ?? null,
    teamId: membership.team_id ?? null,
    kind: org?.kind ?? "agency",
    solo: org?.kind === "solo" && (members ?? 0) <= 1,
  };
});
