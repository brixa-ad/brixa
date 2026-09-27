"use server";

import { revalidatePath } from "next/cache";
import { getI18n } from "@/lib/i18n/server";
import { BOTTOM_NAV_MAX, navKeysFor } from "@/lib/nav";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Save the phone's bottom bar (null = back to the default). */
export async function saveBottomNav(keys: string[] | null): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };

  if (keys !== null) {
    const allowed = navKeysFor(session.isManager, Boolean(process.env.ANTHROPIC_API_KEY)) as string[];
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
