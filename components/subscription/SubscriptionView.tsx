import { AlertTriangle, CheckCircle2, CreditCard, FileText, Lock, Mail, Phone } from "lucide-react";
import { formatDate, formatPrice } from "@/lib/format";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import { telHref } from "@/lib/phone";
import type { SessionContext } from "@/lib/session";
import { cardOf, cardPaymentsOn, stripeClient } from "@/lib/stripe";
import { priceFor, toPlan, type Plan, type PlatformDetails } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";
import { BillingActions } from "./BillingActions";
import { PlanCards } from "./PlanCards";

/** Where the agency stands, the packages, and how to reach BRIXA — the Subscription page, and the screen once the trial ends. */
export async function SubscriptionView({
  session,
  t,
  lang,
  locked = false,
  notice = null,
}: {
  session: SessionContext;
  t: Dictionary;
  lang: Lang;
  locked?: boolean;
  /** back from Stripe: paid, or the package changed */
  notice?: "paid" | "changed" | null;
}) {
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
  // paying by card: the card on Stripe, and what the agency has paid
  const stripe = stripeClient();
  const cardOn = cardPaymentsOn();
  const [subRow, payments] = session.isOwner
    ? await Promise.all([
        supabase.from("organizations").select("stripe_subscription_id").eq("id", session.organizationId).maybeSingle(),
        supabase
          .from("payments")
          .select("id, amount, currency, plan_code, billing_interval, period_end, invoice_url, invoice_pdf, method, created_at")
          .eq("organization_id", session.organizationId)
          .order("created_at", { ascending: false })
          .limit(12),
      ])
    : [null, null];
  const subscriptionId = (subRow?.data as { stripe_subscription_id: string | null } | null)?.stripe_subscription_id ?? null;
  const card = stripe && subscriptionId ? await cardOf(stripe, subscriptionId) : null;
  const myPlan = plans.find((p) => p.code === sub.planCode) ?? null;
  const nextAmount = myPlan ? formatPrice(priceFor(myPlan, sub.interval ?? "month"), "EUR", lang) : null;
  const paid = (payments?.data ?? []) as {
    id: string;
    amount: number;
    currency: string;
    plan_code: string | null;
    billing_interval: string | null;
    period_end: string | null;
    invoice_url: string | null;
    invoice_pdf: string | null;
    method: string;
    created_at: string;
  }[];

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
          {session.isOwner && sub.card && (
            <div className="mt-4 border-t border-line-soft pt-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="size-4 text-accent-fg" />
                {B.cardTitle}
                {card && <span className="font-normal text-muted">· {fmt(B.cardLine, { brand: card.brand.toUpperCase(), last4: card.last4 })}</span>}
                {sub.interval && <span className="font-normal text-muted">· {sub.interval === "year" ? B.intervalYear : B.intervalMonth}</span>}
              </p>
              {sub.paidUntil && (
                <p className="mt-1 text-sm text-fg-2">
                  {sub.autoRenew
                    ? fmt(B.renewsOn, { date: formatDate(sub.paidUntil, lang), amount: nextAmount ?? "" })
                    : fmt(B.endsOn, { date: formatDate(sub.paidUntil, lang) })}
                </p>
              )}
              {sub.failing && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <strong className="font-semibold">{B.failingTitle}.</strong> {B.failingText}
                  </span>
                </p>
              )}
              <BillingActions autoRenew={sub.autoRenew} failing={sub.failing} />
            </div>
          )}
        </section>
      )}

      {notice && (
        <p className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          {notice === "paid" ? B.paidThanks : B.changed}
        </p>
      )}

      {(session.isOwner || !locked) && plans.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold">{B.plans}</h2>
          <PlanCards
            plans={plans}
            current={sub.status === "active" ? sub.planCode : null}
            people={people}
            canRequest={session.isOwner && sub.status !== "comped"}
            card={{ on: cardOn, subscribed: sub.card, interval: sub.interval }}
          />
        </section>
      )}

      {paid.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
          <h2 className="text-base font-semibold">{B.paymentsTitle}</h2>
          <ul className="mt-3 divide-y divide-line-soft text-sm">
            {paid.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="w-28 text-muted">{formatDate(p.created_at, lang)}</span>
                <span className="font-semibold">{formatPrice(Number(p.amount), p.currency, lang)}</span>
                <span className="text-muted">
                  {[plans.find((plan) => plan.code === p.plan_code)?.name, p.billing_interval === "year" ? B.intervalYear : p.billing_interval === "month" ? B.intervalMonth : null, p.period_end && fmt(B.paidTill, { date: formatDate(p.period_end, lang) })]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {(p.invoice_pdf ?? p.invoice_url) && (
                  <a href={p.invoice_pdf ?? p.invoice_url ?? undefined} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 font-medium text-accent-fg">
                    <FileText className="size-4" />
                    {B.receipt}
                  </a>
                )}
              </li>
            ))}
          </ul>
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
