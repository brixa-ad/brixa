import "server-only";
import { cache } from "react";
import { addDays, sofiaDay } from "./dates";
import {
  DEFAULT_MISSIONS,
  DEFAULT_RATES,
  badgeCount,
  clampRate,
  levelFor,
  planNumbers,
  streaks,
  type BadgeStats,
  type Level,
  type PlanRates,
  type RateSource,
} from "./game";
import type { SessionContext } from "./session";
import { createClient } from "./supabase/server";
import { workingDays } from "./workdays";

export type Player = {
  profileId: string;
  name: string;
  avatarPath: string | null;
  level: Level;
  streak: { current: number; best: number; today: number };
  stats: BadgeStats;
  badges: number;
};

type AllTimeRow = {
  profile_id: string;
  full_name: string | null;
  email: string;
  avatar_path: string | null;
  commission: number | string;
  deals: number;
  listings: number;
  exclusives: number;
  viewings: number;
  calls: number;
  new_clients: number;
  points: number;
};

/** Everyone in the agency as a player: level, streak, badges. Every colleague may see these. */
export const getPlayers = cache(async (organizationId: string, today: string): Promise<Map<string, Player>> => {
  const supabase = await createClient();
  const [all, days] = await Promise.all([
    supabase.rpc("leaderboard", { target_org: organizationId, period: "all" }),
    supabase.rpc("daily_points", { target_org: organizationId, since: addDays(today, -400) }),
  ]);
  if (all.error) console.error("Loading the players failed:", all.error.message);
  if (days.error) console.error("Loading the points by day failed:", days.error.message);

  const byPerson = new Map<string, Map<string, number>>();
  for (const row of (days.data ?? []) as { profile_id: string; day: string; points: number }[]) {
    if (!byPerson.has(row.profile_id)) byPerson.set(row.profile_id, new Map());
    byPerson.get(row.profile_id)!.set(row.day, row.points);
  }

  const players = new Map<string, Player>();
  for (const r of (all.data ?? []) as AllTimeRow[]) {
    const streak = streaks(byPerson.get(r.profile_id) ?? new Map(), today);
    const stats: BadgeStats = {
      deals: r.deals,
      commission: Number(r.commission),
      listings: r.listings,
      exclusives: r.exclusives,
      viewings: r.viewings,
      calls: r.calls,
      clients: r.new_clients,
      streak: streak.best,
    };
    players.set(r.profile_id, {
      profileId: r.profile_id,
      name: r.full_name || r.email,
      avatarPath: r.avatar_path,
      level: levelFor(r.points),
      streak,
      stats,
      badges: badgeCount(stats),
    });
  }
  return players;
});

export type Rate = { value: number; source: RateSource };

/** Everything the business plan starts from: the goal, what's earned, and the broker's own rates. */
export async function getPlanInputs(session: SessionContext, today: string) {
  const supabase = await createClient();
  const me = session.userId;
  const org = session.organizationId;
  const year = today.slice(0, 4);
  const yearStart = `${year}-01-01`;
  const yearAgo = addDays(today, -365);
  const since = yearAgo < yearStart ? yearAgo : yearStart;
  const yearAgoTs = `${yearAgo}T00:00:00Z`;

  const [plan, goals, won, calls, viewings, listings, agency] = await Promise.all([
    supabase.from("broker_plans").select("yearly_goal, big_why").eq("profile_id", me).maybeSingle(),
    supabase
      .from("broker_goals")
      .select("daily_calls, daily_viewings, daily_listings, yearly_target")
      .eq("organization_id", org)
      .eq("profile_id", me)
      .maybeSingle(),
    supabase
      .from("deals")
      .select("commission:net_commission, closed_on")
      .eq("organization_id", org)
      .eq("broker_id", me)
      .eq("status", "won")
      .gte("closed_on", since),
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", me)
      .eq("type", "call")
      .gte("occurred_at", yearAgoTs),
    supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", me)
      .eq("type", "viewing")
      .gte("occurred_at", yearAgoTs),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("responsible_broker_id", me)
      .in("operation_type", ["sale", "rent"])
      .gte("created_at", yearAgoTs),
    supabase.rpc("leaderboard", { target_org: org, period: "year" }),
  ]);

  const deals = (won.data ?? []).map((d) => ({ commission: Number(d.commission ?? 0), day: d.closed_on as string }));
  const lastYear = deals.filter((d) => d.day > yearAgo);
  const own = {
    deals: lastYear.length,
    commission: lastYear.reduce((s, d) => s + d.commission, 0),
    calls: calls.count ?? 0,
    viewings: viewings.count ?? 0,
    listings: listings.count ?? 0,
  };
  const team = ((agency.data ?? []) as AllTimeRow[]).reduce(
    (s, r) => ({
      deals: s.deals + r.deals,
      commission: s.commission + Number(r.commission),
      calls: s.calls + r.calls,
      viewings: s.viewings + r.viewings,
      listings: s.listings + r.listings,
    }),
    { deals: 0, commission: 0, calls: 0, viewings: 0, listings: 0 }
  );

  // the broker's own numbers when there are enough of them, else the agency's, else a sensible start
  const pick = (key: keyof PlanRates, ownValue: number | null, teamValue: number | null): Rate => {
    if (ownValue !== null && Number.isFinite(ownValue) && ownValue > 0) return { value: clampRate(key, ownValue), source: "own" };
    if (teamValue !== null && Number.isFinite(teamValue) && teamValue > 0) return { value: clampRate(key, teamValue), source: "agency" };
    return { value: DEFAULT_RATES[key], source: "default" };
  };
  const rates = {
    avgCommission: pick("avgCommission", own.deals >= 2 ? own.commission / own.deals : null, team.deals >= 3 ? team.commission / team.deals : null),
    viewingsPerDeal: pick("viewingsPerDeal", own.deals >= 2 ? own.viewings / own.deals : null, team.deals >= 3 ? team.viewings / team.deals : null),
    callsPerViewing: pick("callsPerViewing", own.viewings >= 5 ? own.calls / own.viewings : null, team.viewings >= 10 ? team.calls / team.viewings : null),
    listingsPerDeal: pick("listingsPerDeal", own.deals >= 2 ? own.listings / own.deals : null, team.deals >= 3 ? team.listings / team.deals : null),
  };

  const managerTarget = Number(goals.data?.yearly_target ?? 0);
  const ownGoal = plan.data?.yearly_goal === null || plan.data?.yearly_goal === undefined ? null : Number(plan.data.yearly_goal);
  const goal = ownGoal ?? (managerTarget > 0 ? managerTarget : null);

  return {
    goal,
    goalSource: ownGoal !== null ? ("own" as const) : goal !== null ? ("manager" as const) : null,
    ownGoal,
    managerTarget,
    bigWhy: plan.data?.big_why ?? null,
    earned: deals.filter((d) => d.day >= yearStart).reduce((s, d) => s + d.commission, 0),
    rates,
    workDaysLeft: workingDays(today, `${year}-12-31`),
    managerDaily: {
      calls: goals.data?.daily_calls ?? 0,
      viewings: goals.data?.daily_viewings ?? 0,
      listings: goals.data?.daily_listings ?? 0,
    },
  };
}

export type PlanInputs = Awaited<ReturnType<typeof getPlanInputs>>;

/** The rates as plain numbers. */
export const rateValues = (inputs: PlanInputs): PlanRates => ({
  avgCommission: inputs.rates.avgCommission.value,
  viewingsPerDeal: inputs.rates.viewingsPerDeal.value,
  callsPerViewing: inputs.rates.callsPerViewing.value,
  listingsPerDeal: inputs.rates.listingsPerDeal.value,
});

/**
 * What today and this week ask for: the manager's goals when set, otherwise the plan's numbers,
 * otherwise a sensible start. Monday starts the week.
 */
export async function getMissions(session: SessionContext, today: string, inputs: PlanInputs, pointsToday: number) {
  const supabase = await createClient();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, -((dow + 6) % 7));
  const since = `${addDays(monday, -1)}T00:00:00Z`;

  const [acts, props] = await Promise.all([
    supabase.from("activities").select("type, occurred_at").eq("profile_id", session.userId).in("type", ["call", "viewing"]).gte("occurred_at", since),
    supabase
      .from("properties")
      .select("created_at")
      .eq("organization_id", session.organizationId)
      .eq("responsible_broker_id", session.userId)
      .in("operation_type", ["sale", "rent"])
      .gte("created_at", since),
  ]);
  const inWeek = (iso: string) => sofiaDay(iso) >= monday;

  const plan = inputs.goal !== null ? planNumbers(inputs.goal, inputs.earned, rateValues(inputs), inputs.workDaysLeft) : null;
  const target = (manager: number, fromPlan: number | undefined, fallback: number) =>
    manager > 0 ? { value: manager, source: "manager" as const } : fromPlan ? { value: fromPlan, source: "plan" as const } : { value: fallback, source: "default" as const };

  return {
    calls: {
      done: (acts.data ?? []).filter((a) => a.type === "call" && sofiaDay(a.occurred_at) === today).length,
      target: target(inputs.managerDaily.calls, plan?.perDay.calls, DEFAULT_MISSIONS.dailyCalls),
    },
    points: { done: pointsToday },
    viewings: {
      done: (acts.data ?? []).filter((a) => a.type === "viewing" && inWeek(a.occurred_at)).length,
      target: target(inputs.managerDaily.viewings * 5, plan?.perWeek.viewings, DEFAULT_MISSIONS.weeklyViewings),
    },
    listings: {
      done: (props.data ?? []).filter((p) => inWeek(p.created_at)).length,
      target: target(inputs.managerDaily.listings * 5, plan?.perWeek.listings, DEFAULT_MISSIONS.weeklyListings),
    },
  };
}

export type Missions = Awaited<ReturnType<typeof getMissions>>;
