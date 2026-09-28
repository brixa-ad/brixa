import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MarketAnalysis, type MarketRow } from "@/components/stats/MarketAnalysis";
import { StatsNav } from "@/components/stats/StatsNav";
import { buttonClass, inputClass } from "@/components/ui/form";
import { getClosedDeals, type ClosedDealRow } from "@/lib/closed-deals";
import { sofiaToday } from "@/lib/dates";
import { formatDate, formatNumber } from "@/lib/format";
import { localName, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { rangeParams, resolveRange } from "@/lib/period";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.stats.marketTitle };
}

const text = (value: string | string[] | undefined) => (typeof value === "string" ? value.trim() : "");
const norm = (s: string | null | undefined) => (s ?? "").toLocaleLowerCase("bg");
const town = (d: ClosedDealRow) => (d.settlement ? `${d.settlement.settlement_type} ${d.settlement.name}` : "");

/** Street, number, block, entrance, floor — never the apartment. */
function publicAddress(d: ClosedDealRow) {
  const parts = [
    [d.street, d.street_no].filter((p) => p?.trim()).join(" "),
    d.block?.trim() && `бл. ${d.block.trim()}`,
    d.entrance?.trim() && `вх. ${d.entrance.trim()}`,
    d.floor?.trim() && `ет. ${d.floor.trim()}`,
  ].filter(Boolean);
  if (parts.length) return parts.join(", ");
  // older rows: one line — drop the apartment from it
  return (d.address ?? "").replace(/,?\s*ап\.?\s*[^,]*/giu, "").trim();
}

function toRow(d: ClosedDealRow, t: Dictionary, lang: Lang): MarketRow {
  return {
    id: d.id,
    day: d.reported_on,
    type: d.subtype ? localName(d.subtype, lang) : "—",
    placeKey: d.neighborhood_id ?? d.settlement_id ?? "—",
    place: [d.neighborhood?.name, town(d)].filter(Boolean).join(", "),
    address: publicAddress(d),
    construction: d.construction ? (t.options.construction[d.construction as keyof typeof t.options.construction] ?? d.construction) : null,
    conditions: d.conditions.map((c) => t.options.closedCondition[c as keyof typeof t.options.closedCondition] ?? c).join(", "),
    area: d.area,
    price: d.price,
    parkingPrice: d.parking_price,
    total: d.total_price,
    perSqm: d.price_per_sqm,
    totalPerSqm: d.total_per_sqm,
  };
}

/**
 * The market from the agency's own closed deals: filter by place, type, area, construction, address;
 * tick the comparables; print a document without the brokers' names.
 */
export default async function MarketStatsPage({ searchParams }: PageProps<"/stats/market">) {
  const params = await searchParams;
  const session = (await getSession())!;
  const today = sofiaToday();
  const range = resolveRange(params, today);
  const filters = {
    town: text(params.town),
    hood: text(params.hood),
    type: text(params.type),
    build: text(params.build),
    amin: text(params.amin),
    amax: text(params.amax),
    q: text(params.q),
  };

  const [{ t, lang }, all] = await Promise.all([
    getI18n(),
    getClosedDeals(session.organizationId, { from: range.from, to: range.to }),
  ]);

  // ---- the choices: what the register has in the period
  const towns = new Map<string, string>();
  const hoods = new Map<string, { name: string; town: string; townId: string | null }>();
  const types = new Map<string, string>();
  const builds = new Set<string>();
  for (const d of all) {
    if (d.settlement_id) towns.set(d.settlement_id, town(d));
    if (d.neighborhood_id && d.neighborhood) hoods.set(d.neighborhood_id, { name: d.neighborhood.name, town: town(d), townId: d.settlement_id });
    if (d.subtype) types.set(d.subtype_id, localName(d.subtype, lang));
    if (d.construction) builds.add(d.construction);
  }
  const byName = <T,>(list: [string, T][], name: (v: T) => string) => list.sort((a, b) => name(a[1]).localeCompare(name(b[1]), "bg"));
  const townOptions = byName([...towns.entries()], (v) => v);
  const hoodOptions = byName(
    [...hoods.entries()].filter(([, h]) => !filters.town || h.townId === filters.town),
    (h) => `${h.town} ${h.name}`
  );
  const typeOptions = byName([...types.entries()], (v) => v);
  const buildLabel = (key: string) => t.options.construction[key as keyof typeof t.options.construction] ?? key;

  // ---- the filter
  const areaMin = Number(filters.amin.replace(",", "."));
  const areaMax = Number(filters.amax.replace(",", "."));
  const needle = norm(filters.q);
  const shown = all.filter(
    (d) =>
      (!filters.town || d.settlement_id === filters.town) &&
      (!filters.hood || d.neighborhood_id === filters.hood) &&
      (!filters.type || d.subtype_id === filters.type) &&
      (!filters.build || d.construction === filters.build) &&
      (!(areaMin > 0) || d.area >= areaMin) &&
      (!(areaMax > 0) || d.area <= areaMax) &&
      (!needle || [d.street, d.address, d.block, d.neighborhood?.name, d.settlement?.name].some((f) => norm(f).includes(needle)))
  );

  // what the document says it covers
  const area =
    areaMin > 0 || areaMax > 0
      ? `${areaMin > 0 ? formatNumber(areaMin, lang) : "…"}–${areaMax > 0 ? formatNumber(areaMax, lang) : "…"} ${t.units.sqm}`
      : "";
  const criteria = [
    filters.hood ? hoods.get(filters.hood)?.name : "",
    filters.town ? towns.get(filters.town) : filters.hood ? hoods.get(filters.hood)?.town : "",
    filters.type ? types.get(filters.type) : "",
    filters.build ? buildLabel(filters.build) : "",
    area,
    filters.q ? `„${filters.q}“` : "",
  ].filter(Boolean);
  const keep = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const anyFilter = Object.keys(keep).length > 0;

  return (
    <div className="stats-page">
      <div className="print:hidden">
        <PageHeader title={t.stats.title} subtitle={t.stats.marketHint} />
      </div>
      <StatsNav
        tab="market"
        range={range}
        keep={keep}
        title={t.stats.docTitle}
        subtitle={criteria.length ? `${t.stats.docCriteria}: ${criteria.join(" · ")}` : undefined}
        agencyName={session.organizationName}
        showAgency={session.isManager}
        t={t}
        lang={lang}
      />

      {/* ---- the filter ---- */}
      <form action="/stats/market" className="mb-6 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs sm:grid-cols-3 lg:grid-cols-6 print:hidden">
        {Object.entries(rangeParams(range)).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t.stats.marketTown}</span>
          <select name="town" defaultValue={filters.town} className={inputClass}>
            <option value="">{t.stats.anyTown}</option>
            {townOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t.stats.marketNeighborhood}</span>
          <select name="hood" defaultValue={filters.hood} className={inputClass}>
            <option value="">{t.stats.anyNeighborhood}</option>
            {hoodOptions.map(([id, h]) => (
              <option key={id} value={id}>
                {filters.town || towns.size <= 1 ? h.name : `${h.name} (${h.town})`}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t.stats.marketType}</span>
          <select name="type" defaultValue={filters.type} className={inputClass}>
            <option value="">{t.stats.anyType}</option>
            {typeOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t.closedDeals.construction}</span>
          <select name="build" defaultValue={filters.build} className={inputClass}>
            <option value="">{t.stats.anyConstruction}</option>
            {[...builds].map((key) => (
              <option key={key} value={key}>
                {buildLabel(key)}
              </option>
            ))}
          </select>
        </label>
        <div className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t.stats.marketArea}</span>
          <div className="flex items-center gap-1.5">
            <input
              name="amin"
              inputMode="decimal"
              defaultValue={filters.amin}
              placeholder={t.stats.from}
              aria-label={`${t.stats.marketArea} ${t.stats.from}`}
              className={`${inputClass} w-full min-w-0 px-2 text-center`}
            />
            <span className="text-subtle">–</span>
            <input
              name="amax"
              inputMode="decimal"
              defaultValue={filters.amax}
              placeholder={t.stats.to}
              aria-label={`${t.stats.marketArea} ${t.stats.to}`}
              className={`${inputClass} w-full min-w-0 px-2 text-center`}
            />
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{t.stats.marketQuery}</span>
          <input type="search" name="q" defaultValue={filters.q} placeholder={t.stats.marketQueryPlaceholder} className={inputClass} />
        </label>
        <div className="col-span-2 flex items-center gap-2 sm:col-span-3 lg:col-span-6">
          <button type="submit" className={buttonClass.primary}>
            <Search className="size-4" />
            {t.stats.filter}
          </button>
          {anyFilter && (
            <Link
              href={`/stats/market${Object.keys(rangeParams(range)).length ? `?${new URLSearchParams(rangeParams(range))}` : ""}`}
              className={buttonClass.ghost}
            >
              {t.stats.clearFilters}
            </Link>
          )}
        </div>
      </form>

      {/* a new filter starts with everything ticked again */}
      <MarketAnalysis
        key={JSON.stringify([range, keep])}
        rows={shown.map((d) => toRow(d, t, lang))}
        agencyName={session.organizationName}
        preparedOn={formatDate(today, lang)}
      />
    </div>
  );
}
