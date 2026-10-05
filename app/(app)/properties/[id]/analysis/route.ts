import { renderToBuffer } from "@react-pdf/renderer";
import { getAgency } from "@/lib/agency";
import { getAnalysis } from "@/lib/analysis";
import { sofiaToday } from "@/lib/dates";
import { formatDate, formatNumber, formatPrice, settlementLabel } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { AnalysisPdf, type PdfImage } from "@/lib/pdf/analysis-pdf";
import { getProperty } from "@/lib/properties";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { parseEstimate, rentalYield } from "@/lib/yield";

/** A photo or a logo for the PDF (JPEG or PNG only; anything else is left out). */
async function pdfImage(url: string | null | undefined): Promise<PdfImage> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    const format = type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : null;
    if (!format) return null;
    return { data: Buffer.from(await response.arrayBuffer()), format };
  } catch {
    return null;
  }
}

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
  const [agency, photo, { data: rentRow }] = await Promise.all([
    getAgency(property.organization_id),
    pdfImage(property.photos[0]?.url),
    sale ? supabase.rpc("property_rent_estimate", { target_property: id }) : Promise.resolve({ data: null }),
  ]);
  const logo = await pdfImage(agency?.logoUrl);

  const p = t.rating.pdf;
  const facts = analysis.facts;
  const euro = (value: number) => formatPrice(value, "EUR", lang) ?? "";
  const unit = property.operation_type === "rent" ? t.market.perSqmMonth : t.market.perSqm;
  const sqm = (value: number) => `${formatNumber(value, lang)} ${unit}`;
  const pct = (value: number) => `${formatNumber(Math.abs(value) * 100, lang, 0)}%`;
  const diff =
    Math.abs(rating.diff) < 0.005 ? t.rating.near : fmt(rating.diff > 0 ? t.rating.over : t.rating.under, { pct: formatNumber(Math.abs(rating.diff) * 100, lang, 0) ?? "0" });

  const place = [property.neighborhood?.name, property.settlement && settlementLabel(property.settlement)].filter(Boolean).join(", ");
  const specs = [
    property.subtype ? localName(property.subtype, lang) : null,
    property.area ? `${formatNumber(property.area, lang, 1)} ${t.units.sqm}` : null,
    property.rooms ? fmt(t.listing.rooms, { n: property.rooms }) : null,
    property.floor !== null ? (property.total_floors ? `${t.form.floor} ${property.floor}/${property.total_floors}` : `${t.form.floor} ${property.floor}`) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // the rent it would bring (a listing for sale)
  const y = sale ? rentalYield(property.current_price, property.currency, property.expected_rent, parseEstimate(rentRow)) : null;
  const yieldLine = y
    ? fmt(p.yieldLine, {
        rent: euro(y.rent),
        real: `${formatNumber(y.real, lang, 1)}%`,
        gross: `${formatNumber(y.gross, lang, 1)}%`,
      })
    : null;

  const estimate = rating.estimate;
  const tiles = [
    { label: t.rating.marketSqm, value: sqm(rating.benchSqm) },
    ...(estimate
      ? [{ label: audience === "owner" ? t.rating.range : p.marketValue, value: `${euro(estimate.low)} – ${euro(estimate.high)}`, accent: true }]
      : []),
    ...(facts.price_eur !== null
      ? [{ label: t.rating.now, value: facts.own_sqm !== null ? `${euro(facts.price_eur)} · ${sqm(facts.own_sqm)}` : euro(facts.price_eur) }]
      : []),
  ];
  const notes = [
    fmt(t.rating.basis[rating.basis], { n: rating.pool, added: rating.added }),
    ...(audience === "owner"
      ? [
          facts.expected_final !== null ? `${t.rating.expected}: ${euro(facts.expected_final)}` : null,
          facts.sold.avg_days !== null ? `${t.rating.days}: ${fmt(t.rating.daysValue, { n: facts.sold.avg_days })}` : null,
          facts.discount !== null ? `${t.rating.haggling}: ${pct(facts.discount)}` : null,
        ]
      : []),
    yieldLine,
  ].filter((x): x is string => Boolean(x));
  const advice =
    audience === "owner"
      ? estimate
        ? fmt(p.ownerAdvice, { low: euro(estimate.low), high: euro(estimate.high) })
        : null
      : rating.diff < 0
        ? fmt(p.buyerAdvice, { pct: formatNumber(Math.abs(rating.diff) * 100, lang, 0) ?? "0" })
        : null;

  const area = (value: number) => formatNumber(value, lang, 1) ?? "";
  const comparables = {
    head: [p.source, p.place, t.units.sqm, t.rating.floor, p.price, p.perSqm],
    rows: [
      ...analysis.added.map((c) => [c.source ?? "—", c.title ?? "—", area(c.area), c.floor === null ? "—" : String(c.floor), euro(c.priceEur), formatNumber(c.sqm, lang) ?? ""]),
      ...analysis.listings.map((c) => [
        p.ourListing,
        [c.neighborhood, c.status === "reserved" ? p.reserved : null].filter(Boolean).join(" · ") || c.title,
        area(c.area),
        c.floor === null ? "—" : String(c.floor),
        euro(c.priceEur),
        formatNumber(c.sqm, lang) ?? "",
      ]),
    ].slice(0, 16),
  };
  const sales = {
    head: [p.soldOn, p.place, t.units.sqm, p.price, p.perSqm],
    rows: analysis.sales.map((x) => [
      formatDate(x.soldOn, lang),
      x.sameNeighborhood ? (property.neighborhood?.name ?? t.rating.neighborhood) : property.settlement ? settlementLabel(property.settlement) : t.rating.town,
      area(x.area),
      euro(x.priceEur),
      formatNumber(x.sqm, lang) ?? "",
    ]),
  };

  const broker = property.broker
    ? `${p.broker}: ${[property.broker.full_name || property.broker.email, property.broker.phone, property.broker.email].filter(Boolean).join(" · ")}`
    : null;

  const buffer = await renderToBuffer(
    AnalysisPdf({
      audience,
      title: audience === "owner" ? p.ownerTitle : p.buyerTitle,
      preparedFor: audience === "owner" ? p.preparedFor : p.preparedForBuyer,
      date: formatDate(sofiaToday(), lang),
      agency: {
        name: agency?.name ?? session.organizationName,
        logo,
        contacts: [agency?.name ?? session.organizationName, agency?.phone, agency?.email, agency?.website].filter(Boolean).join(" · "),
      },
      broker,
      property: {
        title: property.title,
        place,
        specs,
        price: formatPrice(property.current_price, property.currency, lang) ?? "—",
        photo,
      },
      verdict: { stars: rating.stars, label: t.rating.labels[rating.stars], diff, tiles, notes, advice },
      comparables,
      comparablesTitle: p.comparables,
      sales,
      salesTitle: t.rating.sales,
      disclaimer: p.disclaimer,
      pageLabel: p.page,
    })
  );

  const name = `${audience === "owner" ? p.ownerTitle : p.buyerTitle} - ${property.title}`.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 120);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="brixa-analysis-${id.slice(0, 8)}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}.pdf`,
      "Cache-Control": "private, no-store",
    },
  });
}
