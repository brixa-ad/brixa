import { fmt, locale, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";

/** How a client behaves, worked out by the database (client_temperatures); the class A / B / C follows it. */
export const TEMPERATURES = ["hot", "warm", "cooling", "cold"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

/** A tap on the shared listing's page. */
export const TAPS = ["call", "viber", "whatsapp", "email"] as const;
export type Tap = (typeof TAPS)[number];
export const isTap = (value: unknown): value is Tap => TAPS.includes(value as Tap);

/** Why a client has their temperature — the strongest reason first. */
export type Reason =
  | { code: "tapped"; kind: Tap }
  | { code: "opens"; n: number; days: number }
  | { code: "opened"; at: string }
  | { code: "deal"; stage: string }
  | { code: "stage"; stage: string }
  | { code: "positive"; n: number }
  | { code: "long_look"; minutes: number; photos: number }
  | { code: "quiet"; days: number; cadence: number }
  | { code: "negative"; n: number }
  | { code: "unopened"; n: number }
  | { code: "stopped"; at: string };

/** "2 hours ago", "yesterday" — in the reader's language. */
export function ago(iso: string, lang: Lang) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86_400), "day");
}

/** One reason, in words. */
export function reasonText(reason: Reason, t: Dictionary, lang: Lang) {
  const r = t.signals.reasons;
  switch (reason.code) {
    case "tapped":
      return fmt(r.tapped, { button: t.signals.buttons[reason.kind] ?? reason.kind });
    case "opens":
      return fmt(r.opens, { n: reason.n, days: reason.days });
    case "opened":
      return fmt(r.opened, { when: ago(reason.at, lang) });
    case "deal":
      return fmt(r.deal, { stage: (t.options.dealStage as Record<string, string>)[reason.stage] ?? reason.stage });
    case "stage":
      return fmt(r.stage, { stage: (t.options.stage as Record<string, string>)[reason.stage] ?? reason.stage });
    case "positive":
      return fmt(r.positive, { n: reason.n });
    case "long_look":
      return fmt(r.long_look, { minutes: reason.minutes, photos: reason.photos });
    case "quiet":
      return fmt(r.quiet, { days: reason.days, cadence: reason.cadence });
    case "negative":
      return fmt(r.negative, { n: reason.n });
    case "unopened":
      return fmt(r.unopened, { n: reason.n });
    case "stopped":
      return fmt(r.stopped, { when: ago(reason.at, lang) });
    default:
      return "";
  }
}

/** A to-one embed comes back as an object (or, from older servers, a one-item list). */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
