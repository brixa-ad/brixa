import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { dictionaries, isLang } from "@/lib/i18n/dictionaries";
import { notificationLink, notificationText, type NotificationData } from "@/lib/notification-text";

/** Who is sending (shown to the browser's push service). */
const SUBJECT = "https://brixa-yavlena.vercel.app";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Claimed = {
  type: string;
  data: NotificationData;
  link: string | null;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  lang: string;
  /** the task's client, when the recipient may see them */
  phone: string | null;
  email: string | null;
  /** what waits for them (056): the number on the app's icon */
  waiting?: number | null;
};

/**
 * Called by the database for every new notification whose recipient has push on.
 * The notification's secret token is the proof: only the database knows it.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: unknown; token?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const token = typeof body?.token === "string" ? body.token : "";
  if (!UUID.test(id) || !UUID.test(token)) return new Response(null, { status: 400 });

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.error("Push is not configured: VAPID keys are missing");
    return new Response(null, { status: 503 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase.rpc("claim_push", { target: id, token });
  if (error) {
    console.error("Claiming a push failed:", error.message);
    return new Response(null, { status: 500 });
  }
  const rows = (data ?? []) as Claimed[];
  if (rows.length === 0) return new Response(null, { status: 204 });

  webpush.setVapidDetails(SUBJECT, publicKey, privateKey);
  const dead: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      const lang = isLang(row.lang) ? row.lang : "bg";
      const t = dictionaries[lang];
      const url = notificationLink(row.type, row.link) ?? "/";
      // Buttons under the notification (Android / computers): call or Viber the client, or e-mail them.
      const actions = [
        ...(row.phone ? [{ action: "call", title: t.contact.call }, { action: "viber", title: t.contact.viber }] : []),
        ...(row.email ? [{ action: "email", title: t.contact.email }] : []),
      ];
      const payload = JSON.stringify({
        title: "BRIXA",
        body: notificationText(row.type, row.data ?? {}, t, lang),
        url,
        // a conversation's messages replace each other on the phone
        tag: row.type === "chat_message" ? (row.link ?? id) : id,
        // on screen until it's tapped (Android, computers; the iPhone keeps it in its list)
        requireInteraction: row.type !== "chat_message",
        renotify: row.type === "chat_message",
        // a badge on the app's icon until the day is opened
        badge: row.type === "morning_brief",
        // how many things wait for them — the number on BRIXA's icon, as Messenger does
        count: typeof row.waiting === "number" ? row.waiting : null,
        actions,
        links: Object.fromEntries(actions.map((a) => [a.action, `${url}?contact=${a.action}`])),
      });
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } },
          payload,
          { TTL: 24 * 3600, urgency: "high" }
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // The push service no longer knows this device (uninstalled, signed out, expired).
        if (status === 404 || status === 410) dead.push(row.endpoint);
        else console.error("Sending a push failed:", status ?? err);
      }
    })
  );

  if (dead.length > 0) {
    await supabase.rpc("remove_dead_push_subscriptions", { target: id, token, endpoints: dead });
  }
  return Response.json({ sent: rows.length - dead.length });
}
