/**
 * Market news for clients (migration 058): the database decides who hears what and keeps the
 * numbers; the text is written here, in the broker's language, and the broker sends it.
 */
import { formatNumber } from "./format";
import { fmt, locale, type Dictionary, type Lang } from "./i18n/dictionaries";

export const NEWS_KINDS = ["rates", "prices", "monthly"] as const;
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
    const change =
      data.change !== undefined && data.change !== 0
        ? fmt(t.news.monthlyChange, { change: `${data.change > 0 ? "+" : ""}${formatNumber(data.change, lang, 1)}` })
        : "";
    const listings = data.listings ? fmt(t.news.monthlyListings, { listings: data.listings }) : "";
    parts.push(fmt(t.news.monthlyArea, { area: data.area, sqm: formatNumber(data.sqm, lang) ?? "", change, listings }));
  }
  if (data.rate !== undefined) {
    const before = data.rateBefore;
    const trend =
      before === undefined
        ? ""
        : data.rate < before
          ? fmt(t.news.rateLower, { before: pct(before, lang) })
          : data.rate > before
            ? fmt(t.news.rateHigher, { before: pct(before, lang) })
            : t.news.rateSame;
    parts.push(fmt(t.news.monthlyRate, { rate: pct(data.rate, lang), month: data.rateMonth ? monthName(data.rateMonth, lang) : "", trend }));
  }
  return fmt(t.news.monthly, { ...vars, parts: parts.join("") });
}
