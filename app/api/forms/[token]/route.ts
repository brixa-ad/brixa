import { readContact, type LeadAnswer } from "@/lib/leads";
import { anonymous, UUID } from "@/lib/share";

/**
 * A Google Form's script sends here: { ping: true } when it's installed, and the answers of each
 * response. The token in the address is the form's key; a new answer becomes a cold contact of the
 * form's broker.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/forms/[token]">) {
  const { token } = await ctx.params;
  if (!UUID.test(token)) return Response.json({ ok: false }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { ping?: unknown; answers?: unknown; email?: unknown } | null;
  if (!body) return Response.json({ ok: false }, { status: 400 });
  const supabase = anonymous();

  if (body.ping === true) {
    const { data } = await supabase.rpc("ping_lead_form", { form_token: token });
    return Response.json({ ok: data === true }, { status: data === true ? 200 : 404 });
  }

  const answers: LeadAnswer[] = (Array.isArray(body.answers) ? body.answers : [])
    .slice(0, 50)
    .map((item) => ({
      q: String((item as { q?: unknown })?.q ?? "").slice(0, 300),
      a: String((item as { a?: unknown })?.a ?? "").slice(0, 2000),
    }))
    .filter((item) => item.q || item.a);
  const { name, phone, email } = readContact(answers, typeof body.email === "string" ? body.email.trim() : null);
  const { data, error } = await supabase.rpc("submit_lead_form", {
    form_token: token,
    lead_name: name,
    lead_phone: phone,
    lead_email: email,
    answers,
  });
  if (error) console.error("A form answer failed:", error.message);
  return Response.json({ ok: Boolean(data) }, { status: data ? 200 : 404 });
}
