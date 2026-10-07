import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getI18n } from "@/lib/i18n/server";
import { getHierarchy, getMyPeople } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { GoalRow } from "../actions";
import { GoalsForm } from "./GoalsForm";
import { Card } from "@/components/ui/form";
import { sofiaToday } from "@/lib/dates";
import { teamLedBy } from "@/lib/hierarchy";
import { GroupGoalsForm } from "./GroupGoalsForm";


export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.goals.title };
}

export default async function GoalsPage() {
  const session = (await getSession())!;
  if (!session.isManager) redirect("/team");

  const supabase = await createClient();
  const month = `${sofiaToday().slice(0, 7)}-01`;
  const [{ t, lang }, members, { data }, { offices, teams }, { data: goalRows }, { data: progressRows }] = await Promise.all([
    getI18n(),
    getMyPeople(supabase),
    supabase.from("broker_goals").select("*").eq("organization_id", session.organizationId),
    getHierarchy(supabase, session.organizationId),
    supabase.from("group_goals").select("scope, scope_id, target").eq("organization_id", session.organizationId).eq("month", month),
    supabase.rpc("group_goal_progress", { target_org: session.organizationId, goal_month: month }),
  ]);

  // the goals this leader may set: the owner all; an office manager their office and its teams; a team manager their team
  const myTeam = teamLedBy(session.userId, teams);
  const scopes: { scope: "agency" | "office" | "team"; scopeId: string | null; name: string }[] = session.isOwner
    ? [
        { scope: "agency", scopeId: null, name: session.organizationName },
        ...offices.map((o) => ({ scope: "office" as const, scopeId: o.id, name: o.name })),
        ...teams.map((tm) => ({ scope: "team" as const, scopeId: tm.id, name: tm.name })),
      ]
    : session.role === "office_manager" && session.officeId
      ? [
          ...offices.filter((o) => o.id === session.officeId).map((o) => ({ scope: "office" as const, scopeId: o.id, name: o.name })),
          ...teams.filter((tm) => tm.office_id === session.officeId).map((tm) => ({ scope: "team" as const, scopeId: tm.id, name: tm.name })),
        ]
      : myTeam
        ? [{ scope: "team" as const, scopeId: myTeam.id, name: myTeam.name }]
        : [];
  const goalOf = (scope: string, scopeId: string | null) =>
    (goalRows ?? []).find((g) => g.scope === scope && (g.scope_id ?? null) === scopeId);
  const reachedOf = (scope: string, scopeId: string | null) =>
    Number(((progressRows ?? []) as { scope: string; scope_id: string | null; reached: number }[]).find((p) => p.scope === scope && (p.scope_id ?? null) === scopeId)?.reached ?? 0);
  const lines = scopes.map((x) => ({
    ...x,
    target: goalOf(x.scope, x.scopeId) ? Number(goalOf(x.scope, x.scopeId)!.target) : null,
    reached: reachedOf(x.scope, x.scopeId),
  }));
  const monthLabel = new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : "en-GB", { month: "long", year: "numeric" }).format(new Date(`${month}T12:00:00Z`));

  const initial: Record<string, GoalRow> = {};
  for (const g of data ?? []) {
    initial[g.profile_id] = {
      profileId: g.profile_id,
      dailyCalls: g.daily_calls,
      dailyViewings: g.daily_viewings,
      dailyListings: g.daily_listings,
      monthlyTarget: Number(g.monthly_target),
      yearlyTarget: Number(g.yearly_target),
      monthlyBonus: g.monthly_bonus ?? "",
      yearlyBonus: g.yearly_bonus ?? "",
    };
  }

  return (
    <>
      <PageHeader backHref="/team" backLabel={t.team.title} title={t.goals.title} subtitle={t.goals.subtitle} />
      {lines.length > 0 && (
        <Card title={`${t.groupGoals.title} · ${monthLabel}`} description={t.groupGoals.hint} className="mb-6">
          <GroupGoalsForm month={month} lines={lines} />
        </Card>
      )}
      <GoalsForm
        people={members
          // goals are set for the people one leads (the owner: themself too)
          .filter((m) => session.isOwner || m.profile_id !== session.userId)
          .map((m) => ({ profileId: m.profile_id, name: m.full_name || m.email, avatarPath: m.avatar_path }))}
        initial={initial}
      />
    </>
  );
}
