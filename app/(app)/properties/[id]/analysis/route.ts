import { getAgency } from "@/lib/agency";
import { getAnalysis } from "@/lib/analysis";
import { pdfResponse, renderAnalysisPdf, specsLine } from "@/lib/analysis-doc";
import { settlementLabel } from "@/lib/format";
import { localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getProperty } from "@/lib/properties";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { parseEstimate } from "@/lib/yield";

/** The market analysis of a listing as a PDF: ?for=owner (the default) or ?for=buyer (only at 4–5 stars). */
export async function GET(request: Request, ctx: RouteContext<"/properties/[id]/analysis">) {
  const { id } = await ctx.params;
  const audience = new URL(request.url).searchParams.get("for") === "buyer" ? "buyer" : "owner";
  const session = await getSession();
  if (!session) return new Response("Not found", { status: 404 });

  const [property, analysis, { t, lang }] = await Promise.all([getProperty(id), getAnalysis(id), getI18n()]);
  const rating = analysis?.rating;
  if (!property || !analysis || !rating) return new Response("Not found", { status: 404 });
  if (audience === "buyer" && rating.stars < 4) return new Response("Forbidden", { status: 403 });

  const supabase = await createClient();
  const sale = property.operation_type === "sale";
  const [agency, { data: rentRow }] = await Promise.all([
    getAgency(property.organization_id),
    sale ? supabase.rpc("property_rent_estimate", { target_property: id }) : Promise.resolve({ data: null }),
  ]);
  const town = property.settlement ? settlementLabel(property.settlement) : null;
  const agencyName = agency?.name ?? session.organizationName;

  const buffer = await renderAnalysisPdf(
    audience,
    analysis,
    {
      operation: property.operation_type,
      title: property.title,
      place: [property.neighborhood?.name, town].filter(Boolean).join(", "),
      neighborhood: property.neighborhood?.name ?? null,
      town,
      specs: specsLine(
        {
          subtype: property.subtype ? localName(property.subtype, lang) : null,
          area: property.area,
          rooms: property.rooms,
          floor: property.floor,
          totalFloors: property.total_floors,
        },
        t,
        lang
      ),
      price: property.current_price,
      currency: property.currency,
      expectedRent: property.expected_rent,
      rentEstimate: parseEstimate(rentRow),
    },
    {
      agencyName,
      agencyContacts: [agencyName, agency?.phone, agency?.email, agency?.website].filter(Boolean).join(" · "),
      logoUrl: agency?.logoUrl ?? null,
      broker: property.broker
        ? `${t.rating.pdf.broker}: ${[property.broker.full_name || property.broker.email, property.broker.phone, property.broker.email].filter(Boolean).join(" · ")}`
        : null,
      photoUrl: property.photos[0]?.url ?? null,
    },
    t,
    lang
  );

  return pdfResponse(buffer, `${audience === "owner" ? t.rating.pdf.ownerTitle : t.rating.pdf.buyerTitle} - ${property.title}`, id);
}
