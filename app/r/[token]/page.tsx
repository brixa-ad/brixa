import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Check, Eye, HandCoins, MapPin, MessageSquareQuote, PhoneIncoming, Send, Tag } from "lucide-react";
import { MarketDiffChip } from "@/components/market/MarketCard";
import { AgencyFooter, BrokerCard, PublicHeader } from "@/components/PublicContact";
import { ViewBeacon } from "@/components/PublicPageTools";
import { daysBetween, sofiaDay, sofiaToday } from "@/lib/dates";
import { formatDate, formatDayMonth, formatNumber, formatPrice } from "@/lib/format";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getOwnerReport, getReportMarketing, getReportOpenHouses, type OwnerReport } from "@/lib/owner-report";
import { pointLabel } from "@/lib/marketing";

const periodLabel = (report: OwnerReport["report"], lang: Lang) =>
  `${formatDate(report.period_start, lang)} – ${formatDate(report.period_end, lang)}`;

export async function generateMetadata({ params }: PageProps<"/r/[token]">): Promise<Metadata> {
  const { token } = await params;
  const [data, { t, lang }] = await Promise.all([getOwnerReport(token), getI18n()]);
  if (!data) return { title: { absolute: "BRIXA" }, robots: { index: false } };
  return {
    title: { absolute: `${t.report.pageTitle}: ${data.property.title}` },
    description: periodLabel(data.report, lang),
    robots: { index: false, follow: false },
    openGraph: {
      title: `${t.report.pageTitle}: ${data.property.title}`,
      description: periodLabel(data.report, lang),
      images: data.property.coverUrl ? [data.property.coverUrl] : [],
    },
  };
}

/** The owner's report: what happened with their listing over the period — never who the buyers are. */
export default async function OwnerReportPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const [data, { t, lang }, openHouses, marketing] = await Promise.all([
    getOwnerReport(token),
    getI18n(),
    getReportOpenHouses(token),
    getReportMarketing(token),
  ]);
  if (!data) notFound();

  const { report, property: p, totals, broker, agency } = data;
  const opinions = openHouses ? openHouses.price_low + openHouses.price_right + openHouses.price_high : 0;
  const period = periodLabel(report, lang);
  const place = [p.neighborhood, p.settlement].filter(Boolean).join(", ");
  const onMarket = daysBetween(sofiaDay(p.listed_at), sofiaToday());
  const rent = p.operation === "rent";
  const money = (amount: number | null, currency = p.currency) => formatPrice(amount, currency, lang) ?? "—";
  const startPrice = data.prices[0]?.new ?? p.asking_price;
  const marketSqm = (value: number | null) =>
    value === null ? "—" : `${formatNumber(value, lang)} ${rent ? t.market.perSqmMonth : t.market.perSqm}`;

  const tiles = [
    { icon: Eye, label: t.report.viewings, value: totals.viewings, sub: null },
    { icon: PhoneIncoming, label: t.report.inquiries, value: totals.inquiries, sub: null },
    {
      icon: Send,
      label: t.report.shared,
      value: totals.shared,
      sub: totals.opened > 0 ? fmt(t.report.opened, { count: totals.opened }) : null,
    },
    {
      icon: HandCoins,
      label: t.report.offers,
      value: totals.offers,
      sub: totals.best_offer !== null ? fmt(t.report.bestOffer, { amount: money(totals.best_offer) }) : null,
    },
  ];

  return (
    <main className="shared-page mx-auto max-w-3xl px-4 pb-16 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
      <ViewBeacon token={token} kind="report" />
      <PublicHeader agency={agency} />

      <p className="text-sm font-medium text-muted">
        {t.report.pageTitle} · {period}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{p.title}</h1>
      {place && (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-fg-2">
          <MapPin className="size-4 text-accent-fg" />
          {place}
        </p>
      )}

      <p className="mt-5 text-fg-2">
        {data.owner && <span className="font-semibold text-fg">{fmt(t.report.greeting, { name: data.owner })} </span>}
        {fmt(t.report.intro, { period })}
      </p>

      {/* the listing at a glance */}
      <section className="mt-5 grid grid-cols-1 gap-4 overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {p.coverUrl && <img src={p.coverUrl} alt={p.title} className="aspect-[4/3] size-full object-cover sm:aspect-auto" />}
        <dl className={`space-y-3 p-5 ${p.coverUrl ? "sm:pl-1" : "sm:col-span-2"}`}>
          <div>
            <dt className="text-xs text-muted">{t.report.priceNow}</dt>
            <dd className="text-2xl font-bold text-accent-fg">
              {money(p.price)}
              {rent && p.price !== null && <span className="ml-1.5 text-sm font-medium text-muted">{t.share.perMonth}</span>}
            </dd>
          </div>
          {startPrice !== null && startPrice !== p.price && (
            <div>
              <dt className="text-xs text-muted">{t.report.priceStart}</dt>
              <dd className="font-medium">{money(startPrice)}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">{t.report.daysOnMarket}</dt>
            <dd className="font-medium">
              {formatNumber(onMarket, lang)}{" "}
              <span className="text-sm font-normal text-muted">({fmt(t.report.listedOn, { date: formatDate(p.listed_at, lang) })})</span>
            </dd>
          </div>
          {p.area !== null && (
            <div>
              <dt className="text-xs text-muted">{t.share.area}</dt>
              <dd className="font-medium">
                {formatNumber(p.area, lang, 2)} {t.units.sqm}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* the period in numbers */}
      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4">
            <Icon className="size-5 text-accent-fg" />
            <p className="mt-2 text-3xl font-bold tracking-tight">{formatNumber(value, lang)}</p>
            <p className="text-sm font-medium text-fg-2">{label}</p>
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
          </div>
        ))}
      </section>

      {data.market?.own_sqm != null && data.market.benchmark && (
        <Section title={t.market.reportTitle}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">{t.market.reportOwn}</dt>
              <dd className="text-lg font-bold tabular-nums">{marketSqm(data.market.own_sqm)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t.market.reportMarket}</dt>
              <dd className="text-lg font-bold tabular-nums">{marketSqm(data.market.benchmark.sqm)}</dd>
              {data.market.benchmark.basis === "reference" && data.market.reference?.source && (
                <p className="text-[11px] text-subtle">
                  {fmt(t.market.sourceLine, {
                    source: data.market.reference.source,
                    date: formatDate(data.market.reference.as_of, lang),
                  })}
                </p>
              )}
            </div>
            {data.market.sold.count >= 3 && (
              <div>
                <dt className="text-xs text-muted">{t.market.reportSold}</dt>
                <dd className="text-lg font-bold tabular-nums">{marketSqm(data.market.sold.median_sqm)}</dd>
              </div>
            )}
          </dl>
          {data.market.diff !== null && (
            <div className="mt-3">
              <MarketDiffChip diff={data.market.diff} t={t} lang={lang} />
            </div>
          )}
        </Section>
      )}

      {/* ---- open houses: how many came, what they thought of the price ---- */}
      {openHouses && (
        <Section title={t.openHouses.ownerTitle}>
          <p className="text-lg font-bold">
            {fmt(t.openHouses.ownerVisitors, { visitors: openHouses.visitors })}
            <span className="ml-2 text-sm font-normal text-muted">{fmt(t.openHouses.ownerEvents, { events: openHouses.events })}</span>
          </p>
          {opinions > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-muted">{t.openHouses.priceTitle}</p>
              <div className="flex h-3 overflow-hidden rounded-full bg-raised">
                <div className="bg-success" style={{ width: `${(openHouses.price_low / opinions) * 100}%` }} />
                <div className="bg-accent" style={{ width: `${(openHouses.price_right / opinions) * 100}%` }} />
                <div className="bg-warning" style={{ width: `${(openHouses.price_high / opinions) * 100}%` }} />
              </div>
              <p className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-fg-2">
                <span>{`${t.openHouses.price.low}: ${openHouses.price_low}`}</span>
                <span>{`${t.openHouses.price.right}: ${openHouses.price_right}`}</span>
                <span>{`${t.openHouses.price.high}: ${openHouses.price_high}`}</span>
                {openHouses.rating !== null && <span>{`${t.openHouses.avgRating}: ${formatNumber(openHouses.rating, lang, 1)} / 5`}</span>}
              </p>
            </div>
          )}
          {openHouses.liked.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-muted">{t.openHouses.ownerLiked}</p>
              <ul className="list-inside list-disc space-y-0.5 text-sm text-fg-2">
                {openHouses.liked.slice(0, 8).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      {report.comment && (
        <section className="mt-4 rounded-2xl border border-accent/30 bg-accent-soft/40 p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <MessageSquareQuote className="size-4 text-accent-fg" />
            {t.report.brokerNote}
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-fg-2">{report.comment}</p>
          {broker && <p className="mt-2 text-sm font-medium">— {broker.name}</p>}
        </section>
      )}

      {/* ---- what we did: the listing's marketing plan, and how far it reached ---- */}
      {marketing && marketing.plan.length > 0 && (
        <Section title={t.marketing.reportTitle}>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {marketing.plan.map((point) => {
              const done = point.weekly ? point.times > 0 : point.last !== null;
              return (
                <li key={point.key} className="flex items-start gap-2.5 text-sm">
                  <span
                    className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md ${done ? "bg-success text-white" : "border border-line-strong"}`}
                    aria-hidden
                  >
                    {done && <Check className="size-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={done ? "font-medium" : "text-muted"}>{pointLabel({ key: point.key, label: point.label }, t)}</span>
                    <span className="block text-xs text-subtle">
                      {done
                        ? point.weekly || point.times > 1
                          ? fmt(t.marketing.reportTimes, { n: point.times })
                          : point.last
                            ? fmt(t.marketing.reportLast, { date: formatDate(point.last, lang) })
                            : ""
                        : t.marketing.reportPending}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {(marketing.funnel.colleagues_shared > 0 || marketing.funnel.buyers_shared > 0 || marketing.funnel.colleague_calls > 0) && (
            <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line-soft pt-4 sm:grid-cols-4">
              {(
                [
                  [t.marketing.funnelColleagues, marketing.funnel.colleagues_shared],
                  [t.marketing.funnelOpened, marketing.funnel.colleagues_opened],
                  [t.marketing.funnelCalls, marketing.funnel.colleague_calls],
                  [t.marketing.funnelBuyers, marketing.funnel.buyers_shared],
                ] as const
              ).map(([name, value]) => (
                <div key={name} className="rounded-xl bg-raised/60 px-3 py-2">
                  <dt className="text-[11px] font-medium text-muted">{name}</dt>
                  <dd className="text-lg font-bold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>
      )}

      <Section title={t.report.inProgress}>
        {data.in_progress.length === 0 ? (
          <p className="text-sm text-muted">{t.report.inProgressNone}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {data.in_progress.map((s) => (
              <li key={`${s.kind}-${s.stage}`} className="rounded-lg bg-raised px-3 py-1.5 text-sm">
                <span className="font-bold">{s.count}</span> × {stageLabel(t, s.kind, s.stage)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.offers.length > 0 && (
        <Section title={t.report.offersTitle}>
          <ul className="divide-y divide-line-soft">
            {data.offers.map((o, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm text-muted">{formatDate(o.on, lang)}</span>
                <span className="font-semibold">{money(o.amount, o.currency)}</span>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    o.status === "accepted"
                      ? "bg-success/10 text-success"
                      : o.status === "rejected"
                        ? "bg-raised text-muted"
                        : "bg-warning/10 text-warning"
                  }`}
                >
                  {t.report.offerStatus[o.status]}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.prices.length > 1 && (
        <Section title={t.report.priceTitle}>
          <ul className="space-y-2">
            {data.prices.map((h, i) => {
              const change = h.old && h.new !== null ? ((h.new - h.old) / h.old) * 100 : null;
              return (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">{formatDate(h.at, lang)}</span>
                  <span className="flex items-center gap-2">
                    {change !== null && change !== 0 && (
                      <span className={`inline-flex items-center text-xs font-semibold ${change < 0 ? "text-warning" : "text-success"}`}>
                        {change < 0 ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                        {formatNumber(Math.abs(change), lang, 1)}%
                      </span>
                    )}
                    <span className="font-semibold">{money(h.new, h.currency)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title={t.report.timeline}>
        <Timeline data={data} t={t} lang={lang} />
      </Section>

      {broker && <BrokerCard broker={broker} subject={`${t.report.pageTitle}: ${p.title}`} t={t} />}
      {agency && <AgencyFooter agency={agency} />}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">{title}</h2>
      {children}
    </section>
  );
}

function stageLabel(t: Dictionary, kind: string, stage: string) {
  const labels = kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
  return labels[stage as keyof typeof labels] ?? stage;
}

/** Everything in the period by day; the same kind on the same day is one line ("Огледи ×2"). */
function Timeline({ data, t, lang }: { data: OwnerReport; t: Dictionary; lang: Lang }) {
  const { period_start: from, period_end: to } = data.report;
  type Event = { day: string; icon: typeof Eye; text: string; count: number };
  const events: Event[] = [];
  const add = (day: string, icon: typeof Eye, text: string) => {
    const same = events.find((e) => e.day === day && e.text === text);
    if (same) same.count += 1;
    else events.push({ day, icon, text, count: 1 });
  };
  data.viewings.forEach((day) => add(day, Eye, t.report.eventViewing));
  data.inquiries.forEach((day) => add(day, PhoneIncoming, t.report.eventInquiry));
  data.offers.forEach((o) =>
    add(o.on, HandCoins, fmt(t.report.eventOffer, { amount: formatPrice(o.amount, o.currency, lang) ?? "" })),
  );
  data.prices
    .filter((h) => h.old !== null)
    .map((h) => ({ ...h, day: sofiaDay(h.at) }))
    .filter((h) => h.day >= from && h.day <= to)
    .forEach((h) => add(h.day, Tag, fmt(t.report.eventPrice, { price: formatPrice(h.new, h.currency, lang) ?? "" })));
  events.sort((a, b) => b.day.localeCompare(a.day));

  if (events.length === 0) return <p className="text-sm text-muted">{t.report.timelineNone}</p>;
  return (
    <ol className="space-y-2.5">
      {events.map((e) => (
        <li key={`${e.day}-${e.text}`} className="flex items-center gap-3 text-sm">
          <span className="flex w-20 shrink-0 items-center gap-1.5 text-muted">
            <CalendarDays className="size-3.5" />
            {formatDayMonth(e.day, lang)}
          </span>
          <e.icon className="size-4 shrink-0 text-accent-fg" />
          <span className="font-medium">
            {e.text}
            {e.count > 1 && <span className="ml-1 text-muted">×{e.count}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
