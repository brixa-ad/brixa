import "server-only";
import type { SessionContext } from "./session";
import { createClient } from "./supabase/server";

export type FirstStepKey = "logo" | "offices" | "invite" | "property" | "market";
export type FirstStep = { key: FirstStepKey; href: string; done: boolean };

/**
 * The owner's first steps after signing up, each ticked off by what is already in the agency.
 * A broker on their own skips the team steps. Null for anyone but the owner.
 */
export async function getFirstSteps(session: SessionContext, hasLogo: boolean): Promise<FirstStep[] | null> {
  if (!session.isOwner) return null;
  const supabase = await createClient();
  const org = session.organizationId;
  const count = (table: string) =>
    supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org)
      .then(({ count }) => count ?? 0);

  const [offices, teams, invites, members, properties, prices] = await Promise.all([
    count("offices"),
    count("teams"),
    count("organization_invitations"),
    count("organization_members"),
    count("properties"),
    count("market_prices"),
  ]);

  const steps: FirstStep[] = [
    { key: "logo", href: "/settings#agency", done: hasLogo },
    { key: "offices", href: "/team", done: offices + teams > 0 },
    { key: "invite", href: "/team#invite", done: invites > 0 || members > 1 },
    { key: "property", href: "/properties/new", done: properties > 0 },
    { key: "market", href: "/market#prices", done: prices > 0 },
  ];
  return session.kind === "solo" ? steps.filter((s) => s.key !== "offices" && s.key !== "invite") : steps;
}
