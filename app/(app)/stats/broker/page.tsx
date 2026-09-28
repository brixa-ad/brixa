import type { Metadata } from "next";
import { Activity, BadgeCheck, Building, Handshake, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MonthsCard } from "@/components/stats/MonthsCard";
import { Bar, CardTitle, SectionTitle, StatTiles } from "@/components/stats/StatBits";
import { StatsNav } from "@/components/stats/StatsNav";
import { BrokerPicker } from "@/components/task/BrokerPicker";
import { Card } from "@/components/ui/form";
import { brokerRegister, getBrokerActivity } from "@/lib/broker-stats";
import { closedKind, closedStats, getClosedDeals } from "@/lib/closed-deals";
import { sofiaToday } from "@/lib/dates";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { resolveRange } from "@/lib/period";
import { getSession } from "@/lib/session";
import { getStatistics } from "@/lib/statistics";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.stats.brokerTitle };
}

/** One broker in full: deals and money in BRIXA, the register, and the everyday work behind them. */
export default async function BrokerStatsPage({ searchParams }: PageProps<"/stats/broker">) {
  const params = await searchParams;
  const session = (await getSession())!;
  const today = sofiaToday();
  const range = resolveRange(params, today);

  // managers look at anyone in the agency; brokers at themselves
  const supabase = await createClient();
  const members = session.isManager ? await getMembers(supabase, session.organizationId) : [];
  const picked = session.isManager && typeof params.broker === "string" ? members.find((m) => m.profile_id === params.broker) : undefined;
  const brokerId = picked?.profile_id ?? session.userId;
  const self = members.find((m) => m.profile_id === session.userId);
  const name = picked
    ? picked.full_name || picked.email
    : (self?.full_name ?? session.fullName) || session.email;

  const [{ t, lang }, stats, work, register] = await Promise.all([
    getI18n(),
    getStatistics(session, range, brokerId, today),
    getBrokerActivity(session, range, brokerId),
    getClosedDeals(session.organizationId, { from: range.from, to: range.to }),
  ]);

  const euro = (value: number | null) => (value === null ? "—" : (formatPrice(value, "EUR", lang) ?? "0"));
  const percent = (value: number | null) => (value === null ? "—" : `${formatNumber(value * 100, lang, 1)}%`);
  const days = (value: number | null) => (value === null ? "—" : fmt(t.stats.days, { days: formatNumber(value, lang, 1) ?? "0" }));

  const { summary, kindOfDeal, partners, clientSources, byMonth } = stats;
  const kinds = [
    { label: t.stats.own, ...kindOfDeal.own },
    { label: t.stats.double, ...kindOfDeal.double },
    { label: t.stats.withPartners, ...kindOfDeal.partner },
  ];
  const maxClients = Math.max(0, ...clientSources.map((s) => s.clients));

  const mine = brokerRegister(register, name, session.organizationName);
  const reg = closedStats(mine, session.organizationName);
  const place = (d: (typeof mine)[number]) =>
    [d.neighborhood?.name, d.settlement ? `${d.settlement.settlement_type} ${d.settlement.name}` : null].filter(Boolean).join(", ");

  const { activity, tasks, clients, listings, shares } = work;
  const clientTypes = (Object.keys(clients.byType) as (keyof typeof clients.byType)[])
    .filter((type) => clients.byType[type] > 0)
    .map((type) => `${t.options.clientType[type]} ${clients.byType[type]}`)
    .join(" · ");

  return (
    <div className="stats-page">
      <div className="print:hidden">
        <PageHeader
          title={t.stats.title}
          subtitle={name}
          actions={
            session.isManager ? (
              <BrokerPicker
                value={brokerId}
                selfId={session.userId}
                members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
                allowAll={false}
              />
            ) : undefined
          }
        />
      </div>
      <StatsNav
        tab="broker"
        range={range}
        keep={brokerId !== session.userId ? { broker: brokerId } : {}}
        title={`${t.stats.brokerTitle}: ${name}`}
        agencyName={session.organizationName}
        showAgency={session.isManager}
        t={t}
        lang={lang}
      />

      {/* ---- the deals in BRIXA and the money ---- */}
      <SectionTitle icon={Handshake}>{t.stats.brokerDeals}</SectionTitle>
      <StatTiles
        tiles={[
          { label: t.stats.closedDeals, value: String(summary.won), hint: `${t.stats.wonSales} ${summary.sales} · ${t.stats.wonRentals} ${summary.rentals}` },
          { label: t.stats.purchases, value: String(summary.purchases), hint: t.stats.purchasesHint },
          { label: t.stats.turnover, value: euro(summary.turnover), hint: t.stats.turnoverHint },
          { label: t.stats.commission, value: euro(summary.commission), hint: stats.externalBrokers.fees > 0 ? t.stats.netHint : undefined },
          { label: t.stats.avgCommission, value: euro(summary.avgCommission) },
          { label: t.stats.winRate, value: percent(summary.winRate), hint: `${t.stats.lostDeals}: ${summary.lost}` },
          { label: t.stats.cycle, value: days(summary.avgCycleDays) },
          {
            label: t.stats.pipeline,
            value: String(summary.openCount),
            hint: `${t.stats.expected}: ${euro(summary.openExpected)}`,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MonthsCard months={byMonth} t={t} lang={lang} />

        <Card title={<CardTitle icon={Building}>{t.stats.partnersTitle}</CardTitle>}>
          <div className="mb-4 grid grid-cols-3 gap-2">
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
                <li key={p.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted">{fmt(t.stats.wonShort, { won: p.won, total: p.deals })}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={<CardTitle icon={Megaphone}>{t.stats.brokerSources}</CardTitle>} className="lg:col-span-2">
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
      </div>

      {/* ---- the everyday work ---- */}
      <SectionTitle icon={Activity}>{t.stats.brokerActivity}</SectionTitle>
      <StatTiles
        tiles={[
          { label: t.stats.calls, value: String(activity.call) },
          { label: t.stats.viewings, value: String(activity.viewing) },
          { label: t.stats.meetings, value: String(activity.meeting) },
          { label: t.stats.messages, value: String(activity.message + activity.email) },
          {
            label: t.stats.tasksDone,
            value: fmt(t.stats.tasksRate, { done: tasks.done, total: tasks.total }),
            hint: tasks.total ? percent(tasks.done / tasks.total) : undefined,
          },
          { label: t.stats.newClients, value: String(clients.total), hint: clientTypes || undefined },
          {
            label: t.stats.newListings,
            value: String(listings.new),
            hint: `${listings.newSale} ${t.stats.listingsSale} · ${listings.newRent} ${t.stats.listingsRent} · ${t.stats.exclusive} ${listings.exclusive}`,
          },
          { label: t.stats.activeListings, value: String(listings.active) },
          { label: t.stats.sharedLinks, value: String(shares.sent), hint: fmt(t.stats.sharedOpened, { count: shares.opened }) },
          { label: t.stats.ownerReports, value: String(work.ownerReports) },
        ]}
      />

      {/* ---- the register of deals actually closed ---- */}
      <SectionTitle icon={BadgeCheck}>{t.stats.brokerRegister}</SectionTitle>
      <p className="-mt-2 mb-3 text-xs text-subtle">{t.stats.registerMatchHint}</p>
      {mine.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-sm text-muted">
          {fmt(t.stats.registerNone, { name })}
        </p>
      ) : (
        <>
          <StatTiles
            tiles={[
              {
                label: t.closedDeals.deals,
                value: String(reg.count),
                hint: `${t.options.closedSide.sale} ${reg.sides.sale} · ${t.options.closedSide.purchase} ${reg.sides.purchase}`,
              },
              { label: t.stats.volume, value: euro(reg.volume) },
              { label: t.stats.doubleDeals, value: String(reg.kinds.double.count), hint: euro(reg.kinds.double.volume) },
              { label: t.stats.partnerDeals, value: String(reg.kinds.partner.count), hint: euro(reg.kinds.partner.volume) },
            ]}
          />
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-xs">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-raised/60 text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-3 py-2.5">{t.closedDeals.date}</th>
                  <th className="px-3 py-2.5">{t.closedDeals.type}</th>
                  <th className="px-3 py-2.5">{t.closedDeals.place}</th>
                  <th className="px-3 py-2.5">{t.closedDeals.side}</th>
                  <th className="px-3 py-2.5 text-right">{t.closedDeals.total}</th>
                  <th className="px-3 py-2.5 text-right">{t.closedDeals.perSqm}</th>
                  <th className="px-3 py-2.5">{t.closedDeals.kinds}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {mine.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(d.reported_on, lang)}</td>
                    <td className="px-3 py-2">{d.subtype ? localName(d.subtype, lang) : "—"}</td>
                    <td className="px-3 py-2">{place(d) || "—"}</td>
                    <td className="px-3 py-2">{t.options.closedSide[d.side]}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{euro(d.total_price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{`${formatNumber(d.price_per_sqm, lang)} €`}</td>
                    <td className="px-3 py-2 text-xs text-muted">{t.options.closedKind[closedKind(d, session.organizationName)]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
