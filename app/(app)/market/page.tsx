import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CalendarDays, LineChart, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MarketDiffChip } from "@/components/market/MarketCard";
import { MarketPriceEditor } from "@/components/market/MarketPriceEditor";
import { PriceHistory } from "@/components/market/PriceHistory";
import { RefreshMarketButton } from "@/components/market/RefreshMarketButton";
import { Card } from "@/components/ui/form";
import { sofiaToday } from "@/lib/dates";
import { formatDate, formatNumber } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMarketOverview, getMarketPrices, getMarketTowns, type MarketOperation } from "@/lib/market";
import { getMarketDay, getMarketHistory, type MarketCell } from "@/lib/market-daily";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.market.title };
}

const APARTMENTS = ["studio", "two_room", "three_room", "four_room", "multi_room", "maisonette", "atelier"];

/**
 * The market from the agency's own data, worked out every morning: the average € per m² by
 * neighbourhood and type, what sold in the last 90 days, how many buyers look there — and how it moves.
 */
export default async function MarketPage({ searchParams }: PageProps<"/market">) {
  const params = await searchParams;
  const operation: MarketOperation = params.op === "rent" ? "rent" : "sale";
  const session = (await getSession())!;
  const [{ t, lang }, daily, overview, towns, prices] = await Promise.all([
    getI18n(),
    getMarketDay(session.organizationId, operation),
    getMarketOverview(session.organizationId, operation),
    session.isLeader ? getMarketTowns(session.organizationId) : Promise.resolve([]),
    session.isLeader ? getMarketPrices(session.organizationId, operation) : Promise.resolve([]),
  ]);
  const today = sofiaToday();
  const unit = operation === "rent" ? t.market.perSqmMonth : t.market.perSqm;
  const sqm = (value: number | null) => (value === null ? "—" : `${formatNumber(value, lang)} ${unit}`);

  // ---- the town and the type shown
  const townRows = daily.cells.filter((c) => c.neighborhood_id === null && c.subtype_id === null);
  const townsShown = [...townRows].sort((a, b) => b.listings + b.demand - (a.listings + a.demand));
  const town = townsShown.find((c) => c.settlement_id === params.town)?.settlement_id ?? townsShown[0]?.settlement_id ?? null;
  const types = new Map<string, NonNullable<MarketCell["subtype"]>>();
  for (const c of daily.cells) if (c.settlement_id === town && c.subtype_id && c.subtype) types.set(c.subtype_id, c.subtype);
  const typeList = [...types.entries()].sort((a, b) => a[1].sort_order - b[1].sort_order);
  const type = typeof params.type === "string" && types.has(params.type) ? params.type : null;
  const rows = daily.cells
    .filter((c) => c.settlement_id === town && c.subtype_id === type)
    .sort((a, b) => (a.neighborhood_id === null ? -1 : b.neighborhood_id === null ? 1 : (a.neighborhood ?? "").localeCompare(b.neighborhood ?? "", "bg")));
  const key = (c: { settlement_id: string; neighborhood_id: string | null; subtype_id: string | null }) =>
    `${c.settlement_id}|${c.neighborhood_id ?? ""}|${c.subtype_id ?? ""}`;
  const before = new Map(daily.previous.map((c) => [key(c), c]));
  // the portals' prices a manager entered (apartments): shown next to all types and the apartment types
  const portalFor = new Map(overview.areas.map((a) => [`${a.settlement_id}|${a.neighborhood_id ?? ""}`, a.ref_sqm]));
  const showPortals =
    (type === null || APARTMENTS.includes(types.get(type)?.code ?? "")) && rows.some((r) => portalFor.get(`${r.settlement_id}|${r.neighborhood_id ?? ""}`));

  // the place whose history is shown (the whole town by default)
  const hood = typeof params.hood === "string" && rows.some((r) => r.neighborhood_id === params.hood) ? params.hood : null;
  const selected = rows.find((r) => r.neighborhood_id === hood) ?? null;
  const history = town ? await getMarketHistory(session.organizationId, operation, town, hood, type) : [];
  const points = history.filter((h) => h.listing_avg !== null).map((h) => ({ day: h.day, value: h.listing_avg! }));

  const href = (next: { op?: MarketOperation; town?: string | null; type?: string | null; hood?: string | null }) => {
    const qs = new URLSearchParams();
    const o = next.op ?? operation;
    const tw = next.town !== undefined ? next.town : town;
    const tp = next.type !== undefined ? next.type : type;
    const hd = next.hood !== undefined ? next.hood : hood;
    if (o === "rent") qs.set("op", "rent");
    if (tw && tw !== townsShown[0]?.settlement_id) qs.set("town", tw);
    if (tp) qs.set("type", tp);
    if (hd) qs.set("hood", hd);
    const s = qs.toString();
    return s ? `/market?${s}` : "/market";
  };
  const chip = (active: boolean) =>
    `inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      active ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-fg-2 hover:border-line-strong"
    }`;
  const change = (cell: MarketCell) => {
    const old = before.get(key(cell));
    if (!old?.listing_avg || !cell.listing_avg) return null;
    return (cell.listing_avg - old.listing_avg) / old.listing_avg;
  };

  return (
    <>
      <PageHeader title={t.market.title} subtitle={session.solo ? t.market.dailySubtitleSolo : t.market.dailySubtitle} actions={session.isLeader ? <RefreshMarketButton /> : undefined} />

      {/* ---- sale / rent, the town, the type ---- */}
      <nav className="mb-3 flex gap-1 rounded-xl border border-line bg-surface p-1 sm:w-80">
        {(["sale", "rent"] as const).map((op) => (
          <Link
            key={op}
            href={href({ op, town: null, type: null, hood: null })}
            aria-current={operation === op ? "page" : undefined}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
              operation === op ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
            }`}
          >
            {op === "sale" ? t.market.sale : t.market.rent}
          </Link>
        ))}
      </nav>
      {townsShown.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {townsShown.map((c) => (
            <Link key={c.settlement_id} href={href({ town: c.settlement_id, type: null, hood: null })} className={chip(c.settlement_id === town)}>
              {c.town}
            </Link>
          ))}
        </div>
      )}
      {typeList.length > 0 && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          <Link href={href({ type: null, hood: null })} className={chip(type === null)}>
            {t.market.allTypes}
          </Link>
          {typeList.map(([id, subtype]) => (
            <Link key={id} href={href({ type: id, hood: null })} className={chip(type === id)}>
              {localName(subtype, lang)}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {/* ---- today's prices by neighbourhood ---- */}
        <Card
          title={
            <span className="flex flex-wrap items-center gap-x-2">
              <CalendarDays className="size-4 text-brand-cyan" />
              {t.market.dailyTitle}
              {daily.day && <span className="text-sm font-normal text-muted">· {formatDate(daily.day, lang)}</span>}
            </span>
          }
          description={t.market.dailyHint}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted">{t.market.noDaily}</p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    <th className="pb-2 pr-3 font-semibold">{t.market.place}</th>
                    <th className="pb-2 pr-3 text-right font-semibold">{t.market.avgOffer}</th>
                    <th className="pb-2 pr-3 text-right font-semibold">{t.market.change}</th>
                    <th className="pb-2 pr-3 text-right font-semibold">{t.market.soldRecent}</th>
                    <th className="pb-2 pr-3 text-right font-semibold">{t.market.demand}</th>
                    {showPortals && <th className="pb-2 text-right font-semibold">{t.market.portals}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {rows.map((row) => {
                    const diff = change(row);
                    const portal = portalFor.get(`${row.settlement_id}|${row.neighborhood_id ?? ""}`) ?? null;
                    const active = row.neighborhood_id === hood;
                    return (
                      <tr key={key(row)} className={active ? "bg-accent-soft/40" : undefined}>
                        <td className="py-2 pr-3">
                          <Link
                            href={href({ hood: row.neighborhood_id })}
                            scroll={false}
                            className={`hover:text-accent-fg ${row.neighborhood_id === null ? "font-semibold" : "text-fg-2"}`}
                          >
                            {row.neighborhood ?? t.market.wholeTown}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <span className="font-semibold">{sqm(row.listing_avg)}</span>
                          {row.listings > 0 && <span className="block text-[11px] text-subtle">{fmt(t.market.count, { count: row.listings })}</span>}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {diff === null ? (
                            <span className="text-subtle">—</span>
                          ) : (
                            <span className={`font-semibold ${diff > 0.005 ? "text-success" : diff < -0.005 ? "text-danger" : "text-muted"}`}>
                              {diff > 0 ? "+" : ""}
                              {formatNumber(diff * 100, lang, 1)}%
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {sqm(row.sold_avg)}
                          {row.sold_count > 0 && <span className="block text-[11px] text-subtle">{fmt(t.market.count, { count: row.sold_count })}</span>}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {row.demand > 0 ? (
                            <span className={`font-semibold ${row.listings === 0 ? "text-warning" : ""}`}>{row.demand}</span>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </td>
                        {showPortals && <td className="py-2 text-right tabular-nums text-muted">{sqm(portal)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {daily.before && <p className="mt-3 text-[11px] text-subtle">{fmt(t.market.changeHint, { date: formatDate(daily.before, lang) })}</p>}
            </div>
          )}
        </Card>

        {/* ---- how the price moves ---- */}
        {rows.length > 0 && (
          <Card
            title={
              <span className="flex items-center gap-2">
                <LineChart className="size-4 text-brand-cyan" />
                {fmt(t.market.historyTitle, {
                  place: [selected?.neighborhood ?? rows[0]?.town ?? "", type ? localName(types.get(type)!, lang) : null].filter(Boolean).join(" · "),
                })}
              </span>
            }
            description={t.market.historyHint}
          >
            {points.length < 2 ? (
              <p className="text-sm text-muted">{t.market.noHistory}</p>
            ) : (
              <PriceHistory points={points} unit={unit} lang={lang} />
            )}
          </Card>
        )}

        {/* ---- our listings against the market ---- */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <Building2 className="size-4 text-brand-cyan" />
              {t.market.listingsTitle}
            </span>
          }
          description={t.market.listingsHint}
        >
          {overview.listings.length === 0 ? (
            <p className="text-sm text-muted">{t.market.noListings}</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {overview.listings.map((listing) => (
                <li key={listing.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/properties/${listing.id}`} className="block truncate text-sm font-medium hover:text-accent-fg">
                      {listing.title}
                    </Link>
                    <p className="truncate text-xs text-muted">{[listing.neighborhood, listing.broker].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className="text-xs tabular-nums text-muted">
                    {sqm(listing.own_sqm)} / {sqm(listing.bench)}
                  </span>
                  <MarketDiffChip diff={listing.diff} t={t} lang={lang} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---- the portals' prices, by hand (optional) ---- */}
        <Card
          id="prices"
          title={
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-brand-cyan" />
              {t.market.editTitle}
            </span>
          }
          description={
            <>
              {t.market.editHint}
              <span className="mt-1 block text-xs text-subtle">{t.market.whereFrom}</span>
            </>
          }
        >
          {session.isLeader ? (
            <MarketPriceEditor key={operation} towns={towns} prices={prices} operation={operation} today={today} />
          ) : (
            <p className="text-sm text-muted">{t.market.readOnly}</p>
          )}
        </Card>
      </div>
    </>
  );
}
