"use server";

import { revalidatePath } from "next/cache";
import { getI18n } from "@/lib/i18n/server";
import { BOTTOM_NAV_MAX, menuFor } from "@/lib/nav";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Save the phone's bottom bar (null = back to the default). */
export async function saveBottomNav(keys: string[] | null): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };

  if (keys !== null) {
    const allowed = menuFor(session.isManager, Boolean(process.env.ANTHROPIC_API_KEY), session.solo).map((s) => s.key) as string[];
    const unique = [...new Set(keys)];
    if (unique.length === 0 || unique.length > BOTTOM_NAV_MAX || !unique.every((key) => allowed.includes(key))) {
      return { ok: false };
    }
    keys = unique;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ bottom_nav: keys }).eq("id", session.userId);
  if (error) {
    console.error("Saving the bottom bar failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

type DeviceSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/** This device should get my notifications (in the language it uses). */
export async function savePushSubscription(sub: DeviceSubscription, userAgent: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const valid =
    typeof sub?.endpoint === "string" &&
    sub.endpoint.startsWith("https://") &&
    sub.endpoint.length <= 1000 &&
    typeof sub.keys?.p256dh === "string" &&
    sub.keys.p256dh.length <= 200 &&
    typeof sub.keys?.auth === "string" &&
    sub.keys.auth.length <= 100;
  if (!valid) return { ok: false };

  const [{ lang }, supabase] = await Promise.all([getI18n(), createClient()]);
  const { error } = await supabase.rpc("save_push_subscription", {
    sub_endpoint: sub.endpoint,
    sub_p256dh: sub.keys.p256dh,
    sub_auth: sub.keys.auth,
    sub_agent: String(userAgent ?? "").slice(0, 300),
    sub_lang: lang,
  });
  if (error) console.error("Saving the push device failed:", error.message);
  return { ok: !error };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: !error };
}

export async function sendTestPush(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_test_notification");
  if (error) console.error("Test notification failed:", error.message);
  revalidatePath("/", "layout");
  return { ok: !error };
}

export type AgencyInput = {
  name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  defaultCurrency: string;
  commissionSalePercent: number;
  commissionRentMonths: number;
  referralPercent: number;
  points: Record<"dealDouble" | "deal" | "listing" | "exclusive" | "viewing" | "meeting" | "client" | "call", number>;
};

/** Managers: the agency's details, defaults and ranking points. */
export async function updateAgency(input: AgencyInput): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isManager) return { ok: false };
  const text = (value: string, max: number) => (typeof value === "string" ? value.trim().slice(0, max) || null : null);
  const name = text(input.name, 120);
  const whole = (n: number) => Number.isInteger(n) && n >= 0 && n <= 1000;
  if (
    !name ||
    !["EUR", "BGN", "USD"].includes(input.defaultCurrency) ||
    !(input.commissionSalePercent >= 0 && input.commissionSalePercent <= 100) ||
    !(input.commissionRentMonths >= 0 && input.commissionRentMonths <= 24) ||
    !(input.referralPercent >= 0 && input.referralPercent <= 100) ||
    !Object.values(input.points).every(whole)
  ) {
    return { ok: false };
  }
  const website = text(input.website, 200);
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      phone: text(input.phone, 40),
      email: text(input.email, 200),
      website: website && !/^https?:\/\//.test(website) ? `https://${website}` : website,
      address: text(input.address, 300),
      default_currency: input.defaultCurrency,
      commission_sale_percent: input.commissionSalePercent,
      commission_rent_months: input.commissionRentMonths,
      referral_percent: input.referralPercent,
      points_deal_double: input.points.dealDouble,
      points_deal: input.points.deal,
      points_listing: input.points.listing,
      points_exclusive: input.points.exclusive,
      points_viewing: input.points.viewing,
      points_meeting: input.points.meeting,
      points_client: input.points.client,
      points_call: input.points.call,
    })
    .eq("id", session.organizationId);
  if (error) console.error("Saving the agency failed:", error.message);
  revalidatePath("/", "layout");
  return { ok: !error };
}

/** Managers: the website — on or off, its address, the headline and a few words. */
export async function saveSite(input: { enabled: boolean; slug: string; headline: string; about: string }): Promise<{ ok: boolean; reason?: "taken" | "invalid" }> {
  const session = await getSession();
  if (!session?.isManager) return { ok: false };
  const slug = String(input.slug ?? "").trim().toLowerCase();
  if (slug && !/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return { ok: false, reason: "invalid" };
  if (input.enabled && !slug) return { ok: false, reason: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      site_enabled: Boolean(input.enabled),
      site_slug: slug || null,
      site_headline: String(input.headline ?? "").trim().slice(0, 120) || null,
      site_about: String(input.about ?? "").trim().slice(0, 2000) || null,
    })
    .eq("id", session.organizationId);
  if (error) {
    if (error.code === "23505") return { ok: false, reason: "taken" };
    console.error("Saving the website failed:", error.message);
    return { ok: false };
  }
  revalidatePath("/settings");
  if (slug) revalidatePath(`/w/${slug}`);
  return { ok: true };
}

/** After the browser uploaded a logo (or to remove it: null). */
export async function setAgencyLogo(path: string | null): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session?.isManager) return { ok: false };
  if (path !== null && !path.startsWith(`${session.organizationId}/`)) return { ok: false };
  const supabase = await createClient();
  const { data: before } = await supabase.from("organizations").select("logo_path").eq("id", session.organizationId).maybeSingle();
  const { error } = await supabase.from("organizations").update({ logo_path: path }).eq("id", session.organizationId);
  if (!error && before?.logo_path && before.logo_path !== path) {
    await supabase.storage.from("agency-logos").remove([before.logo_path]);
  }
  revalidatePath("/", "layout");
  return { ok: !error };
}
