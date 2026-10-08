import { Lock, Mail, Phone } from "lucide-react";
import { formatDate } from "@/lib/format";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import { telHref } from "@/lib/phone";
import type { SessionContext } from "@/lib/session";
import { toPlan, type Plan, type PlatformDetails } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";
import { PlanCards } from "./PlanCards";

/** Where the agency stands, the packages, and how to reach BRIXA — the Subscription page, and the screen once the trial ends. */
export async function SubscriptionView({ session, t, lang, locked = false }: { session: SessionContext; t: Dictionary; lang: Lang; locked?: boolean }) {
  const B = t.billing;
  const supabase = await createClient();
  const [{ data: planRows }, { data: details }, { count: people }] = await Promise.all([
    supabase.from("plans").select("code, name, max_people, price_month, position, active").eq("active", true).order("position"),
    supabase.from("platform_settings").select("company_name, eik, address, email, phone, website, trial_days").maybeSingle(),
    supabase.from("organization_members").select("profile_id", { count: "exact", head: true }).eq("organization_id", session.organizationId),
  ]);
  const plans = ((planRows ?? []) as Plan[]).map(toPlan);
  const brixa = details as PlatformDetails | null;
  const sub = session.subscription;

  const status =
    sub.status === "comped"
      ? B.statusComped
      : sub.status === "active"
        ? fmt(B.statusActive, { date: formatDate(sub.paidUntil!, lang) })
        : sub.status === "trial"
          ? fmt(B.statusTrial, { date: formatDate(sub.trialEndsAt!, lang) })
          : B.statusExpired;

  return (
    <div className="space-y-6">
      {locked ? (
        <section className="rounded-2xl border border-warning/40 bg-warning/10 p-6">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Lock className="size-5" />
            {sub.paidUntil ? B.lockedPaidTitle : B.lockedTitle}
          </h1>
          <p className="mt-2 max-w-2xl text-fg-2">{session.isOwner ? B.lockedOwner : B.lockedMember}</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
          <p className="text-sm text-muted">{session.organizationName}</p>
          <p className="mt-1 text-lg font-semibold">{status}</p>
          {people !== null && <p className="mt-1 text-sm text-muted">{fmt(B.people, { n: people })}</p>}
          {sub.status === "trial" && <p className="mt-3 max-w-2xl text-sm text-fg-2">{B.trialInfo}</p>}
        </section>
      )}

      {(session.isOwner || !locked) && plans.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold">{B.plans}</h2>
          <PlanCards plans={plans} current={sub.status === "active" ? sub.planCode : null} people={people} canRequest={session.isOwner && sub.status !== "comped"} />
        </section>
      )}

      {brixa && (brixa.phone || brixa.email) && (
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
          <h2 className="text-base font-semibold">{B.contactTitle}</h2>
          <p className="mt-1 text-sm text-muted">{B.contactHint}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
            {brixa.phone && (
              <a href={telHref(brixa.phone)} className="inline-flex items-center gap-2 text-accent-fg">
                <Phone className="size-4" />
                {brixa.phone}
              </a>
            )}
            {brixa.email && (
              <a href={`mailto:${brixa.email}`} className="inline-flex min-w-0 items-center gap-2 break-all text-accent-fg">
                <Mail className="size-4" />
                {brixa.email}
              </a>
            )}
          </div>
          {brixa.company_name && <p className="mt-3 text-xs text-subtle">{[brixa.company_name, brixa.eik && `ЕИК ${brixa.eik}`, brixa.address].filter(Boolean).join(" · ")}</p>}
        </section>
      )}
    </div>
  );
}
