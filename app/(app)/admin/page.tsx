import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Card, buttonClass } from "@/components/ui/form";
import { sofiaDay } from "@/lib/dates";
import { formatDate, formatPrice } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { cardPaymentsOn } from "@/lib/stripe";
import { subscriptionOf, toPlan, type Plan, type PlatformDetails, type SubscriptionStatus } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";
import { AgencyList, DetailsForm, PlansEditor, type AgencyRow } from "./AdminForms";
import { StripeSettings } from "./StripeSettings";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.platform.title };
}

/** BRIXA's own panel (only for whoever runs BRIXA): every agency, the packages, BRIXA's details. */
export default async function AdminPage() {
  const [session, { t, lang }] = await Promise.all([getSession(), getI18n()]);
  if (!session?.platformAdmin) notFound();
  const P = t.platform;

  const supabase = await createClient();
  const [{ data: raw, error }, { data: planRows }, { data: details }, { data: webhookReady }, { data: paymentRows }, h] = await Promise.all([
    supabase.rpc("platform_agencies"),
    supabase.from("plans").select("code, name, max_people, price_month, position, active").order("position"),
    supabase.from("platform_settings").select("company_name, eik, vat_number, representative, address, email, phone, website, trial_days").maybeSingle(),
    supabase.rpc("stripe_webhook_ready"),
    supabase
      .from("payments")
      .select("id, amount, currency, method, created_at, plan_code, billing_interval, organization:organizations(name)")
      .order("created_at", { ascending: false })
      .limit(15),
    headers(),
  ]);
  const site = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const payments = (paymentRows ?? []) as unknown as {
    id: string;
    amount: number;
    currency: string;
    method: string;
    created_at: string;
    plan_code: string | null;
    billing_interval: string | null;
    organization: { name: string } | null;
  }[];
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
      <PageHeader
        title={P.title}
        actions={
          <Link href="/admin/documents" className={buttonClass.secondary}>
            Документи за продажба — данни
          </Link>
        }
      />

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
        <Card title={P.stripeTitle} description={P.stripeHint}>
          <StripeSettings keySet={cardPaymentsOn()} webhookReady={webhookReady === true} endpoint={`${site}/api/stripe/webhook`} />
        </Card>
        <Card title={P.paymentsTitle}>
          {payments.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="divide-y divide-line-soft text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
                  <span className="w-24 text-muted">{formatDate(p.created_at, lang)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.organization?.name ?? "—"}</span>
                  <span className="text-muted">{[plans.find((plan) => plan.code === p.plan_code)?.name, p.billing_interval === "year" ? t.billing.intervalYear : p.billing_interval === "month" ? t.billing.intervalMonth : null].filter(Boolean).join(" · ")}</span>
                  <span className="font-semibold tabular-nums">{formatPrice(Number(p.amount), p.currency, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
