import { FileDown, Lock } from "lucide-react";
import { Panel } from "@/components/listing/ListingParts";
import { StarRating } from "@/components/listing/StarRating";
import { buttonClass } from "@/components/ui/form";
import type { Analysis } from "@/lib/analysis";
import { formatNumber, formatPrice } from "@/lib/format";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import { AiComparables } from "./AiComparables";
import { AnalysisSendButton, AnalysisShareList, type AnalysisShareRow } from "./AnalysisShare";
import { ComparablesEditor } from "./ComparablesEditor";
import type { ShareClient } from "./ShareDialog";

/** "8% над пазара" / "12% под пазара" / "В рамките на пазара". */
export function diffText(diff: number, t: Dictionary, lang: Lang) {
  const pct = formatNumber(Math.abs(diff) * 100, lang, 0) ?? "0";
  if (Math.abs(diff) < 0.005) return t.rating.near;
  return fmt(diff > 0 ? t.rating.over : t.rating.under, { pct });
}

/**
 * A listing against the market: the stars, the market's €/m², the price it suggests, the comparables
 * from the portals (added here) and the two PDFs — for the owner, and (at 4–5 stars) for a buyer.
 */
export function AnalysisPanel({
  analysis,
  propertyId,
  canEdit,
  t,
  lang,
  title,
  clients,
  ownerClientId,
  shares,
}: {
  analysis: Analysis;
  propertyId: string;
  canEdit: boolean;
  t: Dictionary;
  lang: Lang;
  title: string;
  /** whom a link may be for */
  clients: ShareClient[];
  ownerClientId: string | null;
  shares: AnalysisShareRow[];
}) {
  const { facts, rating } = analysis;
  const rent = facts.operation === "rent";
  const unit = rent ? t.market.perSqmMonth : t.market.perSqm;
  const euro = (value: number) => formatPrice(value, "EUR", lang) ?? "";
  const tile = "rounded-2xl bg-raised/60 px-4 py-3.5";

  return (
    <Panel title={t.rating.title} id="analysis">
      {rating ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StarRating stars={rating.stars} label={t.rating.labels[rating.stars]} title={fmt(t.rating.stars, { n: rating.stars })} size="lg" />
            <span className="text-sm text-muted">{diffText(rating.diff, t, lang)}</span>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={tile}>
              <dt className="text-sm text-muted">{t.rating.marketSqm}</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums">
                {formatNumber(rating.benchSqm, lang)} {unit}
              </dd>
            </div>
            {rating.estimate && (
              <div className="rounded-2xl bg-accent-soft px-4 py-3.5">
                <dt className="text-sm text-muted">{t.rating.range}</dt>
                <dd className="mt-1 text-xl font-bold text-accent-fg tabular-nums">
                  {euro(rating.estimate.low)} – {euro(rating.estimate.high)}
                </dd>
              </div>
            )}
            {facts.price_eur !== null && (
              <div className={tile}>
                <dt className="text-sm text-muted">{t.rating.now}</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">{euro(facts.price_eur)}</dd>
                {facts.own_sqm !== null && (
                  <dd className="text-xs text-muted">
                    {formatNumber(facts.own_sqm, lang)} {unit}
                  </dd>
                )}
              </div>
            )}
          </dl>
          <p className="mt-3 text-sm text-muted">
            {fmt(t.rating.basis[rating.basis], { n: rating.pool, added: rating.added })}
            {facts.expected_final !== null && ` ${t.rating.expected}: ${euro(facts.expected_final)}.`}
            {facts.sold.avg_days !== null && ` ${t.rating.days}: ${fmt(t.rating.daysValue, { n: facts.sold.avg_days })}.`}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">{t.rating.none}</p>
      )}

      <div className="mt-5 border-t border-line-soft pt-4">
        <h3 className="text-base font-semibold">{t.rating.compsTitle}</h3>
        {canEdit && <p className="mt-0.5 mb-3 text-sm text-muted">{t.rating.compsHint}</p>}
        <ComparablesEditor propertyId={propertyId} items={analysis.added} canEdit={canEdit} />
        {canEdit && <AiComparables propertyId={propertyId} ready={Boolean(process.env.ANTHROPIC_API_KEY)} />}
      </div>

      {rating && (
        <div className="mt-5 border-t border-line-soft pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <AnalysisSendButton propertyId={propertyId} title={title} audience="owner" clients={clients} defaultClientId={ownerClientId} primary />
            )}
            <a href={`/properties/${propertyId}/analysis?for=owner`} className={buttonClass.secondary}>
              <FileDown className="size-4" />
              {t.rating.pdfOwner}
            </a>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {rating.stars >= 4 ? (
              <>
                <AnalysisSendButton propertyId={propertyId} title={title} audience="buyer" clients={clients} />
                <a href={`/properties/${propertyId}/analysis?for=buyer`} className={buttonClass.secondary}>
                  <FileDown className="size-4" />
                  {t.rating.pdfBuyer}
                </a>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                <Lock className="size-3.5" />
                {t.rating.pdfBuyerLocked}
              </span>
            )}
          </div>
          <AnalysisShareList rows={shares} />
        </div>
      )}
    </Panel>
  );
}
