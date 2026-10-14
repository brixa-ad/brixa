"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { productFor, stripeClient, stripeReason } from "@/lib/stripe";
import { priceFor, toPlan, type BillingInterval, type Plan } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";

/** The agency's owner asks for a package: BRIXA hears and gets in touch about the payment. */
export async function requestPlan(code: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isOwner) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_plan", { wanted: code });
  if (error) console.error("Plan request failed:", error.message);
  return { ok: !error };
}

type BillingError = "off" | "room" | "generic";

/** The owner, Stripe and the agency's billing — or why not. */
async function billing() {
  const session = await getSession();
  if (!session?.isOwner) return null;
  const stripe = stripeClient();
  if (!stripe) return null;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", session.organizationId)
    .single();
  return { session, stripe, supabase, org: org as { stripe_customer_id: string | null; stripe_subscription_id: string | null } | null };
}

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/** A package that exists, and room in it for the agency's people. */
async function planFor(ctx: NonNullable<Awaited<ReturnType<typeof billing>>>, code: string): Promise<Plan | "room" | null> {
  const [{ data }, { count }] = await Promise.all([
    ctx.supabase.from("plans").select("code, name, max_people, price_month, position, active").eq("code", code).eq("active", true).maybeSingle(),
    ctx.supabase.from("organization_members").select("profile_id", { count: "exact", head: true }).eq("organization_id", ctx.session.organizationId),
  ]);
  if (!data) return null;
  const plan = toPlan(data as Plan);
  if (plan.max_people !== null && (count ?? 0) > plan.max_people) return "room";
  return plan;
}

const interval = (value: string): BillingInterval => (value === "year" ? "year" : "month");

/** Pay a package by card: Stripe's page for the card, then back to Subscription. */
export async function payByCard(code: string, every: string): Promise<{ url?: string; error?: BillingError; reason?: string }> {
  const ctx = await billing();
  if (!ctx) return { error: "off" };
  const plan = await planFor(ctx, code);
  if (plan === "room") return { error: "room" };
  if (!plan) return { error: "generic" };
  // already paying by card: change the package instead
  if (ctx.org?.stripe_subscription_id) return changePlan(code, every).then((r) => (r.ok ? { url: "/subscription?changed=1" } : { error: r.error ?? "generic" }));
  try {
    const period = interval(every);
    const { lang } = await getI18n();
    const base = await origin();
    const product = await productFor(ctx.stripe, plan);
    const meta = { org: ctx.session.organizationId, plan: plan.code, interval: period };
    const checkout = await ctx.stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: ctx.session.organizationId,
      ...(ctx.org?.stripe_customer_id
        ? { customer: ctx.org.stripe_customer_id, customer_update: { name: "auto", address: "auto" } }
        : { customer_email: ctx.session.email }),
      line_items: [
        {
          quantity: 1,
          price_data: { currency: "eur", product, unit_amount: Math.round(priceFor(plan, period) * 100), recurring: { interval: period } },
        },
      ],
      metadata: meta,
      subscription_data: { metadata: meta, description: `BRIXA — ${plan.name} · ${ctx.session.organizationName}` },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
      locale: lang === "en" ? "en" : "bg",
      success_url: `${base}/subscription?paid=1`,
      cancel_url: `${base}/subscription`,
    });
    return checkout.url ? { url: checkout.url } : { error: "generic" };
  } catch (error) {
    console.error("Starting a card payment failed:", (error as Error).message);
    return { error: "generic", reason: stripeReason(error) };
  }
}

/** Stripe's page for the card, the invoices and stopping: the agency manages its payment there. */
export async function openBillingPortal(): Promise<{ url?: string; error?: BillingError; reason?: string }> {
  const ctx = await billing();
  if (!ctx?.org?.stripe_customer_id) return { error: "off" };
  try {
    const { lang } = await getI18n();
    const portal = await ctx.stripe.billingPortal.sessions.create({
      customer: ctx.org.stripe_customer_id,
      return_url: `${await origin()}/subscription`,
      locale: lang === "en" ? "en" : "bg",
    });
    return { url: portal.url };
  } catch (error) {
    console.error("Opening the billing portal failed:", (error as Error).message);
    return { error: "generic", reason: stripeReason(error) };
  }
}

/** Renew by itself (on), or end with the paid time (off) — one tap; Stripe tells the database. */
export async function setAutoRenew(on: boolean): Promise<{ ok: boolean }> {
  const ctx = await billing();
  if (!ctx?.org?.stripe_subscription_id) return { ok: false };
  try {
    await ctx.stripe.subscriptions.update(ctx.org.stripe_subscription_id, { cancel_at_period_end: !on });
    revalidatePath("/subscription");
    return { ok: true };
  } catch (error) {
    console.error("Changing the renewal failed:", (error as Error).message);
    return { ok: false };
  }
}

/** Another package or period on the same card: the difference is paid (or credited) at once. */
export async function changePlan(code: string, every: string): Promise<{ ok: boolean; error?: BillingError; reason?: string }> {
  const ctx = await billing();
  if (!ctx?.org?.stripe_subscription_id) return { ok: false, error: "off" };
  const plan = await planFor(ctx, code);
  if (plan === "room") return { ok: false, error: "room" };
  if (!plan) return { ok: false, error: "generic" };
  try {
    const period = interval(every);
    const product = await productFor(ctx.stripe, plan);
    const sub = await ctx.stripe.subscriptions.retrieve(ctx.org.stripe_subscription_id);
    const item = sub.items.data[0];
    if (!item) return { ok: false, error: "generic" };
    await ctx.stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price_data: { currency: "eur", product, unit_amount: Math.round(priceFor(plan, period) * 100), recurring: { interval: period } } }],
      proration_behavior: "always_invoice",
      cancel_at_period_end: false,
      metadata: { org: ctx.session.organizationId, plan: plan.code, interval: period },
    });
    revalidatePath("/subscription");
    return { ok: true };
  } catch (error) {
    console.error("Changing the package failed:", (error as Error).message);
    return { ok: false, error: "generic", reason: stripeReason(error) };
  }
}
