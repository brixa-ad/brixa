import "server-only";
import { colleagueIsOurs, type ClosedDealRow } from "./closed-deals";
import { addDays, sofiaDay } from "./dates";
import { inRange, type StatRange } from "./period";
import type { SessionContext } from "./session";
import { createClient } from "./supabase/server";

const words = (name: string | null | undefined) =>
  (name ?? "")
    .toLocaleLowerCase("bg")
    .split(/[\s.,-]+/)
    .filter(Boolean);

/**
 * The register writes brokers as plain names: "Иван Иванов" is the profile "Иван Петров Иванов",
 * but a lone first name could be anyone and isn't counted.
 */
export function sameBroker(registerName: string | null | undefined, profileName: string) {
  const a = words(registerName);
  const b = words(profileName);
  if (!a.length || !b.length) return false;
  if (a.join(" ") === b.join(" ")) return true;
  return a.length >= 2 && a.every((w) => b.includes(w));
}

/** The register's deals one of our brokers took part in (as the broker, or as our colleague on the other side). */
export function brokerRegister(deals: ClosedDealRow[], name: string, agencyName: string) {
  return deals.filter(
    (d) => sameBroker(d.broker_name, name) || (colleagueIsOurs(d, agencyName) && sameBroker(d.colleague_name, name))
  );
}

/** A broker's work in a period: activities, tasks, new clients, listings, what they sent. */
export async function getBrokerActivity(session: SessionContext, range: StatRange, brokerId: string) {
  const supabase = await createClient();
  const org = session.organizationId;
  const inPeriod = inRange(range);
  // a day either side, then by the day in Sofia
  const since = `${addDays(range.from, -1)}T00:00:00Z`;
  const until = `${addDays(range.to, 1)}T23:59:59Z`;

  const [acts, tasks, clients, listings, shares, reports] = await Promise.all([
    supabase
      .from("activities")
      .select("type, occurred_at")
      .eq("organization_id", org)
      .eq("profile_id", brokerId)
      .gte("occurred_at", since)
      .lte("occurred_at", until)
      .limit(20000),
    supabase
      .from("tasks")
      .select("status")
      .eq("organization_id", org)
      .eq("assigned_to", brokerId)
      .gte("due_date", range.from)
      .lte("due_date", range.to)
      .limit(20000),
    supabase
      .from("clients")
      .select("types, created_at")
      .eq("organization_id", org)
      .eq("responsible_broker_id", brokerId)
      .gte("created_at", since)
      .lte("created_at", until)
      .limit(20000),
    supabase
      .from("properties")
      .select("operation_type, status, exclusive_contract, created_at")
      .eq("organization_id", org)
      .eq("responsible_broker_id", brokerId)
      .in("operation_type", ["sale", "rent"])
      .limit(20000),
    supabase
      .from("property_shares")
      .select("views, created_at")
      .eq("organization_id", org)
      .eq("created_by", brokerId)
      .gte("created_at", since)
      .lte("created_at", until)
      .limit(20000),
    supabase
      .from("owner_reports")
      .select("created_at")
      .eq("organization_id", org)
      .eq("created_by", brokerId)
      .gte("created_at", since)
      .lte("created_at", until)
      .limit(20000),
  ]);
  for (const res of [acts, tasks, clients, listings, shares, reports]) {
    if (res.error) console.error("Broker statistics:", res.error.message);
  }

  const activity = { call: 0, viewing: 0, meeting: 0, message: 0, email: 0 };
  for (const a of acts.data ?? []) {
    if (!inPeriod(sofiaDay(a.occurred_at))) continue;
    if (a.type in activity) activity[a.type as keyof typeof activity]++;
  }

  const taskRows = tasks.data ?? [];
  const newClients = (clients.data ?? []).filter((c) => inPeriod(sofiaDay(c.created_at)));
  const clientTypes = { buyer: 0, seller: 0, tenant: 0, landlord: 0, investor: 0 };
  for (const c of newClients) for (const type of c.types as string[]) if (type in clientTypes) clientTypes[type as keyof typeof clientTypes]++;

  const allListings = listings.data ?? [];
  const fresh = allListings.filter((p) => inPeriod(sofiaDay(p.created_at)));
  const sent = (shares.data ?? []).filter((s) => inPeriod(sofiaDay(s.created_at)));

  return {
    activity,
    tasks: { total: taskRows.length, done: taskRows.filter((t) => t.status === "done").length },
    clients: { total: newClients.length, byType: clientTypes },
    listings: {
      new: fresh.length,
      newSale: fresh.filter((p) => p.operation_type === "sale").length,
      newRent: fresh.filter((p) => p.operation_type === "rent").length,
      exclusive: fresh.filter((p) => p.exclusive_contract).length,
      active: allListings.filter((p) => p.status === "active").length,
    },
    shares: { sent: sent.length, opened: sent.filter((s) => s.views > 0).length },
    ownerReports: (reports.data ?? []).filter((r) => inPeriod(sofiaDay(r.created_at))).length,
  };
}
