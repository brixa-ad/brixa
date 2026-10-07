import { getSharedAnalysis } from "@/lib/analysis-share";
import { pdfResponse, renderAnalysisPdf, specsLine } from "@/lib/analysis-doc";
import { localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";

/** The PDF of a sent analysis (the same as the broker's). */
export async function GET(_: Request, ctx: RouteContext<"/a/[token]/pdf">) {
  const { token } = await ctx.params;
  const [data, { t, lang }] = await Promise.all([getSharedAnalysis(token), getI18n()]);
  if (!data || data === "unavailable") return new Response("Not found", { status: 404 });
  const { audience, analysis, property: p, broker, agency } = data;

  const buffer = await renderAnalysisPdf(
    audience,
    analysis,
    {
      operation: p.operation,
      title: p.title,
      place: [p.neighborhood, p.settlement].filter(Boolean).join(", "),
      neighborhood: p.neighborhood,
      town: p.settlement,
      specs: specsLine(
        { subtype: p.subtype ? localName(p.subtype, lang) : null, area: p.area, rooms: p.rooms, floor: p.floor, totalFloors: p.totalFloors },
        t,
        lang
      ),
      price: p.price,
      currency: p.currency,
      expectedRent: p.expectedRent,
      rentEstimate: p.rentEstimate,
    },
    {
      agencyName: agency.name,
      agencyContacts: [agency.name, agency.phone, agency.email, agency.website].filter(Boolean).join(" · "),
      logoUrl: agency.logoUrl,
      broker: broker ? `${t.rating.pdf.broker}: ${[broker.name, broker.phone, broker.email].filter(Boolean).join(" · ")}` : null,
      photoUrl: p.photoUrl,
    },
    t,
    lang
  );
  return pdfResponse(buffer, `${audience === "owner" ? t.rating.pdf.ownerTitle : t.rating.pdf.buyerTitle} - ${p.title}`, token);
}
