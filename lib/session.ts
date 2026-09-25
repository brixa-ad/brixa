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
  organizationId: string;
  organizationName: string;
  role: Role;
  /** owner or manager — sees and manages everything in the agency */
  isManager: boolean;
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
    supabase.from("profiles").select("full_name, email, avatar_path").eq("id", user.id).maybeSingle(),
    supabase
      .from("organization_members")
      .select("organization_id, role, organizations(name)")
      .eq("profile_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);

  if (!membership) return null;

  const org = membership.organizations as unknown as { name: string } | null;

  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? "",
    fullName: profile?.full_name ?? null,
    avatarPath: profile?.avatar_path ?? null,
    organizationId: membership.organization_id,
    organizationName: org?.name ?? "",
    role: membership.role as Role,
    isManager: membership.role === "owner" || membership.role === "manager",
  };
});
