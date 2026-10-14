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

/** Is the key right, and is it the test or the live one? */
export async function checkStripe(): Promise<{ ok: boolean; live?: boolean; reason?: string }> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false };
  try {
    const balance = await stripe.balance.retrieve();
    return { ok: true, live: balance.livemode };
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
