import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BadgeCheck, Building, Clock, Handshake, Megaphone, Tags, UserRoundPlus } from "lucide-react";
import { ClosedStatsContent } from "@/components/closed/ClosedStatsContent";
import { PageHeader } from "@/components/PageHeader";
import { MonthsCard } from "@/components/stats/MonthsCard";
import { Bar, CardTitle, SectionTitle, StatTiles } from "@/components/stats/StatBits";
import { StatsNav } from "@/components/stats/StatsNav";
import { Card } from "@/components/ui/form";
import { getClosedDeals } from "@/lib/closed-deals";
import { sofiaToday } from "@/lib/dates";
import { formatNumber, formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { rangeParams, resolveRange } from "@/lib/period";
import { getSession } from "@/lib/session";
import { getStatistics } from "@/lib/statistics";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.stats.agencyTitle };
}

/** The agency as a whole: the deals in BRIXA, the channels clients come from, and the register of closed deals. */
export default async function AgencyStatsPage({ searchParams }: PageProps<"/stats">) {
  const params = await searchParams;
  const session = (await getSession())!;
  const today = sofiaToday();
  const range = resolveRange(params, today);

  // brokers see their own numbers (and the market); the agency's belong to the managers
  if (!session.isManager) {
    const qs = new URLSearchParams(rangeParams(range)).toString();
    redirect(qs ? `/stats/broker?${qs}` : "/stats/broker");
  }

  const [{ t, lang }, stats, register] = await Promise.all([
    getI18n(),
    getStatistics(session, range, "all", today),
    getClosedDeals(session.organizationId, { from: range.from, to: range.to }),
  ]);

  const euro = (value: number) => formatPrice(value, "EUR", lang) ?? "0";
  const percent = (value: number | null) => (value === null ? "—" : `${formatNumber(value * 100, lang, 1)}%`);
  const days = (value: number | null) => (value === null ? "—" : fmt(t.stats.days, { days: formatNumber(value, lang, 1) ?? "0" }));
  const stageLabel = (stage: keyof typeof t.options.dealStage) => t.options.dealStage[stage];

  const { summary, kindOfDeal, partners, stageTimes, totalTime, stale, clientSources, externalBrokers, offerStats } = stats;
  const maxGap = Math.max(0, ...stageTimes.map((g) => g.avgDays));
  const maxClients = Math.max(0, ...clientSources.map((s) => s.clients));
  const kinds = [
    { label: t.stats.own, ...kindOfDeal.own },
    { label: t.stats.double, ...kindOfDeal.double },
    { label: t.stats.withPartners, ...kindOfDeal.partner },
  ];

  return (
    <div className="stats-page">
      <div className="print:hidden">
        <PageHeader title={t.stats.title} subtitle={t.stats.subtitle} />
      </div>
      <StatsNav tab="agency" range={range} title={t.stats.agencyTitle} agencyName={session.organizationName} t={t} lang={lang} />

      {/* ---- the deals in BRIXA ---- */}
      <SectionTitle icon={Handshake}>{t.stats.sectionBrixa}</SectionTitle>
      <StatTiles
        tiles={[
          { label: t.stats.closedDeals, value: String(summary.won), hint: `${t.stats.wonSales} ${summary.sales} · ${t.stats.wonRentals} ${summary.rentals}` },
          { label: t.stats.turnover, value: euro(summary.turnover), hint: t.stats.turnoverHint },
          { label: t.stats.commission, value: euro(summary.commission), hint: externalBrokers.fees > 0 ? t.stats.netHint : undefined },
          { label: t.stats.avgCommission, value: summary.avgCommission === null ? "—" : euro(summary.avgCommission) },
          { label: t.stats.winRate, value: percent(summary.winRate), hint: t.stats.winRateHint },
          { label: t.stats.cycle, value: days(summary.avgCycleDays) },
          {
            label: t.stats.pipeline,
            value: String(summary.openCount),
            hint: fmt(t.stats.pipelineHint, { count: summary.openCount, amount: euro(summary.openExpected) }),
          },
          { label: t.stats.newClients, value: String(summary.newClients) },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MonthsCard months={stats.byMonth} t={t} lang={lang} className="lg:col-span-2" />

        {/* ---- other agencies ---- */}
        <Card title={<CardTitle icon={Building}>{t.stats.partnersTitle}</CardTitle>}>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {kinds.map((k) => (
              <div key={k.label} className="rounded-xl bg-raised/60 p-3">
                <p className="truncate text-[11px] font-medium text-muted">{k.label}</p>
                <p className="text-lg font-bold">{k.count}</p>
                <p className="truncate text-[11px] text-subtle">{euro(k.commission)}</p>
              </div>
            ))}
          </div>
          {partners.length === 0 ? (
            <p className="text-sm text-muted">{t.stats.noPartners}</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {partners.map((p) => (
                <li key={p.name} className="flex items-center gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-sm font-bold text-accent-fg">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted">
                      {fmt(t.stats.wonShort, { won: p.won, total: p.deals })}
                      {p.bringBuyer > 0 && ` · ${fmt(t.stats.bringBuyer, { count: p.bringBuyer })}`}
                      {p.haveProperty > 0 && ` · ${fmt(t.stats.haveProperty, { count: p.haveProperty })}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{euro(p.commission)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---- time between stages ---- */}
        <Card title={<CardTitle icon={Clock}>{t.stats.timeTitle}</CardTitle>} description={t.stats.timeHint}>
          {stageTimes.length === 0 ? (
            <p className="text-sm text-muted">{t.stats.noTime}</p>
          ) : (
            <ul className="space-y-3.5">
              {stageTimes.map((g) => (
                <li key={`${g.from}-${g.to}`}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-fg-2">
                      {stageLabel(g.from)} → {stageLabel(g.to)}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{days(g.avgDays)}</span>
                  </div>
                  <Bar value={g.avgDays} max={maxGap} />
                  <p className="mt-0.5 text-[11px] text-subtle">{fmt(t.stats.samples, { count: g.count })}</p>
                </li>
              ))}
            </ul>
          )}
          {totalTime.avgDays !== null && (
            <div className="mt-5 flex items-baseline justify-between gap-3 rounded-xl bg-accent-soft/50 px-3.5 py-3">
              <span className="text-sm font-medium">{t.stats.total}</span>
              <span className="text-lg font-bold text-accent-fg">{days(totalTime.avgDays)}</span>
            </div>
          )}
        </Card>

        {/* ---- offers vs the final price ---- */}
        <Card title={<CardTitle icon={Tags}>{t.stats.offersTitle}</CardTitle>} className="lg:col-span-2">
          {offerStats.rows.length === 0 ? (
            <p className="text-sm text-muted">{t.stats.noOffers}</p>
          ) : (
            <>
              <div className="mb-5 grid grid-cols-3 gap-2">
                {[
                  { label: t.stats.avgDiscount, value: percent(offerStats.avgDiscount) },
                  { label: t.stats.avgOverOffer, value: percent(offerStats.avgOverFirstOffer) },
                  {
                    label: t.stats.offersPerDeal,
                    value: offerStats.offersPerDeal === null ? "—" : (formatNumber(offerStats.offersPerDeal, lang, 1) ?? "0"),
                  },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl bg-raised/60 p-3">
                    <p className="line-clamp-2 text-[11px] font-medium text-muted">{k.label}</p>
                    <p className="mt-0.5 text-lg font-bold">{k.value}</p>
                  </div>
                ))}
              </div>
              <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      <th className="pb-2 font-semibold" />
                      <th className="pb-2 text-right font-semibold">{t.stats.asking}</th>
                      <th className="pb-2 text-right font-semibold">{t.stats.firstOffer}</th>
                      <th className="pb-2 text-right font-semibold">{t.stats.finalPrice}</th>
                      <th className="pb-2 text-right font-semibold">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {offerStats.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="max-w-[12rem] truncate py-2.5 pr-3">
                          <Link href={`/deals/${row.id}`} className="font-medium hover:text-accent-fg">
                            {row.title}
                          </Link>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-muted">
                          {row.asking === null ? "—" : formatPrice(row.asking, row.currency, lang)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-muted">
                          {row.firstOffer === null ? "—" : formatPrice(row.firstOffer, row.currency, lang)}
                        </td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">{formatPrice(row.final, row.currency, lang)}</td>
                        <td
                          className={`py-2.5 text-right tabular-nums ${
                            row.discount !== null && row.discount > 0 ? "text-warning" : "text-muted"
                          }`}
                        >
                          {row.discount === null
                            ? "—"
                            : `${row.discount > 0 ? "−" : row.discount < 0 ? "+" : ""}${formatNumber(Math.abs(row.discount) * 100, lang, 1)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        {/* ---- stalled deals (now, whatever the period) ---- */}
        <Card
          title={<CardTitle icon={AlertTriangle}>{t.stats.staleTitle}</CardTitle>}
          description={t.stats.staleHint}
          className="lg:col-span-2 print:hidden"
        >
          {stale.length === 0 ? (
            <p className="text-sm text-muted">{t.stats.noStale}</p>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {stale.map((d) => {
                const labels = d.kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
                return (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-raised">
                      <Handshake className="size-4 shrink-0 text-warning" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.title}</span>
                      <span className="shrink-0 text-xs font-semibold text-warning">
                        {fmt(t.stats.staleDays, { days: d.days, stage: labels[d.stage] })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ---- where the clients and the deals come from ---- */}
      <SectionTitle icon={Megaphone}>{t.stats.sectionChannels}</SectionTitle>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={<CardTitle icon={Megaphone}>{t.stats.sourcesTitle}</CardTitle>}>
          {clientSources.length === 0 ? (
            <p className="text-sm text-muted">{t.stats.noSources}</p>
          ) : (
            <>
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_5.5rem] gap-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                <span />
                <span className="text-right">{t.stats.newClients}</span>
                <span className="text-right">{t.stats.wonFrom}</span>
                <span className="text-right">{t.stats.commission}</span>
              </div>
              <ul className="space-y-3">
                {clientSources.map((row) => (
                  <li key={row.source ?? "none"}>
                    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_5.5rem] items-baseline gap-2 text-sm">
                      <span className="truncate text-fg-2">
                        {row.source
                          ? (t.options.source[row.source as keyof typeof t.options.source] ?? row.source)
                          : t.stats.unknownSource}
                      </span>
                      <span className="text-right font-semibold tabular-nums">{row.clients}</span>
                      <span className="text-right tabular-nums">{row.won}</span>
                      <span className="truncate text-right tabular-nums text-muted">{euro(row.commission)}</span>
                    </div>
                    <div className="mt-1">
                      <Bar value={row.clients} max={maxClients} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* external brokers: a channel that costs a share of the commission */}
        <Card title={<CardTitle icon={UserRoundPlus}>{t.stats.referralsTitle}</CardTitle>} description={t.stats.referralsHint}>
          {externalBrokers.rows.length === 0 ? (
            <p className="text-sm text-muted">{t.stats.noReferrals}</p>
          ) : (
            <>
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem] gap-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                <span />
                <span className="text-right">{t.stats.wonFrom}</span>
                <span className="text-right">{t.stats.referralFees}</span>
              </div>
              <ul className="space-y-2.5">
                {externalBrokers.rows.map((row) => (
                  <li key={row.name ?? "none"} className="grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem] items-baseline gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-fg-2">{row.name ?? t.stats.unknownReferrer}</span>
                      {row.commission > 0 && <span className="block truncate text-[11px] text-subtle">{euro(row.commission)}</span>}
                    </span>
                    <span className="text-right font-semibold tabular-nums">{row.won}</span>
                    <span className="truncate text-right tabular-nums text-muted">{euro(row.fees)}</span>
                  </li>
                ))}
              </ul>
              {externalBrokers.fees > 0 && (
                <p className="mt-4 border-t border-line-soft pt-3 text-sm text-muted">
                  {fmt(t.stats.referralsTotal, { amount: euro(externalBrokers.fees) })}
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      {/* ---- the register of deals actually closed ---- */}
      <SectionTitle icon={BadgeCheck}>{t.stats.sectionRegister}</SectionTitle>
      <div className="space-y-6">
        <ClosedStatsContent deals={register} agencyName={session.organizationName} t={t} lang={lang} />
      </div>
    </div>
  );
}
