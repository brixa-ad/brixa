/**
 * Market news for clients (migration 058) and the follow-up lanes' messages (060): the database
 * decides who hears what and keeps the numbers; the text is written here, in the broker's
 * language, and the broker sends it.
 */
import { formatNumber } from "./format";
import { fmt, locale, type Dictionary, type Lang } from "./i18n/dictionaries";

export const NEWS_KINDS = ["rates", "prices", "monthly", "warm_analysis", "warm_rates", "warm_call", "tips", "breakup"] as const;
export type NewsKind = (typeof NEWS_KINDS)[number];
export const isNewsKind = (value: unknown): value is NewsKind => (NEWS_KINDS as readonly unknown[]).includes(value);

export type NewsData = {
  // the rates fell
  from?: number;
  fromMonth?: string;
  to?: number;
  toMonth?: string;
  // a neighbourhood got pricier (role: owns a home there, or searches there)
  role?: "owner" | "buyer";
  area?: string;
  change?: number;
  sqm?: number;
  since?: string;
  // the monthly note
  listings?: number;
  rate?: number;
  rateMonth?: string;
  rateBefore?: number;
  // the month's tip (YYYY-MM)
  month?: string;
};

/** "2026-08" → "август 2026" */
export function monthName(month: string, lang: Lang) {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale(lang), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, m - 1, 1)));
}

/** "2026-08-15" → "август" (with the year when it isn't this one) */
function sinceName(day: string, lang: Lang, today: string) {
  const [year, m] = day.split("-").map(Number);
  const sameYear = String(year) === today.slice(0, 4);
  return new Intl.DateTimeFormat(locale(lang), { month: "long", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(
    new Date(Date.UTC(year, m - 1, 1))
  );
}

/** A loan's monthly payment (annuity), for the example in the text. */
function payment(amount: number, ratePercent: number, months: number) {
  const i = ratePercent / 100 / 12;
  return i === 0 ? amount / months : (amount * i) / (1 - Math.pow(1 + i, -months));
}

const pct = (value: number, lang: Lang) => formatNumber(value, lang, 2) ?? String(value);

/** The chip on top of a piece of news. */
export function newsTitle(kind: NewsKind, data: NewsData, t: Dictionary, lang: Lang) {
  if (kind === "prices") return fmt(t.news.pricesTitle, { area: data.area ?? "", change: formatNumber(data.change ?? 0, lang, 1) ?? "" });
  return t.news.kinds[kind];
}

/** How the rate moved in three months: ", lower than 2.43% three months ago". */
function rateTrend(data: NewsData, t: Dictionary, lang: Lang) {
  const before = data.rateBefore;
  if (before === undefined || data.rate === undefined) return "";
  return data.rate < before
    ? fmt(t.news.rateLower, { before: pct(before, lang) })
    : data.rate > before
      ? fmt(t.news.rateHigher, { before: pct(before, lang) })
      : t.news.rateSame;
}

/** The area's numbers in a sentence: " (+5% over the last months), with 12 homes on the market now". */
function areaExtras(data: NewsData, t: Dictionary, lang: Lang) {
  const change =
    data.change !== undefined && data.change !== 0
      ? fmt(t.news.monthlyChange, { change: `${data.change > 0 ? "+" : ""}${formatNumber(data.change, lang, 1)}` })
      : "";
  const listings = data.listings ? fmt(t.news.monthlyListings, { listings: data.listings }) : "";
  return { change, listings };
}

/** The message, ready to send. */
export function newsText(
  kind: NewsKind,
  data: NewsData,
  vars: { name: string; broker: string },
  t: Dictionary,
  lang: Lang,
  today: string
) {
  if (kind === "rates" && data.from !== undefined && data.to !== undefined) {
    const monthly = payment(100000, data.from, 300) - payment(100000, data.to, 300);
    return fmt(t.news.rates, {
      ...vars,
      from: pct(data.from, lang),
      fromMonth: data.fromMonth ? monthName(data.fromMonth, lang) : "",
      to: pct(data.to, lang),
      toMonth: data.toMonth ? monthName(data.toMonth, lang) : "",
      monthly: formatNumber(Math.round(monthly), lang) ?? "",
      total: formatNumber(Math.round((monthly * 300) / 100) * 100, lang) ?? "",
    });
  }
  if (kind === "warm_analysis") {
    return fmt(t.news.warmAnalysis, { ...vars, area: data.area ?? "", sqm: formatNumber(data.sqm ?? 0, lang) ?? "", ...areaExtras(data, t, lang) });
  }
  if (kind === "warm_rates") {
    return fmt(data.role === "buyer" ? t.news.warmRatesBuyer : t.news.warmRatesOwner, {
      ...vars,
      rate: pct(data.rate ?? 0, lang),
      month: data.rateMonth ? monthName(data.rateMonth, lang) : "",
      trend: rateTrend(data, t, lang),
    });
  }
  if (kind === "warm_call") {
    return fmt(t.news.warmCall, { ...vars, rateLine: data.rate !== undefined ? fmt(t.news.warmCallRate, { rate: pct(data.rate, lang) }) : "" });
  }
  if (kind === "tips") {
    const month = data.month ?? today.slice(0, 7);
    const index = Number(month.slice(5, 7)) - 1;
    const name = new Intl.DateTimeFormat(locale(lang), { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, index, 1)));
    return fmt(t.news.tips, { ...vars, month: name, tip: t.news.tipsList[index] ?? t.news.tipsList[0] });
  }
  if (kind === "breakup") return fmt(t.news.breakup, vars);
  if (kind === "prices") {
    return fmt(data.role === "buyer" ? t.news.pricesBuyer : t.news.pricesOwner, {
      ...vars,
      area: data.area ?? "",
      change: formatNumber(data.change ?? 0, lang, 1) ?? "",
      sqm: formatNumber(data.sqm ?? 0, lang) ?? "",
      since: data.since ? sinceName(data.since, lang, today) : "",
    });
  }
  // the monthly note: the neighbourhood (when BRIXA knows its prices) and the rates
  const parts: string[] = [];
  if (data.area && data.sqm) {
    parts.push(fmt(t.news.monthlyArea, { area: data.area, sqm: formatNumber(data.sqm, lang) ?? "", ...areaExtras(data, t, lang) }));
  }
  if (data.rate !== undefined) {
    parts.push(fmt(t.news.monthlyRate, { rate: pct(data.rate, lang), month: data.rateMonth ? monthName(data.rateMonth, lang) : "", trend: rateTrend(data, t, lang) }));
  }
  return fmt(t.news.monthly, { ...vars, parts: parts.join("") });
}
