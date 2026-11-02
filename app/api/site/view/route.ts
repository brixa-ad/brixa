import { NextResponse } from "next/server";
import { UUID, anonymous } from "@/lib/share";
import { createClient } from "@/lib/supabase/server";

/**
 * A visit of a listing on the agency's website (once per browser in 12 hours). Not counted for
 * signed-in BRIXA users (the broker checking the site).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { site?: unknown; property?: unknown; visitor?: unknown } | null;
  if (
    typeof body?.site !== "string" ||
    !/^[a-z0-9-]{1,60}$/i.test(body.site) ||
    typeof body.property !== "string" ||
    !UUID.test(body.property) ||
    typeof body.visitor !== "string" ||
    !UUID.test(body.visitor)
  ) {
    return new Response(null, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims) return new Response(null, { status: 204 });

  const { data, error } = await anonymous().rpc("record_site_view", {
    site: body.site,
    target_property: body.property,
    visitor_id: body.visitor,
  });
  if (error) console.error("Counting a website visit failed:", error.message);
  return typeof data === "string" ? NextResponse.json({ id: data }) : new Response(null, { status: 204 });
}
