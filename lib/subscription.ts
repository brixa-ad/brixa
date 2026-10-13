import { daysBetween, sofiaToday } from "./dates";

/** Free for good · paid up · trying BRIXA · time to pay. */
export type SubscriptionStatus = "comped" | "active" | "trial" | "expired";

export type Subscription = {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  paidUntil: string | null;
  planCode: string | null;
  /** days left of the trial or of the paid time (null: free for good) */
  daysLeft: number | null;
  /** paid by card on Stripe (066), and whether it renews by itself */
  card: boolean;
  autoRenew: boolean;
  /** the card's last payment didn't go through */
  failing: boolean;
  interval: BillingInterval | null;
};

export type BillingInterval = "month" | "year";

/** A year costs this many months (two months free) — the same in notify_billing (066). */
export const YEAR_MONTHS = 10;

/** When a renewing card fails, the work goes on this many days while Stripe tries again. */
export const CARD_GRACE_DAYS = 3;

export type SubscriptionRow = {
  trial_ends_at: string | null;
  paid_until: string | null;
  comped: boolean | null;
  plan_code: string | null;
  stripe_subscription_id?: string | null;
  auto_renew?: boolean | null;
  payment_failed_at?: string | null;
  billing_interval?: string | null;
};

export function subscriptionOf(row: SubscriptionRow | null | undefined, now = new Date()): Subscription {
  const today = sofiaToday(now);
  const card = Boolean(row?.stripe_subscription_id);
  const autoRenew = card && Boolean(row?.auto_renew);
  const base = {
    trialEndsAt: row?.trial_ends_at ?? null,
    paidUntil: row?.paid_until ?? null,
    planCode: row?.plan_code ?? null,
    card,
    autoRenew,
    failing: Boolean(row?.payment_failed_at),
    interval: (row?.billing_interval === "month" || row?.billing_interval === "year" ? row.billing_interval : null) as BillingInterval | null,
  };
  // before migration 050 (or a row we can't read): never lock anyone out
  if (!row || row.comped === undefined || row.comped) return { ...base, status: "comped", daysLeft: null };
  if (row.paid_until && row.paid_until >= today) {
    return { ...base, status: "active", daysLeft: daysBetween(today, row.paid_until) + 1 };
  }
  // a renewing card that just failed: a few more days while Stripe tries again
  if (autoRenew && row.paid_until && daysBetween(row.paid_until, today) <= CARD_GRACE_DAYS) {
    return { ...base, status: "active", failing: true, daysLeft: 0 };
  }
  const left = row.trial_ends_at ? Date.parse(row.trial_ends_at) - now.getTime() : 0;
  if (left > 0) return { ...base, status: "trial", daysLeft: Math.ceil(left / 86_400_000) };
  return { ...base, status: "expired", daysLeft: 0 };
}

export type Plan = {
  code: string;
  name: string;
  max_people: number | null;
  price_month: number;
  position: number;
  active: boolean;
};

export type PlatformDetails = {
  company_name: string | null;
  eik: string | null;
  vat_number: string | null;
  representative: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  trial_days: number;
};

export const toPlan = (p: Plan): Plan => ({ ...p, price_month: Number(p.price_month) });

/** A package's price for a month or for a year (a year costs YEAR_MONTHS months). */
export const priceFor = (plan: Pick<Plan, "price_month">, interval: BillingInterval) =>
  interval === "year" ? plan.price_month * YEAR_MONTHS : plan.price_month;
