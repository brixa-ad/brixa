import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Building2, ChevronLeft, ChevronRight, Handshake, MapPinned, Plus, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, buttonClass, inputClass } from "@/components/ui/form";
import {
  CLOSED_PERIODS,
  closedKind,
  closedStats,
  getClosedDeals,
  periodBounds,
  periodKey,
  periodLabel,
  shiftPeriod,
  type ClosedDealRow,
  type ClosedPeriod,
} from "@/lib/closed-deals";
import { sofiaToday } from "@/lib/dates";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { fmt, localName, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.closedDeals.title };
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

function place(d: ClosedDealRow) {
  const town = d.settlement ? `${d.settlement.settlement_type} ${d.settlement.name}` : null;
  return [d.neighborhood?.name, town].filter(Boolean).join(", ");
}

/** The broker on the other side: one of ours (no agency to name) or someone at another agency. */
function colleagueText(d: ClosedDealRow) {
  if (d.colleague) return { name: d.colleague.full_name || d.colleague.email, agency: null };
  if (d.colleague_name || d.colleague_agency) return { name: d.colleague_name, agency: d.colleague_agency };
  return null;
}

/** The register of the agency's closed deals: the list (with search) and the statistics by period. */
export default async function ClosedDealsPage({ searchParams }: PageProps<"/closed-deals">) {
  const params = await searchParams;
  const view = params.view === "stats" ? "stats" : "list";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const periodType: ClosedPeriod = CLOSED_PERIODS.includes(params.period as ClosedPeriod) ? (params.period as ClosedPeriod) : "month";
  const today = sofiaToday();
  const at = typeof params.at === "string" && periodBounds(periodType, params.at) ? params.at : periodKey(periodType, today);

  const session = (await getSession())!;
  const [{ t, lang }, deals] = await Promise.all([
    getI18n(),
    getClosedDeals(session.organizationId, view === "stats" ? periodBounds(periodType, at)! : undefined),
  ]);
  const euro = (n: number | null) => (n === null ? "—" : formatPrice(n, "EUR", lang));
  const sqm = (n: number | null) => (n === null ? "—" : `${formatNumber(n, lang)} €`);

  const needle = norm(q);
  const shown =
    view === "list" && needle
      ? deals.filter((d) =>
          [
            d.address,
            d.neighborhood?.name,
            d.settlement?.name,
            d.broker?.full_name,
            d.broker?.email,
            d.colleague?.full_name,
            d.colleague_name,
            d.colleague_agency,
          ].some((field) => norm(field).includes(needle))
        )
      : deals;

  const tabHref = (next: "list" | "stats") => (next === "stats" ? "/closed-deals?view=stats" : "/closed-deals");
  const statsHref = (type: ClosedPeriod, key: string) => `/closed-deals?view=stats&period=${type}&at=${key}`;

  return (
    <>
      <PageHeader
        title={t.closedDeals.title}
        subtitle={t.closedDeals.subtitle}
        actions={
          session.isManager ? (
            <Link href="/closed-deals/new" className={buttonClass.primary}>
              <Plus className="size-4" />
              {t.closedDeals.new}
            </Link>
          ) : undefined
        }
      />

      <nav className="mb-5 flex gap-1 rounded-xl border border-line bg-surface p-1 sm:w-80">
        {(["list", "stats"] as const).map((key) => (
          <Link
            key={key}
            href={tabHref(key)}
            aria-current={view === key ? "page" : undefined}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
              view === key ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
            }`}
          >
            {key === "list" ? t.closedDeals.list : t.closedDeals.stats}
          </Link>
        ))}
      </nav>

      {view === "list" ? (
        <>
          <form action="/closed-deals" className="mb-4 flex gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <input type="search" name="q" defaultValue={q} placeholder={t.closedDeals.search} aria-label={t.closedDeals.search} className={`${inputClass} pl-9`} />
            </label>
            <button type="submit" className={buttonClass.secondary}>
              <Search className="size-4" />
            </button>
          </form>

          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
              <BadgeCheck className="mx-auto size-10 text-faint" />
              <p className="mx-auto mt-3 max-w-md text-sm text-muted">
                {q ? t.closedDeals.noResults : session.isManager ? t.closedDeals.empty : t.closedDeals.emptyReadOnly}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs text-subtle">{fmt(t.closedDeals.count, { count: shown.length })}</p>

              {/* computers: the full table */}
              <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface shadow-xs md:block">
                <table className="w-full min-w-[1400px] text-sm">
                  <thead className="bg-raised/60 text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    <tr>
                      {[
                        t.closedDeals.date,
                        t.closedDeals.type,
                        t.closedDeals.place,
                        t.closedDeals.side,
                        t.closedDeals.conditions,
                        t.closedDeals.construction,
                        t.closedDeals.parking,
                        t.closedDeals.area,
                        t.closedDeals.price,
                        t.closedDeals.parkingPrice,
                        t.closedDeals.total,
                        t.closedDeals.perSqm,
                        t.closedDeals.perSqmParking,
                        t.closedDeals.broker,
                        t.closedDeals.colleague,
                        t.closedDeals.colleagueAgency,
                      ].map((h, i) => (
                        <th key={h} className={`px-3 py-2.5 ${i >= 7 && i <= 12 ? "text-right" : ""}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {shown.map((d) => {
                      const colleague = colleagueText(d);
                      const cell = "px-3 py-2.5 align-top";
                      const num = `${cell} text-right tabular-nums`;
                      return (
                        <tr key={d.id} className="transition hover:bg-raised/40">
                          <td className={`${cell} whitespace-nowrap`}>
                            {session.isManager ? (
                              <Link href={`/closed-deals/${d.id}/edit`} className="font-medium text-accent-fg hover:underline">
                                {formatDate(d.reported_on, lang)}
                              </Link>
                            ) : (
                              formatDate(d.reported_on, lang)
                            )}
                          </td>
                          <td className={cell}>{d.subtype ? localName(d.subtype, lang) : "—"}</td>
                          <td className={cell}>
                            <span className="block">{place(d) || "—"}</span>
                            {d.address && <span className="block text-xs text-muted">{d.address}</span>}
                          </td>
                          <td className={cell}>{t.options.closedSide[d.side]}</td>
                          <td className={cell}>
                            {d.conditions.map((c) => t.options.closedCondition[c as keyof typeof t.options.closedCondition] ?? c).join(", ") || "—"}
                          </td>
                          <td className={cell}>{d.construction ? (t.options.construction[d.construction as keyof typeof t.options.construction] ?? d.construction) : "—"}</td>
                          <td className={cell}>{d.parking ? "✓" : "—"}</td>
                          <td className={num}>{formatNumber(d.area, lang, 2)}</td>
                          <td className={num}>{euro(d.price)}</td>
                          <td className={num}>{euro(d.parking_price)}</td>
                          <td className={`${num} font-semibold`}>{euro(d.total_price)}</td>
                          <td className={num}>{sqm(d.price_per_sqm)}</td>
                          <td className={num}>{d.parking_price ? sqm(d.total_per_sqm) : "—"}</td>
                          <td className={cell}>{d.broker ? d.broker.full_name || d.broker.email : "—"}</td>
                          <td className={cell}>{colleague?.name ?? "—"}</td>
                          <td className={cell}>
                            {d.colleague ? (
                              <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent-fg">{t.options.closedKind.double}</span>
                            ) : (
                              (colleague?.agency ?? (d.double_sided ? t.options.closedKind.double : "—"))
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* phones: one card per deal */}
              <ul className="space-y-3 md:hidden">
                {shown.map((d) => {
                  const colleague = colleagueText(d);
                  const body = (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{d.subtype ? localName(d.subtype, lang) : "—"}</p>
                          <p className="truncate text-sm text-fg-2">{place(d) || "—"}</p>
                          {d.address && <p className="truncate text-xs text-muted">{d.address}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-bold tabular-nums text-accent-fg">{euro(d.total_price)}</p>
                          <p className="text-xs tabular-nums text-muted">
                            {sqm(d.price_per_sqm)}/{t.units.sqm} · {formatNumber(d.area, lang, 2)} {t.units.sqm}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                        <span>{formatDate(d.reported_on, lang)}</span>
                        <span>{t.options.closedSide[d.side]}</span>
                        {d.parking_price ? <span>{`${t.closedDeals.parking}: ${euro(d.parking_price)}`}</span> : d.parking ? <span>{t.closedDeals.parkingYes}</span> : null}
                        <span>{d.broker ? d.broker.full_name || d.broker.email : "—"}</span>
                        {colleague && <span>{[colleague.name, colleague.agency].filter(Boolean).join(" · ")}</span>}
                        <span className="rounded-md bg-raised px-1.5 text-fg-2">{t.options.closedKind[closedKind(d)]}</span>
                      </p>
                    </>
                  );
                  return (
                    <li key={d.id} className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
                      {session.isManager ? (
                        <Link href={`/closed-deals/${d.id}/edit`} className="block">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      ) : (
        <Stats deals={deals} type={periodType} at={at} t={t} lang={lang} statsHref={statsHref} euro={euro} sqm={sqm} />
      )}
    </>
  );
}

function Stats({
  deals,
  type,
  at,
  t,
  lang,
  statsHref,
  euro,
  sqm,
}: {
  deals: ClosedDealRow[];
  type: ClosedPeriod;
  at: string;
  t: Dictionary;
  lang: Lang;
  statsHref: (type: ClosedPeriod, key: string) => string;
  euro: (n: number | null) => string | null;
  sqm: (n: number | null) => string;
}) {
  const s = closedStats(deals);
  const periodNames: Record<ClosedPeriod, string> = {
    month: t.closedDeals.periodMonth,
    quarter: t.closedDeals.periodQuarter,
    half: t.closedDeals.periodHalf,
    year: t.closedDeals.periodYear,
  };
  const row = "flex items-baseline justify-between gap-3 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {CLOSED_PERIODS.map((key) => (
            <Link
              key={key}
              href={statsHref(key, periodKey(key, periodBounds(type, at)!.from))}
              aria-current={type === key ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${type === key ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}
            >
              {periodNames[key]}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Link href={statsHref(type, shiftPeriod(type, at, -1))} aria-label={t.closedDeals.prev} className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg">
            <ChevronLeft className="size-5" />
          </Link>
          <span className="min-w-40 text-center font-semibold capitalize">{periodLabel(type, at, t, lang)}</span>
          <Link href={statsHref(type, shiftPeriod(type, at, 1))} aria-label={t.closedDeals.next} className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg">
            <ChevronRight className="size-5" />
          </Link>
        </div>
      </div>

      {s.count === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-muted">{t.closedDeals.noStats}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [t.closedDeals.deals, formatNumber(s.count, lang)],
              [t.closedDeals.volume, euro(s.volume)],
              [t.closedDeals.avgSqm, sqm(s.avgSqm)],
              [t.closedDeals.avgPrice, euro(s.avgPrice)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-xs">
                <p className="text-xs font-medium text-muted">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums tracking-tight">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title={<span className="flex items-center gap-2"><Handshake className="size-4 text-brand-cyan" />{t.closedDeals.kinds}</span>}>
              {(["single", "double", "partner"] as const).map((k) => (
                <div key={k} className={row}>
                  <span className="text-fg-2">{t.options.closedKind[k]}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">{s.kinds[k].count}</span>
                    <span className="ml-2 text-xs text-muted">{euro(s.kinds[k].volume)}</span>
                  </span>
                </div>
              ))}
              <div className="mt-3 border-t border-line-soft pt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">{t.closedDeals.sides}</p>
                {(["sale", "purchase"] as const).map((side) => (
                  <div key={side} className={row}>
                    <span className="text-fg-2">{t.options.closedSide[side]}</span>
                    <span className="font-semibold tabular-nums">{s.sides[side]}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title={<span className="flex items-center gap-2"><Building2 className="size-4 text-brand-cyan" />{t.closedDeals.agencies}</span>}>
              {s.agencies.length === 0 ? (
                <p className="text-sm text-muted">{t.closedDeals.noAgencies}</p>
              ) : (
                s.agencies.map((a) => (
                  <div key={a.name} className={row}>
                    <span className="min-w-0 truncate text-fg-2">{a.name === "—" ? t.closedDeals.otherAgency : a.name}</span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-semibold">{a.count}</span>
                      <span className="ml-2 text-xs text-muted">{euro(a.volume)}</span>
                    </span>
                  </div>
                ))
              )}
            </Card>

            <Card
              title={<span className="flex items-center gap-2"><Users className="size-4 text-brand-cyan" />{t.closedDeals.brokers}</span>}
              description={t.closedDeals.brokersHint}
            >
              {s.brokers.map((b) => (
                <div key={b.name} className={row}>
                  <span className="min-w-0 truncate text-fg-2">{b.name}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{b.count}</span>
                    <span className="ml-2 text-xs text-muted">{euro(b.volume)}</span>
                  </span>
                </div>
              ))}
            </Card>

            <Card title={<span className="flex items-center gap-2"><BadgeCheck className="size-4 text-brand-cyan" />{t.closedDeals.types}</span>}>
              {s.types.map((x) => (
                <div key={x.name?.name ?? "—"} className={row}>
                  <span className="min-w-0 truncate text-fg-2">{x.name ? localName(x.name, lang) : "—"}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{x.count}</span>
                    <span className="ml-2 text-xs text-muted">{sqm(x.avgSqm)}/{t.units.sqm}</span>
                  </span>
                </div>
              ))}
            </Card>

            <Card title={<span className="flex items-center gap-2"><MapPinned className="size-4 text-brand-cyan" />{t.closedDeals.neighborhoods}</span>} className="lg:col-span-2">
              <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      <th className="pb-2 pr-3 font-semibold">{t.closedDeals.neighborhood}</th>
                      <th className="pb-2 pr-3 text-right font-semibold">{t.closedDeals.deals}</th>
                      <th className="pb-2 pr-3 text-right font-semibold">{t.closedDeals.perSqm}</th>
                      <th className="pb-2 text-right font-semibold">{t.closedDeals.perSqmParking}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {s.places.map((p) => (
                      <tr key={p.name}>
                        <td className="py-2 pr-3 text-fg-2">{p.name}</td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums">{p.count}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{sqm(p.avgSqm)}</td>
                        <td className="py-2 text-right tabular-nums">{sqm(p.avgSqmParking)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
