import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { one, type Reason, type Tap, type Temperature } from "./signals";

export type SignalClient = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  client_class: string;
  brokerName: string | null;
};

export type TemperatureRow = {
  client: SignalClient;
  temperature: Temperature;
  score: number;
  reasons: Reason[];
  lastOpenAt: string | null;
  lastContactAt: string | null;
};

/** What one client did with the listings sent to them. */
export type LinkActivity = {
  client: SignalClient;
  last: string;
  listings: { id: string | null; title: string; opens: number; seconds: number; photos: number; last: string }[];
  taps: Tap[];
};

type RawClient = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  client_class: string;
  broker: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
};

// the client, with their broker (the filter on the broker needs the inner join)
const CLIENT = `client:clients!inner(id, full_name, phone, email, client_class, responsible_broker_id,
  broker:profiles!clients_responsible_broker_id_fkey(full_name, email))`;

function toClient(raw: RawClient): SignalClient {
  const broker = one(raw.broker);
  return {
    id: raw.id,
    full_name: raw.full_name,
    phone: raw.phone,
    email: raw.email,
    client_class: raw.client_class,
    brokerName: broker ? broker.full_name || broker.email : null,
  };
}

/** The clients at these temperatures — the hottest first. Brokers get their own back (RLS). */
export async function getTemperatures(
  supabase: SupabaseClient,
  organizationId: string,
  { broker, temperatures, limit = 100 }: { broker: string | null; temperatures: Temperature[]; limit?: number }
): Promise<TemperatureRow[]> {
  let query = supabase
    .from("client_temperatures")
    .select(`temperature, score, reasons, last_open_at, last_contact_at, ${CLIENT}`)
    .eq("organization_id", organizationId)
    .in("temperature", temperatures)
    .order("rank", { ascending: false })
    .order("score", { ascending: false })
    .limit(limit);
  if (broker) query = query.eq("client.responsible_broker_id", broker);
  const { data, error } = await query;
  if (error) console.error("Loading temperatures failed:", error.message);
  return (
    (data ?? []) as unknown as {
      temperature: Temperature;
      score: number;
      reasons: Reason[];
      last_open_at: string | null;
      last_contact_at: string | null;
      client: RawClient | RawClient[];
    }[]
  )
    .map((row) => {
      const client = one(row.client);
      return client
        ? {
            client: toClient(client),
            temperature: row.temperature,
            score: row.score,
            reasons: row.reasons ?? [],
            lastOpenAt: row.last_open_at,
            lastContactAt: row.last_contact_at,
          }
        : null;
    })
    .filter((row): row is TemperatureRow => row !== null);
}

/** How many of the broker's clients are at these temperatures. */
export async function countTemperatures(supabase: SupabaseClient, organizationId: string, broker: string, temperatures: Temperature[]) {
  const { count } = await supabase
    .from("client_temperatures")
    .select("client_id, client:clients!inner(responsible_broker_id)", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("temperature", temperatures)
    .eq("client.responsible_broker_id", broker);
  return count ?? 0;
}

/** Who opened the listings sent to them (the last few days), by client — the latest first. */
export async function getLinkActivity(
  supabase: SupabaseClient,
  organizationId: string,
  { broker, days = 7 }: { broker: string | null; days?: number }
): Promise<LinkActivity[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  let query = supabase
    .from("share_events")
    .select(`kind, seconds, photos, occurred_at, property:properties(id, title), ${CLIENT}`)
    .eq("organization_id", organizationId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (broker) query = query.eq("client.responsible_broker_id", broker);
  const { data, error } = await query;
  if (error) console.error("Loading the link activity failed:", error.message);

  const byClient = new Map<string, LinkActivity>();
  for (const row of (data ?? []) as unknown as {
    kind: "open" | Tap;
    seconds: number;
    photos: number;
    occurred_at: string;
    property: { id: string; title: string } | { id: string; title: string }[] | null;
    client: RawClient | RawClient[];
  }[]) {
    const client = one(row.client);
    if (!client) continue;
    const property = one(row.property);
    let entry = byClient.get(client.id);
    if (!entry) {
      entry = { client: toClient(client), last: row.occurred_at, listings: [], taps: [] };
      byClient.set(client.id, entry);
    }
    if (row.kind !== "open") {
      if (!entry.taps.includes(row.kind)) entry.taps.push(row.kind);
      continue;
    }
    const key = property?.id ?? null;
    let listing = entry.listings.find((l) => l.id === key);
    if (!listing) {
      listing = { id: key, title: property?.title ?? "—", opens: 0, seconds: 0, photos: 0, last: row.occurred_at };
      entry.listings.push(listing);
    }
    listing.opens++;
    listing.seconds += row.seconds;
    listing.photos = Math.max(listing.photos, row.photos);
  }
  return [...byClient.values()];
}

/** One client's openings and taps (the client's card). */
export async function getClientEvents(supabase: SupabaseClient, clientId: string) {
  const { data } = await supabase
    .from("share_events")
    .select("id, kind, seconds, photos, occurred_at, property:properties(id, title)")
    .eq("client_id", clientId)
    .order("occurred_at", { ascending: false })
    .limit(20);
  return ((data ?? []) as unknown as {
    id: string;
    kind: "open" | Tap;
    seconds: number;
    photos: number;
    occurred_at: string;
    property: { id: string; title: string } | { id: string; title: string }[] | null;
  }[]).map((row) => ({ ...row, property: one(row.property) }));
}
