import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { StarRating } from "@/components/listing/StarRating";
import { AgencyFooter, BrokerCard, PublicHeader } from "@/components/PublicContact";
import { ViewBeacon } from "@/components/PublicPageTools";
import { getSharedAnalysis } from "@/lib/analysis-share";
import { specsLine } from "@/lib/analysis-doc";
import { sofiaToday } from "@/lib/dates";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { rentalYield } from "@/lib/yield";

export async function generateMetadata({ params }: PageProps<"/a/[token]">): Promise<Metadata> {
  const { token } = await params;
  const [data, { t }] = await Promise.all([getSharedAnalysis(token), getI18n()]);
  if (!data || data === "unavailable") return { title: { absolute: "BRIXA" }, robots: { index: false } };
  const title = `${data.audience === "owner" ? t.rating.pdf.ownerTitle : t.rating.pdf.buyerTitle}: ${data.property.title}`;
  return {
    title: { absolute: title },
    robots: { index: false, follow: false },
    openGraph: { title, images: data.property.photoUrl ? [data.property.photoUrl] : [] },
  };
}

/** A market analysis sent to a client: the verdict, the price, the comparables — and the PDF. */
export default async function SharedAnalysisPage({ params }: PageProps<"/a/[token]">) {
  const { token } = await params;
  const [data, { t, lang }] = await Promise.all([getSharedAnalysis(token), getI18n()]);
  if (!data) notFound();
  if (data === "unavailable") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-lg font-semibold">{t.rating.unavailable}</p>
      </main>
    );
  }

  const { audience, analysis, property: p, broker, agency } = data;
  const rating = analysis.rating!;
  const facts = analysis.facts;
  const P = t.rating.pdf;
  const euro = (value: number) => formatPrice(value, "EUR", lang) ?? "";
  const unit = p.operation === "rent" ? t.market.perSqmMonth : t.market.perSqm;
  const sqm = (value: number) => `${formatNumber(value, lang)} ${unit}`;
  const diff =
    Math.abs(rating.diff) < 0.005 ? t.rating.near : fmt(rating.diff > 0 ? t.rating.over : t.rating.under, { pct: formatNumber(Math.abs(rating.diff) * 100, lang, 0) ?? "0" });
  const place = [p.neighborhood, p.settlement].filter(Boolean).join(", ");
  const specs = specsLine(
    { subtype: p.subtype ? localName(p.subtype, lang) : null, area: p.area, rooms: p.rooms, floor: p.floor, totalFloors: p.totalFloors },
    t,
    lang
  );
  const y = p.operation === "sale" ? rentalYield(p.price, p.currency, p.expectedRent, p.rentEstimate) : null;
  const estimate = rating.estimate;
  const advice =
    audience === "owner"
      ? estimate
        ? fmt(P.ownerAdvice, { low: euro(estimate.low), high: euro(estimate.high) })
        : null
      : rating.diff < 0
        ? fmt(P.buyerAdvice, { pct: formatNumber(Math.abs(rating.diff) * 100, lang, 0) ?? "0" })
        : null;
  const comparables = [
    ...analysis.added.map((c) => ({ source: c.source ?? "—", place: c.title ?? "—", area: c.area, floor: c.floor, price: c.priceEur, sqm: c.sqm })),
    ...analysis.listings
      .filter((c) => c.title !== p.title)
      .map((c) => ({ source: P.ourListing, place: c.neighborhood ?? c.title, area: c.area, floor: c.floor, price: c.priceEur, sqm: c.sqm })),
  ].slice(0, 16);
  const cell = "px-3 py-2";

  return (
    <main className="shared-page mx-auto max-w-3xl px-4 pb-16 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
      <ViewBeacon token={token} kind="analysis" />
      <PublicHeader agency={agency} />

      <h1 className="text-2xl font-bold tracking-tight">{audience === "owner" ? P.ownerTitle : P.buyerTitle}</h1>
      <p className="mt-1 text-sm text-muted">
        {audience === "owner" ? P.preparedFor : P.preparedForBuyer} · {formatDate(sofiaToday(), lang)}
      </p>

      {/* the listing */}
      <section className="mt-5 grid grid-cols-1 gap-4 overflow-hidden rounded-3xl border border-line bg-surface sm:grid-cols-[220px_minmax(0,1fr)]">
        {p.photoUrl && <img src={p.photoUrl} alt={p.title} className="h-48 w-full object-cover sm:h-full" />}
        <div className="min-w-0 p-5">
          <p className="text-lg font-semibold">{p.title}</p>
          {place && <p className="text-muted">{place}</p>}
          {specs && <p className="mt-1 text-sm text-fg-2">{specs}</p>}
          <p className="mt-3 text-2xl font-bold">{formatPrice(p.price, p.currency, lang) ?? "—"}</p>
        </div>
      </section>

      {/* how it stands */}
      <section className="mt-5 rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-bold">{P.verdict}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <StarRating stars={rating.stars} label={t.rating.labels[rating.stars]} title={fmt(t.rating.stars, { n: rating.stars })} size="lg" />
          <span className="text-sm text-muted">{diff}</span>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-raised/60 px-4 py-3.5">
            <dt className="text-sm text-muted">{t.rating.marketSqm}</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">{sqm(rating.benchSqm)}</dd>
          </div>
          {estimate && (
            <div className="rounded-2xl bg-accent-soft px-4 py-3.5">
              <dt className="text-sm text-muted">{audience === "owner" ? t.rating.range : P.marketValue}</dt>
              <dd className="mt-1 text-xl font-bold text-accent-fg tabular-nums">
                {euro(estimate.low)} – {euro(estimate.high)}
              </dd>
            </div>
          )}
          {facts.price_eur !== null && (
            <div className="rounded-2xl bg-raised/60 px-4 py-3.5">
              <dt className="text-sm text-muted">{t.rating.now}</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums">{euro(facts.price_eur)}</dd>
              {facts.own_sqm !== null && <dd className="text-xs text-muted">{sqm(facts.own_sqm)}</dd>}
            </div>
          )}
        </dl>
        {advice && <p className="mt-4 font-semibold">{advice}</p>}
        <ul className="mt-3 space-y-1 text-sm text-muted">
          <li>{fmt(t.rating.basis[rating.basis], { n: rating.pool, added: rating.added })}</li>
          {audience === "owner" && facts.expected_final !== null && (
            <li>
              {t.rating.expected}: {euro(facts.expected_final)}
            </li>
          )}
          {audience === "owner" && facts.sold.avg_days !== null && (
            <li>
              {t.rating.days}: {fmt(t.rating.daysValue, { n: facts.sold.avg_days })}
            </li>
          )}
          {y && (
            <li>
              {fmt(P.yieldLine, { rent: euro(y.rent), real: `${formatNumber(y.real, lang, 1)}%`, gross: `${formatNumber(y.gross, lang, 1)}%` })}
            </li>
          )}
        </ul>
        <a href={`/a/${token}/pdf`} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent no-print">
          <FileDown className="size-4" />
          {t.rating.download}
        </a>
      </section>

      {comparables.length > 0 && (
        <section className="mt-5 rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-bold">{P.comparables}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className={cell}>{P.source}</th>
                  <th className={cell}>{P.place}</th>
                  <th className={`${cell} text-right`}>{t.units.sqm}</th>
                  <th className={`${cell} text-right`}>{t.rating.floor}</th>
                  <th className={`${cell} text-right`}>{P.price}</th>
                  <th className={`${cell} text-right`}>{P.perSqm}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {comparables.map((c, i) => (
                  <tr key={i}>
                    <td className={cell}>{c.source}</td>
                    <td className={cell}>{c.place}</td>
                    <td className={`${cell} text-right tabular-nums`}>{formatNumber(c.area, lang, 1)}</td>
                    <td className={`${cell} text-right tabular-nums`}>{c.floor ?? "—"}</td>
                    <td className={`${cell} text-right tabular-nums`}>{euro(c.price)}</td>
                    <td className={`${cell} text-right tabular-nums`}>{formatNumber(c.sqm, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {audience === "owner" && analysis.sales.length > 0 && (
        <section className="mt-5 rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-bold">{t.rating.sales}</h2>
          <ul className="mt-3 divide-y divide-line-soft text-sm">
            {analysis.sales.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-muted">
                  {formatDate(s.soldOn, lang)} · {s.sameNeighborhood ? (p.neighborhood ?? t.rating.neighborhood) : (p.settlement ?? t.rating.town)} ·{" "}
                  {formatNumber(s.area, lang, 1)} {t.units.sqm}
                </span>
                <span className="font-semibold tabular-nums">
                  {euro(s.priceEur)} <span className="text-xs font-normal text-muted">({formatNumber(s.sqm, lang)} {P.perSqm})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-5 text-xs text-subtle">{P.disclaimer}</p>

      {broker && <BrokerCard broker={{ ...broker, job_title: null }} subject={`${audience === "owner" ? P.ownerTitle : P.buyerTitle}: ${p.title}`} t={t} />}
      <AgencyFooter agency={agency} />
    </main>
  );
}
