import "server-only";
import Stripe from "stripe";
import type { Plan } from "./subscription";

/**
 * Card payments go through Stripe: the card is typed on Stripe's page, never in BRIXA.
 * STRIPE_SECRET_KEY lives only in the server's settings (Vercel); without it, paying by card is off.
 * What Stripe sends back (the webhook) is checked and applied by the database (066).
 */
let client: Stripe | null = null;

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

export const cardPaymentsOn = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** What Stripe answered when it said no — shown to the owner, so a wrong key or setting is plain to see. */
export function stripeReason(error: unknown) {
  const e = error as { type?: string; message?: string };
  return typeof e?.type === "string" && e.type.startsWith("Stripe") && e.message ? e.message.slice(0, 300) : undefined;
}

/** The events BRIXA listens to (the webhook in Stripe must send these). */
export const STRIPE_EVENTS = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export type StripeCheck = {
  ok: boolean;
  live?: boolean;
  reason?: string;
  /** the webhook to BRIXA's address in this mode of Stripe, and the events it misses */
  endpoint?: { found: boolean; enabled: boolean; missing: string[]; others: string[] };
  /** Stripe's latest payment events: delivered to BRIXA (a 2xx answer) or still waiting */
  events?: { id: string; type: string; at: number; delivered: boolean; org: string | null }[];
};

/** Is the key right (test or live), is the webhook to BRIXA there, and do Stripe's events reach BRIXA? */
export async function checkStripe(endpointUrl: string): Promise<StripeCheck> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false };
  try {
    const balance = await stripe.balance.retrieve();
    const [hooks, list] = await Promise.all([
      stripe.webhookEndpoints.list({ limit: 50 }),
      stripe.events.list({ limit: 8, types: [...STRIPE_EVENTS] }),
    ]);
    const mine = hooks.data.find((h) => h.url.replace(/\/$/, "") === endpointUrl.replace(/\/$/, ""));
    const listens = (type: string) => Boolean(mine && (mine.enabled_events.includes("*") || mine.enabled_events.includes(type)));
    return {
      ok: true,
      live: balance.livemode,
      endpoint: {
        found: Boolean(mine),
        enabled: mine?.status === "enabled",
        missing: STRIPE_EVENTS.filter((type) => !listens(type)),
        others: hooks.data.filter((h) => h !== mine).map((h) => h.url),
      },
      events: list.data.map((e) => {
        const obj = e.data.object as unknown as {
          client_reference_id?: string | null;
          metadata?: Record<string, string> | null;
          parent?: { subscription_details?: { metadata?: Record<string, string> | null } | null } | null;
        };
        return {
          id: e.id,
          type: e.type,
          at: e.created,
          delivered: e.pending_webhooks === 0,
          org: obj.client_reference_id ?? obj.metadata?.org ?? obj.parent?.subscription_details?.metadata?.org ?? null,
        };
      }),
    };
  } catch (error) {
    return { ok: false, reason: stripeReason(error) ?? (error as Error).message };
  }
}

/** What BRIXA is for taxes: software as a service, for businesses (Stripe's product tax code). */
const TAX_CODE = "txcd_10103001";

/** Stripe's product for a package — one per package, made the first time (its id: brixa_<code>). */
export async function productFor(stripe: Stripe, plan: Pick<Plan, "code" | "name">) {
  const id = `brixa_${plan.code}`;
  const name = `BRIXA — ${plan.name}`;
  try {
    const product = await stripe.products.retrieve(id);
    const taxCode = typeof product.tax_code === "string" ? product.tax_code : product.tax_code?.id;
    if (!product.active || product.name !== name || taxCode !== TAX_CODE) {
      await stripe.products.update(id, { active: true, name, tax_code: TAX_CODE });
    }
  } catch (error) {
    if ((error as { code?: string }).code !== "resource_missing") throw error;
    await stripe.products.create({ id, name, tax_code: TAX_CODE });
  }
  return id;
}

/** The card the subscription is paid with: "Visa •••• 4242", or null. */
export async function cardOf(stripe: Stripe, subscriptionId: string) {
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["default_payment_method", "customer.invoice_settings.default_payment_method"] });
    const fromSub = typeof sub.default_payment_method === "object" ? sub.default_payment_method : null;
    const customer = typeof sub.customer === "object" && !("deleted" in sub.customer && sub.customer.deleted) ? (sub.customer as Stripe.Customer) : null;
    const fromCustomer = customer && typeof customer.invoice_settings?.default_payment_method === "object" ? customer.invoice_settings.default_payment_method : null;
    const card = (fromSub ?? fromCustomer)?.card;
    return card ? { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year } : null;
  } catch (error) {
    console.error("Reading the card failed:", (error as Error).message);
    return null;
  }
}
