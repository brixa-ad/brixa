import { recordShareTap, recordShareTime, UUID } from "@/lib/share";
import { isTap } from "@/lib/signals";
import { createClient } from "@/lib/supabase/server";

/**
 * What the client does on a shared listing: a tap on call / Viber / WhatsApp / e-mail, or, when the
 * page is left, how long it was looked at and how many photos were seen. Not counted for signed-in
 * BRIXA users (the broker checking the page).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
    kind?: unknown;
    id?: unknown;
    seconds?: unknown;
    photos?: unknown;
  } | null;
  if (typeof body?.token !== "string" || !UUID.test(body.token)) return new Response(null, { status: 400 });

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) return new Response(null, { status: 204 });

  if (typeof body.id === "string" && UUID.test(body.id)) {
    const seconds = Number(body.seconds);
    const photos = Number(body.photos);
    await recordShareTime(body.token, body.id, Number.isFinite(seconds) ? Math.round(seconds) : 0, Number.isFinite(photos) ? Math.round(photos) : 0);
  } else if (isTap(body.kind)) {
    await recordShareTap(body.token, body.kind);
  } else {
    return new Response(null, { status: 400 });
  }
  return new Response(null, { status: 204 });
}
