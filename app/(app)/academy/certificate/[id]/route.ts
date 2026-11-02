import { EXAM_QUESTIONS, type AcademyCertificate } from "@/lib/academy";
import { getAgency } from "@/lib/agency";
import { pdfResponse } from "@/lib/analysis-doc";
import { renderCertificatePdf } from "@/lib/certificate-doc";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { siteOrigin } from "@/lib/open-houses";
import { getSession } from "@/lib/session";
import { UUID } from "@/lib/share";
import { createClient } from "@/lib/supabase/server";

/** An academy certificate as an A4 PDF: its holder and their leaders. */
export async function GET(_request: Request, ctx: RouteContext<"/academy/certificate/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const session = await getSession();
  if (!session) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("academy_certificates")
    .select("id, number, code, organization_id, profile_id, attempt_id, level, score, holder_name, agency_name, signer_name, issued_on, valid_until")
    .eq("id", id)
    .maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });
  const certificate = data as AcademyCertificate & { organization_id: string; attempt_id: string | null };

  const [{ t, lang }, agency, origin, { data: attempt }] = await Promise.all([
    getI18n(),
    getAgency(certificate.organization_id),
    siteOrigin(),
    certificate.attempt_id
      ? supabase.from("academy_attempts").select("total").eq("id", certificate.attempt_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const buffer = await renderCertificatePdf(
    certificate,
    { name: agency?.name ?? certificate.agency_name, logoUrl: agency?.logoUrl ?? null },
    `${origin}/v/${certificate.code}`,
    Number(attempt?.total) || EXAM_QUESTIONS,
    t,
    lang
  );
  return pdfResponse(buffer, fmt(t.academy.pdf.file, { name: certificate.holder_name }), id, "brixa-certificate");
}
