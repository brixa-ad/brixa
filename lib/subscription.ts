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
};

export type SubscriptionRow = {
  trial_ends_at: string | null;
  paid_until: string | null;
  comped: boolean | null;
  plan_code: string | null;
};

export function subscriptionOf(row: SubscriptionRow | null | undefined, now = new Date()): Subscription {
  const today = sofiaToday(now);
  const base = { trialEndsAt: row?.trial_ends_at ?? null, paidUntil: row?.paid_until ?? null, planCode: row?.plan_code ?? null };
  // before migration 050 (or a row we can't read): never lock anyone out
  if (!row || row.comped === undefined || row.comped) return { ...base, status: "comped", daysLeft: null };
  if (row.paid_until && row.paid_until >= today) {
    return { ...base, status: "active", daysLeft: daysBetween(today, row.paid_until) + 1 };
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
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  trial_days: number;
};

export const toPlan = (p: Plan): Plan => ({ ...p, price_month: Number(p.price_month) });
