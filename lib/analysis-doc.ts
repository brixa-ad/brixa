import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { Analysis } from "./analysis";
import { sofiaToday } from "./dates";
import { formatDate, formatNumber, formatPrice } from "./format";
import { fmt, type Dictionary, type Lang } from "./i18n/dictionaries";
import { AnalysisPdf, type PdfImage } from "./pdf/analysis-pdf";
import { rentalYield, type RentEstimate } from "./yield";

/** The listing as the analysis speaks of it. */
export type AnalysisSubject = {
  operation: string;
  title: string;
  /** "Чайка, гр. Варна" */
  place: string;
  neighborhood: string | null;
  town: string | null;
  /** "Двустаен апартамент · 64 м² · 2 стаи · Етаж 4/8" */
  specs: string;
  price: number | null;
  currency: string;
  expectedRent: number | null;
  rentEstimate: RentEstimate | null;
};

/** Whose analysis it is: the agency, its logo, the broker, the listing's photo. */
export type AnalysisBranding = {
  agencyName: string;
  agencyContacts: string;
  logoUrl: string | null;
  broker: string | null;
  photoUrl: string | null;
};

/** "Двустаен апартамент · 64 м² · 2 стаи · Етаж 4/8" */
export function specsLine(
  parts: { subtype: string | null; area: number | null; rooms: number | null; floor: number | null; totalFloors: number | null },
  t: Dictionary,
  lang: Lang
) {
  return [
    parts.subtype,
    parts.area ? `${formatNumber(parts.area, lang, 1)} ${t.units.sqm}` : null,
    parts.rooms ? fmt(t.listing.rooms, { n: parts.rooms }) : null,
    parts.floor !== null ? (parts.totalFloors ? `${t.form.floor} ${parts.floor}/${parts.totalFloors}` : `${t.form.floor} ${parts.floor}`) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

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

/** The analysis on A4: for the owner (the price to ask) or for a buyer (a good price). */
export async function renderAnalysisPdf(
  audience: "owner" | "buyer",
  analysis: Analysis,
  subject: AnalysisSubject,
  branding: AnalysisBranding,
  t: Dictionary,
  lang: Lang
): Promise<Buffer> {
  const rating = analysis.rating!;
  const [photo, logo] = await Promise.all([pdfImage(branding.photoUrl), pdfImage(branding.logoUrl)]);
  const p = t.rating.pdf;
  const facts = analysis.facts;
  const euro = (value: number) => formatPrice(value, "EUR", lang) ?? "";
  const unit = subject.operation === "rent" ? t.market.perSqmMonth : t.market.perSqm;
  const sqm = (value: number) => `${formatNumber(value, lang)} ${unit}`;
  const pct = (value: number) => `${formatNumber(Math.abs(value) * 100, lang, 0)}%`;
  const diff =
    Math.abs(rating.diff) < 0.005 ? t.rating.near : fmt(rating.diff > 0 ? t.rating.over : t.rating.under, { pct: formatNumber(Math.abs(rating.diff) * 100, lang, 0) ?? "0" });

  // the rent it would bring (a listing for sale)
  const y = subject.operation === "sale" ? rentalYield(subject.price, subject.currency, subject.expectedRent, subject.rentEstimate) : null;
  const yieldLine = y
    ? fmt(p.yieldLine, { rent: euro(y.rent), real: `${formatNumber(y.real, lang, 1)}%`, gross: `${formatNumber(y.gross, lang, 1)}%` })
    : null;

  const estimate = rating.estimate;
  const tiles = [
    { label: t.rating.marketSqm, value: sqm(rating.benchSqm) },
    ...(estimate ? [{ label: audience === "owner" ? t.rating.range : p.marketValue, value: `${euro(estimate.low)} – ${euro(estimate.high)}`, accent: true }] : []),
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
      x.sameNeighborhood ? (subject.neighborhood ?? t.rating.neighborhood) : (subject.town ?? t.rating.town),
      area(x.area),
      euro(x.priceEur),
      formatNumber(x.sqm, lang) ?? "",
    ]),
  };

  return renderToBuffer(
    AnalysisPdf({
      audience,
      title: audience === "owner" ? p.ownerTitle : p.buyerTitle,
      preparedFor: audience === "owner" ? p.preparedFor : p.preparedForBuyer,
      date: formatDate(sofiaToday(), lang),
      agency: { name: branding.agencyName, logo, contacts: branding.agencyContacts },
      broker: branding.broker,
      property: {
        title: subject.title,
        place: subject.place,
        specs: subject.specs,
        price: formatPrice(subject.price, subject.currency, lang) ?? "—",
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
}

/** The PDF as a download (its file name in the reader's language). */
export function pdfResponse(buffer: Buffer, name: string, id: string) {
  const clean = name.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 120);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="brixa-analysis-${id.slice(0, 8)}.pdf"; filename*=UTF-8''${encodeURIComponent(clean)}.pdf`,
      "Cache-Control": "private, no-store",
    },
  });
}
