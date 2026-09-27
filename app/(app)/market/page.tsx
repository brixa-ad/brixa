import type { Metadata } from "next";
import Link from "next/link";
import { Building2, MapPinned, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MarketDiffChip } from "@/components/market/MarketCard";
import { MarketPriceEditor } from "@/components/market/MarketPriceEditor";
import { Card } from "@/components/ui/form";
import { sofiaToday } from "@/lib/dates";
import { formatDate, formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMarketOverview, getMarketPrices, getMarketTowns, type MarketOperation } from "@/lib/market";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.market.title };
}

/** Prices by neighborhood — the agency's reference against its own listings and sales. */
export default async function MarketPage({ searchParams }: PageProps<"/market">) {
  const { op } = await searchParams;
  const operation: MarketOperation = op === "rent" ? "rent" : "sale";
  const session = (await getSession())!;
  const [{ t, lang }, overview, towns, prices] = await Promise.all([
    getI18n(),
    getMarketOverview(session.organizationId, operation),
    session.isManager ? getMarketTowns(session.organizationId) : Promise.resolve([]),
    session.isManager ? getMarketPrices(session.organizationId, operation) : Promise.resolve([]),
  ]);
  const today = sofiaToday();
  const unit = operation === "rent" ? t.market.perSqmMonth : t.market.perSqm;
  const sqm = (value: number | null) => (value === null ? "—" : `${formatNumber(value, lang)} ${unit}`);
  const manyTowns = new Set(overview.areas.map((a) => a.settlement_id)).size > 1;

  return (
    <>
      <PageHeader title={t.market.title} subtitle={t.market.subtitle} />

      <nav className="mb-5 flex gap-1 rounded-xl border border-line bg-surface p-1 sm:w-80">
        {(["sale", "rent"] as const).map((key) => (
          <Link
            key={key}
            href={key === "sale" ? "/market" : "/market?op=rent"}
            aria-current={operation === key ? "page" : undefined}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
              operation === key ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
            }`}
          >
            {key === "sale" ? t.market.sale : t.market.rent}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-6">
        {/* ---- listings off the market ---- */}
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
                    <p className="truncate text-xs text-muted">
                      {[listing.neighborhood, listing.broker].filter(Boolean).join(" · ")}
                    </p>
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

        {/* ---- prices by neighborhood ---- */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <MapPinned className="size-4 text-brand-cyan" />
              {t.market.areasTitle}
            </span>
          }
          description={t.market.areasHint}
        >
          {overview.areas.length === 0 ? (
            <p className="text-sm text-muted">{t.market.noAreas}</p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    <th className="pb-2 pr-3 font-semibold">{t.market.place}</th>
                    <th className="pb-2 pr-3 text-right font-semibold">{t.market.reference}</th>
                    <th className="pb-2 pr-3 text-right font-semibold">{t.market.ours}</th>
                    <th className="pb-2 pr-3 text-right font-semibold">{t.market.sold}</th>
                    <th className="pb-2 text-right font-semibold">{t.market.days}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {overview.areas.map((area) => (
                    <tr key={`${area.settlement_id}-${area.neighborhood_id ?? "town"}`}>
                      <td className="py-2 pr-3">
                        <span className={area.neighborhood ? "text-fg-2" : "font-semibold"}>
                          {area.neighborhood ?? t.market.wholeTown}
                        </span>
                        {manyTowns && <span className="block text-[11px] text-subtle">{area.town}</span>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <span className="font-semibold">{sqm(area.ref_sqm)}</span>
                        {area.as_of && (
                          <span className="block text-[11px] text-subtle">
                            {[area.source, formatDate(area.as_of, lang)].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {sqm(area.active_sqm)}
                        {area.active_count > 0 && (
                          <span className="block text-[11px] text-subtle">{fmt(t.market.count, { count: area.active_count })}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {sqm(area.sold_sqm)}
                        {area.sold_count > 0 && (
                          <span className="block text-[11px] text-subtle">{fmt(t.market.count, { count: area.sold_count })}</span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">{area.sold_days ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ---- the reference prices (managers) ---- */}
        <Card
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
          {session.isManager ? (
            <MarketPriceEditor key={operation} towns={towns} prices={prices} operation={operation} today={today} />
          ) : (
            <p className="text-sm text-muted">{t.market.readOnly}</p>
          )}
        </Card>
      </div>
    </>
  );
}
