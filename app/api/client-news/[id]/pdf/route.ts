import { pdfResponse } from "@/lib/analysis-doc";
import { avatarUrl } from "@/lib/avatar";
import { getAgency } from "@/lib/agency";
import { sofiaToday } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { isNewsKind, type NewsData } from "@/lib/news";
import { hasPdf, renderNewsPdf } from "@/lib/news-doc";
import { firstName } from "@/lib/programs";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** A client's piece of news as a document: the agency's logo, the numbers, the letter, the broker (who downloads it). */
export async function GET(_: Request, ctx: RouteContext<"/api/client-news/[id]/pdf">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const supabase = await createClient();
  // only the ones this person may see (the client's broker and the managers)
  const { data: row } = await supabase
    .from("client_news")
    .select("id, kind, data, created_on, client:clients(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!row || !isNewsKind(row.kind) || !hasPdf(row.kind)) return new Response("Not found", { status: 404 });
  const client = row.client as unknown as { full_name: string } | null;

  const [{ t, lang }, agency, { data: me }, { data: rateRows }] = await Promise.all([
    getI18n(),
    getAgency(session.organizationId),
    supabase.from("profiles").select("full_name, email, phone, job_title, avatar_path").eq("id", session.userId).maybeSingle(),
    supabase.from("mortgage_rates").select("month, rate").order("month", { ascending: false }).limit(6),
  ]);
  const name = me?.full_name || session.fullName || session.email;
  const buffer = await renderNewsPdf(
    {
      kind: row.kind,
      data: row.data as NewsData,
      createdOn: row.created_on as string,
      client: { name: client?.full_name ?? "", firstName: firstName(client?.full_name ?? "") },
      agency: {
        name: agency?.name ?? "",
        logoUrl: agency?.logoUrl ?? null,
        contacts: [agency?.name, agency?.phone, agency?.email, agency?.website].filter(Boolean).join(" · "),
      },
      broker: {
        name,
        role: me?.job_title ?? null,
        phone: me?.phone ?? null,
        email: me?.email ?? session.email,
        photoUrl: avatarUrl(me?.avatar_path),
      },
      rates: ((rateRows ?? []) as { month: string; rate: number }[]).map((r) => ({ month: r.month.slice(0, 7), rate: Number(r.rate) })),
      today: sofiaToday(),
    },
    t,
    lang
  );
  return pdfResponse(buffer, `${t.news.kinds[row.kind]} - ${client?.full_name ?? ""}`, id);
}
