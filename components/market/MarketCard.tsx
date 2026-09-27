import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/form";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import { MARKET_TOLERANCE, type MarketFacts } from "@/lib/market";

/** "+10% над пазара" / "−7% под пазара" / "В пазара". */
export function MarketDiffChip({ diff, t, lang }: { diff: number; t: Dictionary; lang: Lang }) {
  const pct = formatNumber(Math.abs(diff) * 100, lang, 0) ?? "0";
  const [label, tone] =
    diff >= MARKET_TOLERANCE
      ? [fmt(t.market.above, { pct }), "bg-warning/10 text-warning"]
      : diff <= -MARKET_TOLERANCE
        ? [fmt(t.market.below, { pct }), "bg-success/10 text-success"]
        : [t.market.near, "bg-raised text-fg-2"];
  return <span className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}

/** On a listing: its €/m² against the neighborhood, a price range, and what similar listings did. */
export function MarketCard({
  facts,
  place,
  town,
  t,
  lang,
}: {
  facts: MarketFacts;
  /** the neighborhood's name, when the reference is the neighborhood's */
  place: string | null;
  town: string | null;
  t: Dictionary;
  lang: Lang;
}) {
  const unit = facts.operation === "rent" ? t.market.perSqmMonth : t.market.perSqm;
  const sqm = (value: number | null) => (value === null ? "—" : `${formatNumber(value, lang)} ${unit}`);
  const euro = (value: number) => formatPrice(value, "EUR", lang);
  const scope = facts.scope === "neighborhood" ? t.market.scopeNeighborhood : t.market.scopeCity;
  const bench = facts.benchmark;
  const benchLabel =
    bench?.basis === "reference"
      ? fmt(t.market.marketFor, {
          place: (facts.reference?.level === "neighborhood" ? place : town) ?? t.market.wholeTown,
        })
      : t.market.marketListings;

  return (
    <Card
      title={
        <span className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <TrendingUp className="size-4 text-brand-cyan" />
            {t.market.cardTitle}
          </span>
          <Link href="/market" className="text-sm font-medium text-accent-fg hover:underline">
            {t.market.open} →
          </Link>
        </span>
      }
    >
      {facts.own_sqm === null ? (
        <p className="text-sm text-muted">{t.market.noArea}</p>
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{t.market.ownSqm}</dt>
              <dd className="font-semibold tabular-nums">{sqm(facts.own_sqm)}</dd>
            </div>
            {bench && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="min-w-0 text-muted">
                  {benchLabel}
                  {bench.basis === "reference" && facts.reference && (
                    <span className="block text-[11px] text-subtle">
                      {fmt(t.market.sourceLine, {
                        source: facts.reference.source ?? "—",
                        date: formatDate(facts.reference.as_of, lang),
                      })}
                    </span>
                  )}
                </dt>
                <dd className="shrink-0 font-semibold tabular-nums">{sqm(bench.sqm)}</dd>
              </div>
            )}
          </dl>

          {facts.diff !== null && <MarketDiffChip diff={facts.diff} t={t} lang={lang} />}

          {!bench && (
            <p className="text-xs text-muted">
              {!facts.apartment ? t.market.notApartment : facts.active.count > 0 ? t.market.noReference : t.market.notEnough}
            </p>
          )}

          {(facts.estimate || facts.expected_final !== null) && (
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-raised/60 p-3">
              {facts.estimate && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted">{t.market.estimate}</dt>
                  <dd className="font-semibold tabular-nums">
                    {euro(facts.estimate.low)} – {euro(facts.estimate.high)}
                  </dd>
                  {bench && facts.area !== null && (
                    <p className="text-[11px] text-subtle">
                      {fmt(t.market.estimateHint, { area: formatNumber(facts.area, lang, 2) ?? "", sqm: sqm(bench.sqm) })}
                    </p>
                  )}
                </div>
              )}
              {facts.expected_final !== null && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted">{t.market.expectedFinal}</dt>
                  <dd className="font-semibold tabular-nums text-accent-fg">{euro(facts.expected_final)}</dd>
                  <p className="text-[11px] text-subtle">
                    {facts.sold.count >= 3
                      ? t.market.expectedBySales
                      : fmt(t.market.expectedByHaggling, { pct: formatNumber((facts.discount ?? 0) * 100, lang, 1) ?? "0" })}
                  </p>
                </div>
              )}
            </dl>
          )}

          {(facts.active.count > 0 || facts.sold.count > 0) && (
            <ul className="space-y-1 text-xs text-muted">
              {facts.active.count > 0 && (
                <li>
                  {fmt(t.market.similarActive, { scope, count: facts.active.count, sqm: sqm(facts.active.median_sqm) })}
                </li>
              )}
              {facts.sold.count > 0 && (
                <li>
                  {fmt(t.market.similarSold, { scope, count: facts.sold.count, sqm: sqm(facts.sold.median_sqm) })}
                  {facts.sold.avg_days !== null && `, ${fmt(t.market.soldDays, { days: facts.sold.avg_days })}`}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
