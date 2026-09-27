import { markReportViewed } from "@/lib/owner-report";
import { markShareViewed } from "@/lib/share";
import { createClient } from "@/lib/supabase/server";

/** A shared listing or an owner's report was opened (not counted for signed-in BRIXA users — e.g. the broker checking it). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: unknown; kind?: unknown } | null;
  if (typeof body?.token !== "string") return new Response(null, { status: 400 });

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    if (body.kind === "report") await markReportViewed(body.token);
    else await markShareViewed(body.token);
  }
  return new Response(null, { status: 204 });
}
