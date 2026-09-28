"use client";

import { useState } from "react";
import { CheckSquare, Square } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";

/** One closed deal as the market analysis shows it: no brokers, no apartment number. */
export type MarketRow = {
  id: string;
  day: string;
  type: string;
  placeKey: string;
  place: string;
  address: string;
  construction: string | null;
  conditions: string;
  area: number;
  price: number;
  parkingPrice: number | null;
  total: number;
  perSqm: number;
  totalPerSqm: number;
};

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
const avg = (list: number[]) => (list.length ? sum(list) / list.length : null);
function median(list: number[]) {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
/** Total price of the properties over their total area. */
const weighted = (rows: MarketRow[]) => {
  const area = sum(rows.map((r) => r.area));
  return area > 0 ? sum(rows.map((r) => r.price)) / area : null;
};

/**
 * The comparables: tick the deals that belong in the analysis, add a comment, print.
 * On paper only the ticked deals, the numbers and the comment remain.
 */
export function MarketAnalysis({
  rows,
  agencyName,
  preparedOn,
}: {
  rows: MarketRow[];
  agencyName: string;
  preparedOn: string;
}) {
  const { t, lang } = useI18n();
  // everything is in until it's unticked
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [comment, setComment] = useState("");

  const chosen = rows.filter((r) => !off.has(r.id));
  const euro = (n: number | null) => (n === null ? "—" : (formatPrice(n, "EUR", lang) ?? "—"));
  const sqm = (n: number | null) => (n === null ? "—" : `${formatNumber(Math.round(n), lang)} €`);
  const perSqm = chosen.map((r) => r.perSqm);
  const withParking = chosen.filter((r) => r.parkingPrice);

  const tiles = [
    { label: t.closedDeals.deals, value: formatNumber(chosen.length, lang) ?? "0" },
    { label: t.closedDeals.avgSqm, value: sqm(weighted(chosen)) },
    { label: t.stats.median, value: sqm(median(perSqm)) },
    {
      label: t.stats.minMax,
      value: perSqm.length ? `${formatNumber(Math.round(Math.min(...perSqm)), lang)} – ${sqm(Math.max(...perSqm))}` : "—",
    },
    { label: t.closedDeals.avgPrice, value: euro(avg(chosen.map((r) => r.total))) },
    { label: t.stats.avgArea, value: chosen.length ? `${formatNumber(avg(chosen.map((r) => r.area)), lang, 1)} ${t.units.sqm}` : "—" },
    ...(withParking.length ? [{ label: t.stats.avgSqmParking, value: sqm(avg(withParking.map((r) => r.totalPerSqm))) }] : []),
  ];

  // by neighborhood, when the analysis spans more than one
  const groups = new Map<string, { place: string; rows: MarketRow[] }>();
  for (const r of chosen) {
    const g = groups.get(r.placeKey) ?? { place: r.place, rows: [] };
    g.rows.push(r);
    groups.set(r.placeKey, g);
  }
  const places = [...groups.values()].sort((a, b) => b.rows.length - a.rows.length);

  const toggle = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-muted">
        {t.stats.noMarketDeals}
      </p>
    );
  }

  const cell = "px-2.5 py-2 align-top print:px-1.5 print:py-1";
  const num = `${cell} text-right tabular-nums whitespace-nowrap`;

  return (
    <div className="space-y-6">
      {/* ---- the numbers of the ticked deals ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-xs print:break-inside-avoid">
            <p className="text-xs font-medium text-muted">{tile.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums tracking-tight">{tile.value}</p>
          </div>
        ))}
      </div>

      {places.length > 1 && (
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
          <h2 className="mb-3 text-base font-semibold">{t.closedDeals.neighborhoods}</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
              <tr>
                <th className="pb-2" />
                <th className="pb-2 text-right">{t.closedDeals.deals}</th>
                <th className="pb-2 text-right">{t.closedDeals.avgSqm}</th>
                <th className="pb-2 text-right">{t.stats.minMax}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {places.map((g) => {
                const values = g.rows.map((r) => r.perSqm);
                return (
                  <tr key={g.place}>
                    <td className="py-2 pr-3">{g.place}</td>
                    <td className="py-2 text-right tabular-nums">{g.rows.length}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{sqm(weighted(g.rows))}</td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {`${formatNumber(Math.round(Math.min(...values)), lang)} – ${sqm(Math.max(...values))}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* ---- the comment: typed here, printed as text ---- */}
      <label className="block print:hidden">
        <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.stats.docComment}</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t.stats.docCommentPlaceholder}
          className={inputClass}
        />
      </label>
      {comment.trim() && (
        <p className="hidden whitespace-pre-line rounded-xl border border-line px-4 py-3 text-sm print:block">{comment.trim()}</p>
      )}

      {/* ---- the deals: tick the comparables ---- */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-sm text-muted">{fmt(t.stats.selected, { count: chosen.length, total: rows.length })}</span>
          <button
            type="button"
            onClick={() => setOff(new Set())}
            className="rounded-lg px-2 py-1 text-sm font-medium text-accent-fg hover:bg-raised"
          >
            {t.stats.selectAll}
          </button>
          <button
            type="button"
            onClick={() => setOff(new Set(rows.map((r) => r.id)))}
            className="rounded-lg px-2 py-1 text-sm font-medium text-accent-fg hover:bg-raised"
          >
            {t.stats.selectNone}
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-xs print:overflow-visible">
          <table className="w-full min-w-[760px] text-sm print:min-w-0 print:text-[10px]">
            <thead className="bg-raised/60 text-left text-[11px] font-semibold uppercase tracking-wide text-subtle print:text-[9px]">
              <tr>
                <th className="w-10 px-2.5 py-2.5 print:hidden" />
                <th className={cell}>{t.closedDeals.date}</th>
                <th className={cell}>{t.closedDeals.type}</th>
                <th className={cell}>{t.closedDeals.place}</th>
                <th className={cell}>{t.closedDeals.construction}</th>
                <th className={`${cell} text-right`}>{t.closedDeals.area}</th>
                <th className={`${cell} text-right`}>{t.closedDeals.price}</th>
                <th className={`${cell} text-right`}>{t.closedDeals.perSqm}</th>
                <th className={`${cell} text-right`}>{t.closedDeals.parking}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => {
                const on = !off.has(r.id);
                const Box = on ? CheckSquare : Square;
                return (
                  <tr key={r.id} className={on ? "" : "text-subtle print:hidden"}>
                    <td className="px-2.5 py-2 align-top print:hidden">
                      <button
                        type="button"
                        onClick={() => toggle(r.id)}
                        aria-pressed={on}
                        aria-label={r.address || r.place}
                        className="grid size-6 place-items-center rounded text-accent-fg hover:bg-raised"
                      >
                        <Box className="size-4.5" />
                      </button>
                    </td>
                    <td className={`${cell} whitespace-nowrap`}>{formatDate(r.day, lang)}</td>
                    <td className={cell}>{r.type}</td>
                    <td className={cell}>
                      <span className="block">{r.place || "—"}</span>
                      {r.address && <span className="block text-xs text-muted print:text-[9px]">{r.address}</span>}
                    </td>
                    <td className={cell}>
                      <span className="block">{r.construction ?? "—"}</span>
                      {r.conditions && <span className="block text-xs text-muted print:text-[9px]">{r.conditions}</span>}
                    </td>
                    <td className={num}>{formatNumber(r.area, lang, 2)}</td>
                    <td className={`${num} font-semibold`}>{euro(r.price)}</td>
                    <td className={`${num} font-semibold text-accent-fg`}>{sqm(r.perSqm)}</td>
                    <td className={num}>{r.parkingPrice ? euro(r.parkingPrice) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* on paper: where the numbers come from */}
      <div className="hidden border-t border-line pt-3 text-xs text-muted print:block">
        <p>{fmt(t.stats.docSource, { agency: agencyName })}</p>
        <p>{fmt(t.stats.docGenerated, { date: preparedOn })}</p>
      </div>
    </div>
  );
}
