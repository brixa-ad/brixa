import "server-only";
import { addDays, daysBetween, sofiaDay } from "./dates";
import { dealStages, type DealKind, type DealStage, type DealStatus } from "./options";
import type { SessionContext } from "./session";
import { createClient } from "./supabase/server";

export const PERIODS = ["month", "year", "12m", "all"] as const;
export type Period = (typeof PERIODS)[number];

type DealStat = {
  id: string;
  kind: DealKind;
  stage: DealStage;
  status: DealStatus;
  price: number | null;
  currency: string;
  commission: number | null;
  closed_on: string | null;
  created_at: string;
  updated_at: string;
  double_sided: boolean;
  partner_agency: string | null;
  partner_side: "buyer" | "seller" | null;
  viewing_on: string | null;
  offer_on: string | null;
  deposit_on: string | null;
  preliminary_on: string | null;
  notary_on: string | null;
  property: { title: string; asking_price: number | null; currency: string } | null;
  client: { full_name: string; source: string | null } | null;
};

const STAGE_DAY: Record<DealStage, keyof DealStat> = {
  viewing: "viewing_on",
  offer: "offer_on",
  deposit: "deposit_on",
  preliminary: "preliminary_on",
  notary: "notary_on",
};

const STALE_DAYS = 14;

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** First day of the period (null = all time). */
function periodStart(period: Period, today: string) {
  if (period === "month") return `${today.slice(0, 7)}-01`;
  if (period === "year") return `${today.slice(0, 4)}-01-01`;
  if (period === "12m") return addDays(today, -365);
  return null;
}

/**
 * Everything on the Statistics page. RLS decides what is visible: brokers see their
 * own deals and clients, managers the whole agency (optionally one broker).
 */
export async function getStatistics(session: SessionContext, period: Period, broker: string, today: string) {
  const supabase = await createClient();
  const from = periodStart(period, today);
  const inPeriod = (day: string | null) => Boolean(day) && (!from || day! >= from) && day! <= today;

  let dealQuery = supabase
    .from("deals")
    .select(
      `id, kind, stage, status, price, currency, commission, closed_on, created_at, updated_at,
      double_sided, partner_agency, partner_side, viewing_on, offer_on, deposit_on, preliminary_on, notary_on,
      property:properties(title, asking_price, currency), client:clients(full_name, source)`
    )
    .eq("organization_id", session.organizationId)
    .limit(5000);
  let clientQuery = supabase
    .from("clients")
    .select("source, created_at")
    .eq("organization_id", session.organizationId)
    .limit(10000);
  if (broker !== "all") {
    dealQuery = dealQuery.eq("broker_id", broker);
    clientQuery = clientQuery.eq("responsible_broker_id", broker);
  }

  const [dealsRes, clientsRes, offersRes] = await Promise.all([
    dealQuery,
    clientQuery,
    supabase.from("deal_offers").select("deal_id, amount, currency, offered_on, created_at").limit(10000),
  ]);
  if (dealsRes.error) console.error("Statistics: deals failed:", dealsRes.error.message);

  const deals = ((dealsRes.data ?? []) as unknown as DealStat[]).map((d) => ({
    ...d,
    price: d.price === null ? null : Number(d.price),
    commission: d.commission === null ? null : Number(d.commission),
    property: d.property
      ? { ...d.property, asking_price: d.property.asking_price === null ? null : Number(d.property.asking_price) }
      : null,
  }));

  const won = deals.filter((d) => d.status === "won" && inPeriod(d.closed_on));
  const lost = deals.filter((d) => d.status === "lost" && inPeriod(sofiaDay(d.updated_at)));
  const open = deals.filter((d) => d.status === "open");
  const touched = deals.filter((d) => inPeriod(sofiaDay(d.created_at)) || won.includes(d));

  // ---- headline numbers
  const commissionTotal = sum(won.map((d) => d.commission ?? 0));
  const summary = {
    won: won.length,
    commission: commissionTotal,
    avgCommission: won.length ? commissionTotal / won.length : null,
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
    // deals entered after the fact (closed before they were created) say nothing about the cycle
    avgCycleDays: average(
      won.filter((d) => d.closed_on! >= sofiaDay(d.created_at)).map((d) => daysBetween(sofiaDay(d.created_at), d.closed_on!))
    ),
    openCount: open.length,
    openExpected: sum(open.map((d) => d.commission ?? 0)),
  };

  // ---- other agencies
  const kindOfDeal = { own: { count: 0, commission: 0 }, double: { count: 0, commission: 0 }, partner: { count: 0, commission: 0 } };
  for (const d of won) {
    const key = d.partner_agency ? "partner" : d.double_sided ? "double" : "own";
    kindOfDeal[key].count++;
    kindOfDeal[key].commission += d.commission ?? 0;
  }
  const agencies = new Map<
    string,
    { name: string; deals: number; won: number; commission: number; bringBuyer: number; haveProperty: number }
  >();
  for (const d of touched) {
    if (!d.partner_agency) continue;
    const key = d.partner_agency.trim().toLocaleLowerCase("bg");
    const row = agencies.get(key) ?? {
      name: d.partner_agency.trim(),
      deals: 0,
      won: 0,
      commission: 0,
      bringBuyer: 0,
      haveProperty: 0,
    };
    row.deals++;
    if (won.includes(d)) {
      row.won++;
      row.commission += d.commission ?? 0;
    }
    if (d.partner_side === "buyer") row.bringBuyer++;
    if (d.partner_side === "seller") row.haveProperty++;
    agencies.set(key, row);
  }
  const partners = [...agencies.values()].sort((a, b) => b.won - a.won || b.deals - a.deals);

  // ---- days between stages (only steps the deal actually reached, with both dates)
  const gaps = new Map<string, { from: DealStage; to: DealStage; days: number[] }>();
  const totals: number[] = [];
  for (const d of touched) {
    const stages = dealStages(d.kind);
    const reached = d.status === "won" ? stages.length - 1 : stages.indexOf(d.stage);
    const day = (stage: DealStage) =>
      stage === "viewing"
        ? (d.viewing_on ?? sofiaDay(d.created_at))
        : stage === "notary" && d.status === "won"
          ? (d.notary_on ?? d.closed_on)
          : (d[STAGE_DAY[stage]] as string | null);
    for (let i = 0; i < reached; i++) {
      const a = day(stages[i]);
      const b = day(stages[i + 1]);
      if (!a || !b || b < a) continue;
      const key = `${stages[i]}-${stages[i + 1]}`;
      const entry = gaps.get(key) ?? { from: stages[i], to: stages[i + 1], days: [] };
      entry.days.push(daysBetween(a, b));
      gaps.set(key, entry);
    }
    if (d.status === "won" && d.closed_on) {
      const start = day("viewing");
      if (start && start <= d.closed_on) totals.push(daysBetween(start, d.closed_on));
    }
  }
  const order = ["viewing-offer", "offer-deposit", "deposit-preliminary", "deposit-notary", "preliminary-notary"];
  const stageTimes = [...gaps.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([, g]) => ({ from: g.from, to: g.to, avgDays: average(g.days)!, count: g.days.length }));
  const totalTime = { avgDays: average(totals), count: totals.length };

  // ---- stale deals: open, no stage change for a while
  const openIds = open.map((d) => d.id);
  const lastChange = new Map<string, string>();
  if (openIds.length > 0) {
    const { data: log } = await supabase
      .from("deal_stage_log")
      .select("deal_id, changed_at")
      .in("deal_id", openIds.slice(0, 500))
      .order("changed_at", { ascending: false });
    for (const row of log ?? []) if (!lastChange.has(row.deal_id)) lastChange.set(row.deal_id, row.changed_at);
  }
  const stale = open
    .map((d) => ({
      id: d.id,
      title: d.property?.title ?? d.client?.full_name ?? "",
      kind: d.kind,
      stage: d.stage,
      days: daysBetween(sofiaDay(lastChange.get(d.id) ?? d.created_at), today),
    }))
    .filter((d) => d.days > STALE_DAYS)
    .sort((a, b) => b.days - a.days)
    .slice(0, 8);

  // ---- where clients come from
  const sources = new Map<string, { source: string | null; clients: number; won: number; commission: number }>();
  const sourceRow = (source: string | null) => {
    const key = source ?? "";
    if (!sources.has(key)) sources.set(key, { source, clients: 0, won: 0, commission: 0 });
    return sources.get(key)!;
  };
  for (const c of clientsRes.data ?? []) if (inPeriod(sofiaDay(c.created_at))) sourceRow(c.source).clients++;
  for (const d of won) {
    if (!d.client) continue;
    const row = sourceRow(d.client.source);
    row.won++;
    row.commission += d.commission ?? 0;
  }
  const clientSources = [...sources.values()].sort((a, b) => b.clients - a.clients || b.won - a.won);

  // ---- offers vs the final price
  const offersByDeal = new Map<string, { amount: number; currency: string; offered_on: string; created_at: string }[]>();
  for (const o of offersRes.data ?? []) {
    const list = offersByDeal.get(o.deal_id) ?? [];
    list.push({ ...o, amount: Number(o.amount) });
    offersByDeal.set(o.deal_id, list);
  }
  const priced = won
    .filter((d) => d.price !== null && d.price > 0)
    .map((d) => {
      const offers = (offersByDeal.get(d.id) ?? [])
        .filter((o) => o.currency === d.currency)
        .sort((a, b) => a.offered_on.localeCompare(b.offered_on) || a.created_at.localeCompare(b.created_at));
      const asking = d.property && d.property.currency === d.currency ? d.property.asking_price : null;
      const first = offers[0]?.amount ?? null;
      return {
        id: d.id,
        title: d.property?.title ?? d.client?.full_name ?? "",
        currency: d.currency,
        closedOn: d.closed_on!,
        asking,
        firstOffer: first,
        final: d.price!,
        offers: (offersByDeal.get(d.id) ?? []).length,
        discount: asking ? (asking - d.price!) / asking : null,
        overFirstOffer: first ? (d.price! - first) / first : null,
      };
    })
    .sort((a, b) => b.closedOn.localeCompare(a.closedOn));
  const offerStats = {
    avgDiscount: average(priced.flatMap((p) => (p.discount === null ? [] : [p.discount]))),
    avgOverFirstOffer: average(priced.flatMap((p) => (p.overFirstOffer === null ? [] : [p.overFirstOffer]))),
    offersPerDeal: average(priced.map((p) => p.offers)),
    rows: priced.slice(0, 10),
  };

  return { summary, kindOfDeal, partners, stageTimes, totalTime, stale, clientSources, offerStats };
}

export type Statistics = Awaited<ReturnType<typeof getStatistics>>;
