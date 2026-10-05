/** How a listing's price stands on the market: 5 stars at least 10% under … 1 star over 10% over. */
export type Stars = 1 | 2 | 3 | 4 | 5;

export type Rating = {
  stars: Stars;
  /** the listing's €/m² against the market, as a fraction (0.08 = 8% over) */
  diff: number;
  /** the market's €/m² */
  benchSqm: number;
  /** what "the market" is: the comparables (added + the agency's), the agency's listings, or the Market page's price */
  basis: "comparables" | "listings" | "reference";
  /** comparables added from the portals; all the comparables */
  added: number;
  pool: number;
  /** the price the market suggests (±5%) */
  estimate: { low: number; mid: number; high: number } | null;
};

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export function toStars(value: unknown): Stars | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as Stars) : null;
}

/** The rating as the database sends it (inside price_rating / property_analysis). */
export function parseRating(raw: unknown): Rating | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const stars = toStars(r.stars);
  const bench = num(r.bench_sqm);
  if (!stars || bench === null) return null;
  const e = r.estimate as { low: unknown; mid: unknown; high: unknown } | null;
  return {
    stars,
    diff: Number(r.diff ?? 0),
    benchSqm: bench,
    basis: r.basis === "comparables" || r.basis === "reference" ? r.basis : "listings",
    added: Number(r.added ?? 0),
    pool: Number(r.pool ?? 0),
    estimate: e ? { low: Number(e.low), mid: Number(e.mid), high: Number(e.high) } : null,
  };
}

/** The portal's name from a listing's address (imot.bg, homes.bg…). */
export function portalOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, "").slice(0, 60);
  } catch {
    return null;
  }
}

/** A listing Brix found on a portal, waiting for the broker to add it. */
export type FoundComparable = { url: string; source: string | null; title: string; priceEur: number; area: number; floor: number | null };
