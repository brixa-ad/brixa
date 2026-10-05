import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getI18n } from "@/lib/i18n/server";
import { getMyPeople } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { GoalRow } from "../actions";
import { GoalsForm } from "./GoalsForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.goals.title };
}

export default async function GoalsPage() {
  const session = (await getSession())!;
  if (!session.isManager) redirect("/team");

  const supabase = await createClient();
  const [{ t }, members, { data }] = await Promise.all([
    getI18n(),
    getMyPeople(supabase),
    supabase.from("broker_goals").select("*").eq("organization_id", session.organizationId),
  ]);

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
