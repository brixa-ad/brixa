import { readAnswers, readContact } from "@/lib/leads";
import { anonymous, UUID } from "@/lib/share";

/**
 * A form sends its answers here; the token in the address is the folder's key. A Google Form's
 * script sends { ping: true } when installed and { answers: [{ q, a }] } for each response; a
 * Facebook lead comes through Make as plain fields (form-encoded or JSON) or as Facebook's own
 * { field_data: [{ name, values }] }. A new answer becomes a cold contact of the folder's broker.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/forms/[token]">) {
  const { token } = await ctx.params;
  if (!UUID.test(token)) return Response.json({ ok: false }, { status: 404 });

  const type = request.headers.get("content-type") ?? "";
  let body: Record<string, unknown> | null = null;
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    if (form) {
      body = {};
      for (const [key, value] of form.entries()) if (typeof value === "string") body[key] = value;
    }
  } else {
    const json = (await request.json().catch(() => null)) as unknown;
    if (json && typeof json === "object" && !Array.isArray(json)) body = json as Record<string, unknown>;
  }
  if (!body) return Response.json({ ok: false }, { status: 400 });
  const supabase = anonymous();

  if (body.ping === true) {
    const { data } = await supabase.rpc("ping_lead_form", { form_token: token });
    return Response.json({ ok: data === true }, { status: data === true ? 200 : 404 });
  }

  const answers = readAnswers(body);
  const respondent = Array.isArray(body.answers) && typeof body.email === "string" ? body.email.trim() : null;
  const { name, phone, email } = readContact(answers, respondent);
  if (!name && !phone && !email) {
    return Response.json(
      { ok: false, reason: "Няма име, телефон или имейл. Провери полетата (Name: Име, Телефон, Имейл; Value: полето от Facebook)." },
      { status: 422 }
    );
  }
  const { data, error } = await supabase.rpc("submit_lead_form", {
    form_token: token,
    lead_name: name,
    lead_phone: phone,
    lead_email: email,
    answers,
  });
  if (error) console.error("A form answer failed:", error.message);
  if (!data) return Response.json({ ok: false, reason: "Няма такава папка или е архивирана. Копирай адреса наново от BRIXA." }, { status: 404 });
  return Response.json({ ok: true });
}
