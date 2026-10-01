import { mondayOf } from "@/lib/calendar";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** A point of a listing's marketing plan: the agency's (by key) or its own (with its words). */
export type MarketingPoint = { key: string; label?: string | null; weekly?: boolean };

/** One time a point was done. */
export type MarketingDone = { id: string; key: string; done_on: string; auto: boolean; done_by: string | null };

/** The template's points that have their words in the dictionary. */
export const MARKETING_KEYS = [
  "photos",
  "video",
  "drone",
  "tour3d",
  "portals",
  "social",
  "ads",
  "sign",
  "flyers",
  "open_house",
  "colleagues",
  "farming",
  "buyers",
  "owner_report",
] as const;

export const pointLabel = (point: MarketingPoint, t: Dictionary) =>
  point.label || (t.marketing.points as Record<string, string>)[point.key] || point.key;

/** A listing's plan: the agency's template less what's left out, then its own points. */
export function listingPlan(template: MarketingPoint[], hidden: string[], extra: MarketingPoint[]) {
  return {
    shown: [...template.filter((p) => !hidden.includes(p.key)), ...extra],
    hidden: template.filter((p) => hidden.includes(p.key)),
  };
}

/** Where a point stands: done when (a weekly one: this week), or planned (an open house ahead). */
export function pointState(point: MarketingPoint, done: MarketingDone[], today: string) {
  const mine = done.filter((d) => d.key === point.key).sort((a, b) => b.done_on.localeCompare(a.done_on));
  const past = mine.filter((d) => d.done_on <= today);
  const ahead = mine.filter((d) => d.done_on > today);
  const last = past[0] ?? null;
  const week = mondayOf(today);
  const ok = point.weekly ? Boolean(last && last.done_on >= week) : Boolean(last);
  return { ok, last, times: past.length, planned: ahead.at(-1) ?? null, latest: mine[0] ?? null };
}

/** A new own point's key. */
export const extraKey = () => `x-${Math.random().toString(36).slice(2, 10)}`;

/** A template as saved: the keys, the own points' words, weekly or not. */
export function cleanTemplate(items: unknown): MarketingPoint[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is MarketingPoint => Boolean(item) && typeof (item as MarketingPoint).key === "string")
    .map((item) => ({
      key: item.key.slice(0, 60),
      ...(item.label ? { label: String(item.label).slice(0, 80) } : {}),
      ...(item.weekly ? { weekly: true } : {}),
    }));
}
