import "server-only";
import { addDays, daysBetween, sofiaDay } from "./dates";
import type { SessionContext } from "./session";
import { createClient } from "./supabase/server";

export type Goals = {
  dailyCalls: number;
  dailyViewings: number;
  dailyListings: number;
  monthlyTarget: number;
  yearlyTarget: number;
};

export type BoardRow = {
  profileId: string;
  name: string;
  avatarPath: string | null;
  commission: number;
  deals: number;
  points: number;
};

/** A broker's own numbers for the home screen. Only confirmed commission counts. */
export async function getMyNumbers(session: SessionContext, today: string) {
  const supabase = await createClient();
  const me = session.userId;
  const org = session.organizationId;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const yearEnd = `${today.slice(0, 4)}-12-31`;
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearAgo = addDays(today, -365);
  const since = new Date(Date.now() - 36 * 3_600_000).toISOString();

  const [won, listings, buyers, goals, profile, membership, acts, listedLately] = await Promise.all([
    supabase
      .from("deals")
      .select("commission, closed_on, confirmed_at")
      .eq("broker_id", me)
      .eq("status", "won")
      .gte("closed_on", yearAgo < yearStart ? yearAgo : yearStart),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("responsible_broker_id", me)
      .eq("status", "active")
      .in("operation_type", ["sale", "rent"]),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("responsible_broker_id", me)
      .overlaps("types", ["buyer", "tenant", "investor"])
      .not("stage", "in", "(deal,lost)"),
    supabase.from("broker_goals").select("*").eq("organization_id", org).eq("profile_id", me).maybeSingle(),
    supabase.from("profiles").select("weekly_hours").eq("id", me).maybeSingle(),
    supabase.from("organization_members").select("created_at").eq("organization_id", org).eq("profile_id", me).maybeSingle(),
    supabase.from("activities").select("type, occurred_at").eq("profile_id", me).gte("occurred_at", since),
    supabase
      .from("properties")
      .select("created_at")
      .eq("organization_id", org)
      .eq("responsible_broker_id", me)
      .in("operation_type", ["sale", "rent"])
      .gte("created_at", since),
  ]);

  const deals = (won.data ?? []).map((d) => ({
    amount: Number(d.commission ?? 0),
    day: d.closed_on as string,
    confirmed: Boolean(d.confirmed_at),
  }));
  const sum = (list: typeof deals) => list.reduce((total, d) => total + d.amount, 0);
  const confirmed = deals.filter((d) => d.confirmed);
  const thisYear = confirmed.filter((d) => d.day >= yearStart);

  const g = goals.data;
  const target: Goals = {
    dailyCalls: g?.daily_calls ?? 0,
    dailyViewings: g?.daily_viewings ?? 0,
    dailyListings: g?.daily_listings ?? 0,
    monthlyTarget: Number(g?.monthly_target ?? 0),
    yearlyTarget: Number(g?.yearly_target ?? 0),
  };

  // What an hour is worth: the last 12 months (or since joining) over the hours worked.
  const weeklyHours = Number(profile.data?.weekly_hours ?? 40);
  const joined = membership.data?.created_at ? sofiaDay(membership.data.created_at) : yearAgo;
  const weeksWorked = Math.min(52, Math.max(1, daysBetween(joined, today) / 7));
  const last12 = sum(confirmed.filter((d) => d.day > yearAgo));
  const hourValue = last12 > 0 ? last12 / (weeklyHours * weeksWorked) : null;

  const ytd = sum(thisYear);
  const weeksLeft = Math.max(1 / 7, (daysBetween(today, yearEnd) + 1) / 7);
  const needPerHour =
    target.yearlyTarget > 0 ? Math.max(0, target.yearlyTarget - ytd) / (weeklyHours * weeksLeft) : null;

  const todays = (acts.data ?? []).filter((a) => sofiaDay(a.occurred_at) === today);

  return {
    ytdDeals: thisYear.length,
    ytdCommission: ytd,
    pendingCommission: sum(deals.filter((d) => !d.confirmed && d.day >= yearStart)),
    monthCommission: sum(confirmed.filter((d) => d.day >= monthStart)),
    activeListings: listings.count ?? 0,
    activeBuyers: buyers.count ?? 0,
    goals: target,
    hourValue,
    needPerHour,
    today: {
      calls: todays.filter((a) => a.type === "call").length,
      viewings: todays.filter((a) => a.type === "viewing").length,
      listings: (listedLately.data ?? []).filter((p) => sofiaDay(p.created_at) === today).length,
    },
  };
}

/** The agency's ranking for this month and this year (commission + activity points). */
export async function getLeaderboards(organizationId: string) {
  const supabase = await createClient();
  const [month, year] = await Promise.all(
    (["month", "year"] as const).map((period) =>
      supabase.rpc("leaderboard", { target_org: organizationId, period })
    )
  );
  const rows = (data: unknown): BoardRow[] =>
    ((data ?? []) as {
      profile_id: string;
      full_name: string | null;
      email: string;
      avatar_path: string | null;
      commission: number | string;
      deals: number;
      points: number;
    }[]).map((r) => ({
      profileId: r.profile_id,
      name: r.full_name || r.email,
      avatarPath: r.avatar_path,
      commission: Number(r.commission),
      deals: r.deals,
      points: r.points,
    }));
  if (month.error) console.error("Loading the ranking failed:", month.error.message);
  return { month: rows(month.data), year: rows(year.data) };
}
