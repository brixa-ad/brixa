/**
 * The game: levels from experience (the activity points of all time), streaks of good days,
 * badges in tiers, and the business plan worked backwards from the goal (The Millionaire
 * Real Estate Agent's economic model: goal → deals → viewings → calls).
 * Pure functions — used on the server and in the plan's simulator.
 */
import { addDays } from "./dates";
import { isWorkingDay } from "./workdays";

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** Experience needed for each level (the titles are in the dictionary, game.levels). */
export const LEVEL_XP = [0, 300, 1000, 2500, 5000, 10000, 20000, 40000] as const;

export type Level = {
  /** 0-based */
  index: number;
  xp: number;
  /** where this level starts and the next one begins (null at the top) */
  from: number;
  to: number | null;
  /** 0–1 of the way to the next level */
  progress: number;
};

export function levelFor(xp: number): Level {
  const points = Math.max(0, Math.floor(xp));
  let index = 0;
  while (index + 1 < LEVEL_XP.length && points >= LEVEL_XP[index + 1]) index++;
  const from = LEVEL_XP[index];
  const to = index + 1 < LEVEL_XP.length ? LEVEL_XP[index + 1] : null;
  return { index, xp: points, from, to, progress: to === null ? 1 : (points - from) / (to - from) };
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

/** A good day: at least this many activity points (20 calls, or 4 viewings, or 2 listings…). */
export const STREAK_POINTS = 20;

/**
 * Good days in a row, counted back from today. Weekends and holidays don't break a streak
 * (a good one still counts); today doesn't break it while it's still going.
 */
export function streaks(points: Map<string, number>, today: string, lookBack = 400) {
  const good = (day: string) => (points.get(day) ?? 0) >= STREAK_POINTS;

  let current = 0;
  for (let i = 0, day = today; i < lookBack; i++, day = addDays(day, -1)) {
    if (good(day)) current++;
    else if (day !== today && isWorkingDay(day)) break;
  }

  let best = current;
  let run = 0;
  for (let i = lookBack - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    if (good(day)) best = Math.max(best, ++run);
    else if (isWorkingDay(day) && day !== today) run = 0;
  }
  return { current, best, today: points.get(today) ?? 0 };
}

// ---------------------------------------------------------------------------
// Badges: each area has five tiers (bronze → diamond)
// ---------------------------------------------------------------------------

export const BADGES = {
  deals: [1, 10, 25, 50, 100],
  commission: [10_000, 50_000, 100_000, 250_000, 500_000],
  listings: [1, 10, 50, 100, 250],
  exclusives: [1, 5, 15, 30, 60],
  viewings: [10, 100, 250, 500, 1000],
  calls: [100, 500, 1000, 2500, 5000],
  clients: [10, 50, 100, 250, 500],
  streak: [5, 10, 20, 40, 60],
} as const;

export type BadgeKey = keyof typeof BADGES;
export const BADGE_KEYS = Object.keys(BADGES) as BadgeKey[];
export type BadgeStats = Record<BadgeKey, number>;

/** -1 = not yet; 0–4 = bronze, silver, gold, platinum, diamond. */
export function badgeTier(key: BadgeKey, value: number) {
  const tiers = BADGES[key];
  let tier = -1;
  while (tier + 1 < tiers.length && value >= tiers[tier + 1]) tier++;
  return { tier, next: tier + 1 < tiers.length ? tiers[tier + 1] : null };
}

export const badgeCount = (stats: BadgeStats) => BADGE_KEYS.reduce((n, key) => n + badgeTier(key, stats[key]).tier + 1, 0);

// ---------------------------------------------------------------------------
// The business plan, worked backwards from the goal
// ---------------------------------------------------------------------------

export type RateSource = "own" | "agency" | "default";
export type PlanRates = {
  /** what one deal brings (net, €) */
  avgCommission: number;
  viewingsPerDeal: number;
  callsPerViewing: number;
  listingsPerDeal: number;
};

export const DEFAULT_RATES: PlanRates = { avgCommission: 3000, viewingsPerDeal: 10, callsPerViewing: 8, listingsPerDeal: 2 };

/** Sensible bounds, so thin data can't produce nonsense. */
export const RATE_LIMITS: Record<keyof PlanRates, [number, number]> = {
  avgCommission: [100, 100_000],
  viewingsPerDeal: [1, 50],
  callsPerViewing: [1, 40],
  listingsPerDeal: [0.2, 10],
};

export const clampRate = (key: keyof PlanRates, value: number) =>
  Math.min(RATE_LIMITS[key][1], Math.max(RATE_LIMITS[key][0], value));

/** From the goal to what it takes: the deals, the viewings, the listings and the calls, in total and per day / week / month. */
export function planNumbers(goal: number, earned: number, rates: PlanRates, workDaysLeft: number) {
  const remaining = Math.max(0, goal - earned);
  const deals = Math.ceil(remaining / rates.avgCommission);
  const viewings = Math.ceil(deals * rates.viewingsPerDeal);
  const calls = Math.ceil(viewings * rates.callsPerViewing);
  const listings = Math.ceil(deals * rates.listingsPerDeal);
  const days = Math.max(1, workDaysLeft);
  const weeks = Math.max(1, days / 5);
  const months = Math.max(1, days / 21);
  return {
    remaining,
    deals,
    viewings,
    calls,
    listings,
    perDay: { calls: Math.ceil(calls / days) },
    perWeek: { viewings: Math.ceil(viewings / weeks), listings: Math.ceil(listings / weeks) },
    perMonth: { deals: Math.ceil(deals / months), listings: Math.ceil(listings / months) },
  };
}

export type PlanNumbers = ReturnType<typeof planNumbers>;

/** Missions when there's nothing else to go by. */
export const DEFAULT_MISSIONS = { dailyCalls: 10, weeklyViewings: 3, weeklyListings: 1 };
