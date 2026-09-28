import {
  BadgeCheck,
  Building2,
  Handshake,
  MapPinned,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/form";
import { closedStats, type ClosedDealRow } from "@/lib/closed-deals";
import { formatNumber, formatPrice } from "@/lib/format";
import { localName, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";

/** The register's numbers: totals, kinds of deals, agencies, brokers, property types, neighborhoods. */
export function ClosedStatsContent({
  deals,
  agencyName,
  t,
  lang,
}: {
  deals: ClosedDealRow[];
  agencyName: string;
  t: Dictionary;
  lang: Lang;
}) {
  const s = closedStats(deals, agencyName);
  const euro = (n: number | null) =>
    n === null ? "—" : formatPrice(n, "EUR", lang);
  const sqm = (n: number | null) =>
    n === null ? "—" : `${formatNumber(n, lang)} €`;
  const row = "flex items-baseline justify-between gap-3 py-1.5 text-sm";

  return (
    <>
      {s.count === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-muted">
          {t.closedDeals.noStats}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [t.closedDeals.deals, formatNumber(s.count, lang)],
              [t.closedDeals.volume, euro(s.volume)],
              [t.closedDeals.avgSqm, sqm(s.avgSqm)],
              [t.closedDeals.avgPrice, euro(s.avgPrice)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-xs"
              >
                <p className="text-xs font-medium text-muted">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums tracking-tight">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card
              title={
                <span className="flex items-center gap-2">
                  <Handshake className="size-4 text-brand-cyan" />
                  {t.closedDeals.kinds}
                </span>
              }
            >
              {(["single", "double", "partner"] as const).map((k) => (
                <div key={k} className={row}>
                  <span className="text-fg-2">{t.options.closedKind[k]}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">{s.kinds[k].count}</span>
                    <span className="ml-2 text-xs text-muted">
                      {euro(s.kinds[k].volume)}
                    </span>
                  </span>
                </div>
              ))}
              <div className="mt-3 border-t border-line-soft pt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                  {t.closedDeals.sides}
                </p>
                {(["sale", "purchase"] as const).map((side) => (
                  <div key={side} className={row}>
                    <span className="text-fg-2">
                      {t.options.closedSide[side]}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {s.sides[side]}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title={
                <span className="flex items-center gap-2">
                  <Building2 className="size-4 text-brand-cyan" />
                  {t.closedDeals.agencies}
                </span>
              }
            >
              {s.agencies.length === 0 ? (
                <p className="text-sm text-muted">{t.closedDeals.noAgencies}</p>
              ) : (
                s.agencies.map((a) => (
                  <div key={a.name} className={row}>
                    <span className="min-w-0 truncate text-fg-2">
                      {a.name === "—" ? t.closedDeals.otherAgency : a.name}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-semibold">{a.count}</span>
                      <span className="ml-2 text-xs text-muted">
                        {euro(a.volume)}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </Card>

            <Card
              title={
                <span className="flex items-center gap-2">
                  <Users className="size-4 text-brand-cyan" />
                  {t.closedDeals.brokers}
                </span>
              }
              description={t.closedDeals.brokersHint}
            >
              {s.brokers.map((b) => (
                <div key={b.name} className={row}>
                  <span className="min-w-0 truncate text-fg-2">{b.name}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{b.count}</span>
                    <span className="ml-2 text-xs text-muted">
                      {euro(b.volume)}
                    </span>
                  </span>
                </div>
              ))}
            </Card>

            <Card
              title={
                <span className="flex items-center gap-2">
                  <BadgeCheck className="size-4 text-brand-cyan" />
                  {t.closedDeals.types}
                </span>
              }
            >
              {s.types.map((x) => (
                <div key={x.name?.name ?? "—"} className={row}>
                  <span className="min-w-0 truncate text-fg-2">
                    {x.name ? localName(x.name, lang) : "—"}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{x.count}</span>
                    <span className="ml-2 text-xs text-muted">
                      {sqm(x.avgSqm)}/{t.units.sqm}
                    </span>
                  </span>
                </div>
              ))}
            </Card>

            <Card
              title={
                <span className="flex items-center gap-2">
                  <MapPinned className="size-4 text-brand-cyan" />
                  {t.closedDeals.neighborhoods}
                </span>
              }
              className="lg:col-span-2"
            >
              <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      <th className="pb-2 pr-3 font-semibold">
                        {t.closedDeals.neighborhood}
                      </th>
                      <th className="pb-2 pr-3 text-right font-semibold">
                        {t.closedDeals.deals}
                      </th>
                      <th className="pb-2 pr-3 text-right font-semibold">
                        {t.closedDeals.perSqm}
                      </th>
                      <th className="pb-2 text-right font-semibold">
                        {t.closedDeals.perSqmParking}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {s.places.map((p) => (
                      <tr key={p.name}>
                        <td className="py-2 pr-3 text-fg-2">{p.name}</td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                          {p.count}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {sqm(p.avgSqm)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {sqm(p.avgSqmParking)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
