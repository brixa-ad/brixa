import "server-only";
import type { Dictionary, Lang } from "./i18n/dictionaries";
import { createClient } from "./supabase/server";

export type ClosedDealRow = {
  id: string;
  reported_on: string;
  subtype_id: string;
  settlement_id: string | null;
  neighborhood_id: string | null;
  address: string | null;
  side: "sale" | "purchase";
  conditions: string[];
  construction: string | null;
  parking: boolean;
  area: number;
  price: number;
  parking_price: number | null;
  total_price: number;
  price_per_sqm: number;
  total_per_sqm: number;
  broker_id: string | null;
  colleague_id: string | null;
  colleague_name: string | null;
  colleague_agency: string | null;
  double_sided: boolean;
  property_id: string | null;
  note: string | null;
  subtype: { name: string; name_en: string | null } | null;
  settlement: { name: string; settlement_type: string } | null;
  neighborhood: { name: string } | null;
  broker: { full_name: string | null; email: string } | null;
  colleague: { full_name: string | null; email: string } | null;
};

export const CLOSED_SELECT = `id, reported_on, subtype_id, settlement_id, neighborhood_id, address, side, conditions, construction, parking,
  area, price, parking_price, total_price, price_per_sqm, total_per_sqm, broker_id, colleague_id, colleague_name,
  colleague_agency, double_sided, property_id, note,
  subtype:property_subtypes(name, name_en),
  settlement:geo_settlements(name, settlement_type),
  neighborhood:geo_neighborhoods(name),
  broker:profiles!closed_deals_broker_id_fkey(full_name, email),
  colleague:profiles!closed_deals_colleague_id_fkey(full_name, email)`;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function toClosedDeals(rows: unknown[] | null): ClosedDealRow[] {
  return ((rows ?? []) as ClosedDealRow[]).map((r) => ({
    ...r,
    area: Number(r.area),
    price: Number(r.price),
    parking_price: num(r.parking_price),
    total_price: Number(r.total_price),
    price_per_sqm: Number(r.price_per_sqm),
    total_per_sqm: Number(r.total_per_sqm),
  }));
}

/** Both sides ours, with another agency, or on our own (the other side had no agent). */
export function closedKind(d: Pick<ClosedDealRow, "colleague_id" | "double_sided" | "colleague_name" | "colleague_agency">) {
  if (d.colleague_id || d.double_sided) return "double" as const;
  if (d.colleague_agency || d.colleague_name) return "partner" as const;
  return "single" as const;
}

// ---- periods: month 2026-09, quarter 2026-Q3, half 2026-H2, year 2026
export const CLOSED_PERIODS = ["month", "quarter", "half", "year"] as const;
export type ClosedPeriod = (typeof CLOSED_PERIODS)[number];

const pad = (n: number) => String(n).padStart(2, "0");

/** The period that contains a day, as a key. */
export function periodKey(type: ClosedPeriod, day: string) {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  if (type === "month") return `${year}-${pad(month)}`;
  if (type === "quarter") return `${year}-Q${Math.ceil(month / 3)}`;
  if (type === "half") return `${year}-H${month <= 6 ? 1 : 2}`;
  return String(year);
}

/** First and last day of a period key; null for a malformed key. */
export function periodBounds(type: ClosedPeriod, key: string): { from: string; to: string } | null {
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const span = (y: number, m1: number, m2: number) => ({ from: `${y}-${pad(m1)}-01`, to: `${y}-${pad(m2)}-${pad(lastDay(y, m2))}` });
  let match: RegExpMatchArray | null;
  if (type === "month" && (match = key.match(/^(\d{4})-(\d{2})$/))) {
    const m = Number(match[2]);
    return m >= 1 && m <= 12 ? span(Number(match[1]), m, m) : null;
  }
  if (type === "quarter" && (match = key.match(/^(\d{4})-Q([1-4])$/))) {
    const q = Number(match[2]);
    return span(Number(match[1]), q * 3 - 2, q * 3);
  }
  if (type === "half" && (match = key.match(/^(\d{4})-H([12])$/))) {
    const h = Number(match[2]);
    return span(Number(match[1]), h === 1 ? 1 : 7, h === 1 ? 6 : 12);
  }
  if (type === "year" && (match = key.match(/^(\d{4})$/))) return span(Number(match[1]), 1, 12);
  return null;
}

/** The period before / after. */
export function shiftPeriod(type: ClosedPeriod, key: string, step: -1 | 1) {
  const bounds = periodBounds(type, key)!;
  const [y, m] = (step < 0 ? bounds.from : bounds.to).split("-").map(Number);
  const moved = new Date(Date.UTC(y, m - 1 + step, 15)).toISOString().slice(0, 10);
  return periodKey(type, moved);
}

export function periodLabel(type: ClosedPeriod, key: string, t: Dictionary, lang: Lang) {
  const bounds = periodBounds(type, key)!;
  if (type === "month") {
    const label = new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${bounds.from}T12:00:00Z`)
    );
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const year = key.slice(0, 4);
  // "III тримесечие 2026" in Bulgarian, "Q3 2026" in English
  const n = lang === "bg" ? ["I", "II", "III", "IV"][Number(key.slice(-1)) - 1] : key.slice(-1);
  if (type === "quarter") return t.closedDeals.quarterLabel.replace("{n}", n).replace("{year}", year);
  if (type === "half") return t.closedDeals.halfLabel.replace("{n}", n).replace("{year}", year);
  return year;
}

/** The register, newest first (optionally only a period). */
export async function getClosedDeals(organizationId: string, bounds?: { from: string; to: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("closed_deals")
    .select(CLOSED_SELECT)
    .eq("organization_id", organizationId)
    .order("reported_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5000);
  if (bounds) query = query.gte("reported_on", bounds.from).lte("reported_on", bounds.to);
  const { data, error } = await query;
  if (error) console.error("Loading closed deals failed:", error.message);
  return toClosedDeals(data);
}

const personName = (p: { full_name: string | null; email: string } | null) => (p ? p.full_name || p.email : null);

/** Everything the statistics show for a set of deals. */
export function closedStats(deals: ClosedDealRow[]) {
  const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
  const avg = (list: number[]) => (list.length ? sum(list) / list.length : null);
  const totalArea = sum(deals.map((d) => d.area));

  const kinds = { single: { count: 0, volume: 0 }, double: { count: 0, volume: 0 }, partner: { count: 0, volume: 0 } };
  const sides = { sale: 0, purchase: 0 };
  const agencies = new Map<string, { name: string; count: number; volume: number }>();
  const brokers = new Map<string, { name: string; count: number; volume: number }>();
  const types = new Map<string, { name: { name: string; name_en: string | null } | null; count: number; sqm: number[] }>();
  const places = new Map<string, { name: string; count: number; sqm: number[]; sqmParking: number[] }>();

  for (const d of deals) {
    const kind = closedKind(d);
    kinds[kind].count++;
    kinds[kind].volume += d.total_price;
    sides[d.side]++;
    if (kind === "partner") {
      const name = d.colleague_agency?.trim() || "—";
      const key = name.toLowerCase();
      const row = agencies.get(key) ?? { name, count: 0, volume: 0 };
      row.count++;
      row.volume += d.total_price;
      agencies.set(key, row);
    }
    // every one of our brokers on the deal gets a share of it
    for (const [id, person] of [
      [d.broker_id, d.broker],
      [d.colleague_id, d.colleague],
    ] as const) {
      if (!id) continue;
      const row = brokers.get(id) ?? { name: personName(person) ?? "—", count: 0, volume: 0 };
      row.count++;
      row.volume += d.total_price;
      brokers.set(id, row);
    }
    const type = types.get(d.subtype_id) ?? { name: d.subtype, count: 0, sqm: [] };
    type.count++;
    type.sqm.push(d.price_per_sqm);
    types.set(d.subtype_id, type);

    const placeName = d.neighborhood?.name ?? (d.settlement ? `${d.settlement.settlement_type} ${d.settlement.name}` : "—");
    const placeKey = d.neighborhood_id ?? d.settlement_id ?? "—";
    const place = places.get(placeKey) ?? { name: placeName, count: 0, sqm: [], sqmParking: [] };
    place.count++;
    place.sqm.push(d.price_per_sqm);
    if (d.parking_price) place.sqmParking.push(d.total_per_sqm);
    places.set(placeKey, place);
  }

  return {
    count: deals.length,
    volume: sum(deals.map((d) => d.total_price)),
    avgPrice: avg(deals.map((d) => d.total_price)),
    // weighted by area: total property prices / total m²
    avgSqm: totalArea > 0 ? sum(deals.map((d) => d.price)) / totalArea : null,
    kinds,
    sides,
    agencies: [...agencies.values()].sort((a, b) => b.count - a.count || b.volume - a.volume),
    brokers: [...brokers.values()].sort((a, b) => b.count - a.count || b.volume - a.volume),
    types: [...types.values()]
      .map((x) => ({ name: x.name, count: x.count, avgSqm: avg(x.sqm) }))
      .sort((a, b) => b.count - a.count),
    places: [...places.values()]
      .map((x) => ({ name: x.name, count: x.count, avgSqm: avg(x.sqm), avgSqmParking: avg(x.sqmParking) }))
      .sort((a, b) => b.count - a.count),
  };
}
