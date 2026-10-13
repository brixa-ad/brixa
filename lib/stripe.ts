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

/** Stripe's product for a package — one per package, made the first time (its id: brixa_<code>). */
export async function productFor(stripe: Stripe, plan: Pick<Plan, "code" | "name">) {
  const id = `brixa_${plan.code}`;
  const name = `BRIXA — ${plan.name}`;
  try {
    const product = await stripe.products.retrieve(id);
    if (!product.active || product.name !== name) await stripe.products.update(id, { active: true, name });
  } catch (error) {
    if ((error as { code?: string }).code !== "resource_missing") throw error;
    await stripe.products.create({ id, name });
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
