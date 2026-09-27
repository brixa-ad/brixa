import "server-only";
import { createClient } from "./supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lists and records opened from a colleague's profile carry ?broker= / ?from=<their id>;
 * this is the "← back to their profile" link for them (null when not a colleague).
 */
export async function memberBack(memberId: unknown, organizationId: string) {
  if (typeof memberId !== "string" || !UUID.test(memberId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("profiles(full_name, email)")
    .eq("organization_id", organizationId)
    .eq("profile_id", memberId)
    .maybeSingle();
  const profile = data?.profiles as unknown as { full_name: string | null; email: string } | null;
  if (!profile) return null;
  return { id: memberId, href: `/team/${memberId}`, label: profile.full_name || profile.email };
}

/** "?from=<id>" to add to links inside a colleague's list. */
export const fromQuery = (back: { id: string } | null) => (back ? `?from=${back.id}` : "");
