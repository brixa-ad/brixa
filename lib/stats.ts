import "server-only";
import { toEuro } from "./commission";
import { addDays, daysBetween, sofiaDay } from "./dates";
import type { DealKind } from "./options";
import type { SessionContext } from "./session";
import { createClient } from "./supabase/server";

export type Goals = {
  dailyCalls: number;
  dailyViewings: number;
  dailyListings: number;
  monthlyTarget: number;
  yearlyTarget: number;
  monthlyBonus: string | null;
  yearlyBonus: string | null;
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
      .select("commission, closed_on, confirmed_at, price, currency")
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
    // the sale price in euro (USD can't be converted — left out)
    volume: d.price === null ? 0 : (toEuro(Number(d.price), d.currency) ?? 0),
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
    monthlyBonus: g?.monthly_bonus ?? null,
    yearlyBonus: g?.yearly_bonus ?? null,
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
    ytdTurnover: thisYear.reduce((total, d) => total + d.volume, 0),
    pendingTurnover: deals.filter((d) => !d.confirmed && d.day >= yearStart).reduce((total, d) => total + d.volume, 0),
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

const STEP_COLUMNS = ["viewing_on", "offer_on", "deposit_on", "preliminary_on", "notary_on"] as const;
const STEPS = ["viewing", "offer", "deposit", "preliminary", "notary"] as const;

export type UpcomingStep = {
  dealId: string;
  title: string;
  kind: DealKind;
  stage: (typeof STEPS)[number];
  day: string;
  /** HH:MM, when scheduled at a set time */
  time: string | null;
  brokerName: string | null;
};

/** Scheduled deal steps in the next two weeks (own deals; managers: the whole agency). */
export async function getUpcomingSteps(session: SessionContext, today: string): Promise<UpcomingStep[]> {
  const supabase = await createClient();
  const until = addDays(today, 14);
  let query = supabase
    .from("deals")
    .select(
      `id, kind, stage, broker_id, ${STEP_COLUMNS.join(", ")}, ${STEPS.map((s) => `${s}_time`).join(", ")},
      property:properties(title), client:clients(full_name), broker:profiles!deals_broker_id_fkey(full_name, email)`
    )
    .eq("organization_id", session.organizationId)
    .eq("status", "open")
    .or(STEP_COLUMNS.map((c) => `and(${c}.gte.${today},${c}.lte.${until})`).join(","));
  if (!session.isManager) query = query.eq("broker_id", session.userId);
  const { data, error } = await query;
  if (error) {
    console.error("Loading upcoming deal steps failed:", error.message);
    return [];
  }

  const steps: UpcomingStep[] = [];
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const current = STEPS.indexOf(row.stage as (typeof STEPS)[number]);
    STEPS.forEach((stage, index) => {
      const day = row[STEP_COLUMNS[index]] as string | null;
      if (!day || day < today || day > until) return;
      // Only steps still ahead (the viewing / the notary while the deal waits at it).
      if (index < current || (index === current && stage !== "viewing" && stage !== "notary")) return;
      const property = row.property as { title: string } | null;
      const client = row.client as { full_name: string } | null;
      const broker = row.broker as { full_name: string | null; email: string } | null;
      steps.push({
        dealId: row.id as string,
        title: property?.title ?? client?.full_name ?? "",
        kind: row.kind as DealKind,
        stage,
        day,
        time: (row[`${stage}_time`] as string | null)?.slice(0, 5) ?? null,
        brokerName: row.broker_id === session.userId ? null : (broker?.full_name || broker?.email || null),
      });
    });
  }
  return steps.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? "99").localeCompare(b.time ?? "99"));
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
