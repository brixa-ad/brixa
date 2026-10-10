import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { ClosedStatsContent } from "@/components/closed/ClosedStatsContent";
import { PageHeader } from "@/components/PageHeader";
import { buttonClass, inputClass } from "@/components/ui/form";
import {
  CLOSED_PERIODS,
  closedKind,
  colleagueIsOurs,
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

/** The broker on the other side, and their agency (ours when none is written). */
function colleagueText(d: ClosedDealRow) {
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
            d.street,
            d.neighborhood?.name,
            d.settlement?.name,
            d.broker_name,
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
        subtitle={session.solo ? t.closedDeals.subtitleSolo : t.closedDeals.subtitle}
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
                          <td className={cell}>{d.broker_name}</td>
                          <td className={cell}>{colleague?.name ?? "—"}</td>
                          <td className={cell}>
                            {d.double_sided || colleagueIsOurs(d, session.organizationName) ? (
                              <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent-fg">
                                {d.double_sided ? t.closedDeals.doubleAlone : session.organizationName}
                              </span>
                            ) : (
                              (colleague?.agency ?? "—")
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
                        <span>{d.broker_name}</span>
                        {colleague && <span>{[colleague.name, colleague.agency].filter(Boolean).join(" · ")}</span>}
                        <span className="rounded-md bg-raised px-1.5 text-fg-2">{t.options.closedKind[closedKind(d, session.organizationName)]}</span>
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
        <Stats deals={deals} agencyName={session.organizationName} type={periodType} at={at} t={t} lang={lang} statsHref={statsHref} />
      )}
    </>
  );
}

function Stats({
  deals,
  agencyName,
  type,
  at,
  t,
  lang,
  statsHref,
}: {
  deals: ClosedDealRow[];
  agencyName: string;
  type: ClosedPeriod;
  at: string;
  t: Dictionary;
  lang: Lang;
  statsHref: (type: ClosedPeriod, key: string) => string;
}) {
  const periodNames: Record<ClosedPeriod, string> = {
    month: t.closedDeals.periodMonth,
    quarter: t.closedDeals.periodQuarter,
    half: t.closedDeals.periodHalf,
    year: t.closedDeals.periodYear,
  };

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
          <span className="min-w-40 text-center font-semibold">{periodLabel(type, at, t, lang)}</span>
          <Link href={statsHref(type, shiftPeriod(type, at, 1))} aria-label={t.closedDeals.next} className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg">
            <ChevronRight className="size-5" />
          </Link>
        </div>
      </div>

      <ClosedStatsContent deals={deals} agencyName={agencyName} t={t} lang={lang} />
    </div>
  );
}
