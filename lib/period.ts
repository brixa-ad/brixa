import { formatDate } from "./format";
import type { Lang } from "./i18n/dictionaries";

/** The statistics' periods: this month, the last 6 months, this year, or any range. */
export const STAT_PERIODS = ["month", "6m", "year", "custom"] as const;
export type StatPeriod = (typeof STAT_PERIODS)[number];
export type StatRange = { period: StatPeriod; from: string; to: string };

const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/** Months back from a day, same day of month (clamped): 2026-09-28 − 6 → 2026-03-28. */
function monthsBack(day: string, months: number) {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** The range the page shows, from ?period= (and ?from= ?to= for "custom"); this year by default. */
export function resolveRange(params: Record<string, string | string[] | undefined>, today: string): StatRange {
  const period = params.period;
  if (period === "custom" && isDay(params.from) && isDay(params.to) && params.from <= params.to) {
    return { period: "custom", from: params.from, to: params.to };
  }
  if (period === "month") return { period, from: `${today.slice(0, 7)}-01`, to: today };
  if (period === "6m") {
    const from = monthsBack(today, 6);
    return { period, from: new Date(Date.parse(from) + 86_400_000).toISOString().slice(0, 10), to: today };
  }
  return { period: "year", from: `${today.slice(0, 4)}-01-01`, to: today };
}

/** The range as query parameters, to carry it between the tabs. */
export function rangeParams(range: StatRange): Record<string, string> {
  if (range.period === "custom") return { period: "custom", from: range.from, to: range.to };
  return range.period === "year" ? {} : { period: range.period };
}

/** "1 януари 2026 – 28 септември 2026" */
export function rangeText(range: StatRange, lang: Lang) {
  return `${formatDate(range.from, lang)} – ${formatDate(range.to, lang)}`;
}

export const inRange = (range: StatRange) => (day: string | null | undefined) => Boolean(day) && day! >= range.from && day! <= range.to;
