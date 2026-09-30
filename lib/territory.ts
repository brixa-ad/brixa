import "server-only";
import { sameBroker } from "./broker-stats";
import { getMembers } from "./lookups";
import type { SessionContext } from "./session";
import { createClient } from "./supabase/server";

/** Points in a neighbourhood: a deal (last year) 10, an active listing 3 (+2 exclusive), a viewing (90 days) 1. */
export const TERRITORY_POINTS = { deal: 10, listing: 3, exclusive: 2, viewing: 1 };
/** Where each level starts (the titles are in the dictionary, territory.levels). */
export const TERRITORY_LEVELS = [1, 10, 30, 60, 100];

export function territoryLevel(points: number) {
  let index = -1;
  while (index + 1 < TERRITORY_LEVELS.length && points >= TERRITORY_LEVELS[index + 1]) index++;
  const next = index + 1 < TERRITORY_LEVELS.length ? TERRITORY_LEVELS[index + 1] : null;
  const from = index >= 0 ? TERRITORY_LEVELS[index] : 0;
  return { index, next, progress: next === null ? 1 : (points - from) / (next - from) };
}

type Counts = { listings: number; exclusives: number; deals: number; viewings: number };
const zero = (): Counts => ({ listings: 0, exclusives: 0, deals: 0, viewings: 0 });
const add = (a: Counts, b: Counts) => {
  a.listings += b.listings;
  a.exclusives += b.exclusives;
  a.deals += b.deals;
  a.viewings += b.viewings;
};
export const pointsOf = (c: Counts) =>
  c.deals * TERRITORY_POINTS.deal + c.listings * TERRITORY_POINTS.listing + c.exclusives * TERRITORY_POINTS.exclusive + c.viewings * TERRITORY_POINTS.viewing;

export type Territory = {
  id: string;
  name: string;
  town: string;
  agency: Counts;
  mine: Counts;
  /** everyone's points here, the strongest first */
  ranking: { profileId: string; name: string; points: number }[];
};

/** Every neighbourhood where the agency works: the agency's numbers, mine, and who leads it. */
export async function getTerritories(session: SessionContext): Promise<Territory[]> {
  const supabase = await createClient();
  const [{ data, error }, members] = await Promise.all([
    supabase.rpc("territory_board", { target_org: session.organizationId }),
    getMembers(supabase, session.organizationId),
  ]);
  if (error) console.error("Loading the territory board failed:", error.message);

  const map = new Map<string, Territory & { byBroker: Map<string, Counts> }>();
  for (const r of (data ?? []) as {
    neighborhood_id: string;
    neighborhood: string;
    town: string;
    broker_id: string | null;
    broker_name: string | null;
    listings: number;
    exclusives: number;
    deals: number;
    viewings: number;
  }[]) {
    const t = map.get(r.neighborhood_id) ?? {
      id: r.neighborhood_id,
      name: r.neighborhood,
      town: r.town,
      agency: zero(),
      mine: zero(),
      ranking: [],
      byBroker: new Map<string, Counts>(),
    };
    const counts = { listings: r.listings, exclusives: r.exclusives, deals: r.deals, viewings: r.viewings };
    add(t.agency, counts);
    // the register writes brokers by name: find the colleague
    const who =
      r.broker_id ?? members.find((m) => sameBroker(r.broker_name, m.full_name || m.email))?.profile_id ?? null;
    if (who) {
      const c = t.byBroker.get(who) ?? zero();
      add(c, counts);
      t.byBroker.set(who, c);
    }
    map.set(r.neighborhood_id, t);
  }

  return [...map.values()]
    .map(({ byBroker, ...t }) => ({
      ...t,
      mine: byBroker.get(session.userId) ?? zero(),
      ranking: [...byBroker.entries()]
        .map(([profileId, c]) => {
          const m = members.find((x) => x.profile_id === profileId);
          return { profileId, name: m ? m.full_name || m.email : "—", points: pointsOf(c) };
        })
        .filter((r) => r.points > 0)
        .sort((a, b) => b.points - a.points),
    }))
    .sort((a, b) => a.town.localeCompare(b.town, "bg") || pointsOf(b.agency) - pointsOf(a.agency));
}
