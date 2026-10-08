import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/form";
import { sofiaDay } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { subscriptionOf, toPlan, type Plan, type PlatformDetails, type SubscriptionStatus } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";
import { AgencyList, DetailsForm, PlansEditor, type AgencyRow } from "./AdminForms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.platform.title };
}

/** BRIXA's own panel (only for whoever runs BRIXA): every agency, the packages, BRIXA's details. */
export default async function AdminPage() {
  const [session, { t }] = await Promise.all([getSession(), getI18n()]);
  if (!session?.platformAdmin) notFound();
  const P = t.platform;

  const supabase = await createClient();
  const [{ data: raw, error }, { data: planRows }, { data: details }] = await Promise.all([
    supabase.rpc("platform_agencies"),
    supabase.from("plans").select("code, name, max_people, price_month, position, active").order("position"),
    supabase.from("platform_settings").select("company_name, eik, address, email, phone, website, trial_days").maybeSingle(),
  ]);
  if (error) console.error("The agencies failed:", error.message);

  const now = new Date();
  const agencies: AgencyRow[] = ((raw ?? []) as Omit<AgencyRow, "status" | "daysLeft" | "trialUntil">[]).map((a) => {
    const sub = subscriptionOf(a, now);
    const trialEnds = a.trial_ends_at;
    return {
      ...a,
      status: sub.status,
      daysLeft: sub.daysLeft,
      // the trial ends at the start of the next day: its last day is the one before
      trialUntil: trialEnds ? sofiaDay(new Date(Date.parse(trialEnds) - 1).toISOString()) : null,
    };
  });
  const count = (s: SubscriptionStatus) => agencies.filter((a) => a.status === s).length;
  const tiles = [
    { label: P.total, value: agencies.length },
    { label: P.inTrial, value: count("trial") },
    { label: P.paying, value: count("active") },
    { label: P.expired, value: count("expired") },
    { label: P.people, value: agencies.reduce((sum, a) => sum + a.people, 0) },
  ];
  const plans = ((planRows ?? []) as Plan[]).map(toPlan);

  return (
    <div className="space-y-6">
      <PageHeader title={P.title} />

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((tile) => (
          <li key={tile.label} className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
            <p className="text-xs font-medium text-muted">{tile.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{tile.value}</p>
          </li>
        ))}
      </ul>

      <AgencyList agencies={agencies} plans={plans} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title={P.plansTitle}>
          <PlansEditor plans={plans} />
        </Card>
        <Card title={P.detailsTitle} description={P.detailsHint}>
          <DetailsForm details={details as PlatformDetails | null} />
        </Card>
      </div>
    </div>
  );
}
