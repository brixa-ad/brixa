import { UUID, anonymous } from "@/lib/share";

/** A website visit, when the page is left: how long it was looked at, the photos seen, the video. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    visitor?: unknown;
    seconds?: unknown;
    photos?: unknown;
    video?: unknown;
  } | null;
  if (typeof body?.id !== "string" || !UUID.test(body.id) || typeof body.visitor !== "string" || !UUID.test(body.visitor)) {
    return new Response(null, { status: 400 });
  }
  const seconds = Number(body.seconds);
  const photos = Number(body.photos);
  await anonymous().rpc("site_view_time", {
    view_id: body.id,
    visitor_id: body.visitor,
    seen_seconds: Number.isFinite(seconds) ? Math.round(seconds) : 0,
    seen_photos: Number.isFinite(photos) ? Math.round(photos) : 0,
    watched_video: body.video === true,
  });
  return new Response(null, { status: 204 });
}
