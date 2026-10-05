import { formatNumber, formatPrice } from "@/lib/format";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import type { RentalYield } from "@/lib/yield";
import { Panel } from "./ListingParts";

/**
 * A listing for sale as an investment: the rent it would bring, the yield a year (10 months of
 * rent, and 12) and how many years it takes to pay for itself. `source` says where the rent comes from.
 */
export function YieldPanel({
  y,
  source,
  t,
  lang,
  children,
}: {
  y: RentalYield | null;
  source: string;
  t: Dictionary;
  lang: Lang;
  /** the broker's own figure (in BRIXA) */
  children?: React.ReactNode;
}) {
  const pct = (value: number) => `${formatNumber(value, lang, 1)}%`;
  return (
    <Panel title={t.yield.title} id="yield">
      {y && (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-raised/60 px-4 py-3.5">
            <dt className="text-sm text-muted">{t.yield.rent}</dt>
            <dd className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
              {fmt(t.yield.perMonth, { amount: formatPrice(y.rent, "EUR", lang) ?? "" })}
            </dd>
          </div>
          <div className="rounded-2xl bg-accent-soft px-4 py-3.5">
            <dt className="text-sm text-muted">{t.yield.real}</dt>
            <dd className="mt-1 text-2xl font-bold tracking-tight text-accent-fg tabular-nums">{fmt(t.yield.perYear, { pct: pct(y.real) })}</dd>
            <dd className="mt-0.5 text-xs text-muted">
              {t.yield.gross}: {pct(y.gross)}
            </dd>
          </div>
          <div className="rounded-2xl bg-raised/60 px-4 py-3.5">
            <dt className="text-sm text-muted">{t.yield.payback}</dt>
            <dd className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
              {fmt(t.yield.years, { n: formatNumber(y.payback, lang, 1) ?? "" })}
            </dd>
          </div>
        </dl>
      )}
      <p className={`${y ? "mt-4" : ""} text-sm text-muted`}>{source}</p>
      {y && (
        <p className="mt-1 text-xs text-subtle">
          {t.yield.real}: {t.yield.realHint}. {t.yield.gross}: {t.yield.grossHint}.
        </p>
      )}
      {children}
    </Panel>
  );
}
