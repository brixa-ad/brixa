import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Radar, ShieldCheck, Store, UserRound, XCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { FollowButton, FollowLinkForm, WatchActions, WatchForm } from "@/components/market/ScoutParts";
import { Card } from "@/components/ui/form";
import { addDays, sofiaToday } from "@/lib/dates";
import { formatDate, formatPrice } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { fetchAllSettlements } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Category, Region, Subtype } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.scout.title };
}

type Listing = {
  id: string;
  url: string;
  portal: string | null;
  title: string | null;
  place: string | null;
  price_eur: number | null;
  area: number | null;
  private: boolean | null;
  status: "active" | "gone";
  first_seen: string;
  checked_at: string | null;
};
type ListingEvent = { kind: "new" | "price" | "gone" | "back"; price_eur: number | null; old_price_eur: number | null; day: string; created_at: string };

const LISTING = "id, url, portal, title, place, price_eur, area, private, status, first_seen, checked_at";

/**
 * What Brix finds online for this broker every morning: the new listings of the kinds they watch
 * (private sellers marked), the listings they follow (price up or down, gone), and what they watch.
 */
export default async function ScoutPage({ searchParams }: PageProps<"/market/scout">) {
  const params = await searchParams;
  const view = params.view === "tracked" ? "tracked" : params.view === "watches" ? "watches" : "new";
  const onlyPrivate = params.private === "1";
  const session = (await getSession())!;
  const supabase = await createClient();
  const today = sofiaToday();
  const { t, lang } = await getI18n();
  const S = t.scout;

  const [{ data: watchRows }, { data: trackRows }] = await Promise.all([
    supabase
      .from("market_watches")
      .select("id, operation, settlement_id, neighborhood_ids, subtype_ids, price_max, private_only, active, last_run_at, settlement:geo_settlements(name, settlement_type)")
      .eq("profile_id", session.userId)
      .order("created_at"),
    supabase
      .from("market_tracks")
      .select(`created_at, listing:market_listings(${LISTING}, events:market_listing_events(kind, price_eur, old_price_eur, day, created_at))`)
      .eq("profile_id", session.userId)
      .order("created_at", { ascending: false }),
  ]);
  const watches = (watchRows ?? []) as unknown as {
    id: string;
    operation: "sale" | "rent";
    settlement_id: string;
    neighborhood_ids: string[];
    subtype_ids: string[];
    price_max: number | null;
    private_only: boolean;
    active: boolean;
    last_run_at: string | null;
    settlement: { name: string; settlement_type: string } | null;
  }[];
  const tracked = ((trackRows ?? []) as unknown as { listing: (Listing & { events: ListingEvent[] }) | null }[])
    .map((row) => row.listing)
    .filter((l): l is Listing & { events: ListingEvent[] } => Boolean(l));
  const trackedIds = new Set(tracked.map((l) => l.id));

  const price = (value: number | null) => (value === null ? "—" : (formatPrice(Number(value), "EUR", lang) ?? "—"));
  const tabs = [
    { key: "new", label: S.viewNew },
    { key: "tracked", label: `${S.viewTracked}${tracked.length ? ` · ${tracked.length}` : ""}` },
    { key: "watches", label: `${S.viewWatches}${watches.length ? ` · ${watches.length}` : ""}` },
  ];
  const brixOn = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <>
      <PageHeader title={S.title} subtitle={S.subtitle} />
      {!brixOn && <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{S.notConnected}</p>}

      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "new" ? "/market/scout" : `/market/scout?view=${tab.key}`}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === tab.key ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {view === "new" && <NewListings />}
      {view === "tracked" && <Tracked />}
      {view === "watches" && <Watches />}

      <p className="mt-6 flex items-start gap-2 text-xs text-subtle">
        <ShieldCheck className="mt-px size-3.5 shrink-0" />
        {S.legal}
      </p>
    </>
  );

  // ---- the new listings this broker's searches found, the last two weeks
  async function NewListings() {
    let q = supabase
      .from("market_listings")
      .select(`${LISTING}, watch:market_watches!inner(profile_id)`)
      .eq("watch.profile_id", session.userId)
      .gte("first_seen", addDays(today, -14))
      .order("first_seen", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(120);
    if (onlyPrivate) q = q.eq("private", true);
    const { data } = await q;
    const rows = (data ?? []) as unknown as Listing[];

    return (
      <div className="space-y-3">
        <div className="flex gap-1.5">
          <Link href="/market/scout" className={chip(!onlyPrivate)}>
            {S.all}
          </Link>
          <Link href="/market/scout?private=1" className={chip(onlyPrivate)}>
            <UserRound className="size-3.5" />
            {S.privateOnly}
          </Link>
        </div>
        {rows.length === 0 ? (
          <Card>
            <p className="flex items-start gap-2 text-sm text-muted">
              <Radar className="mt-0.5 size-4 shrink-0 text-brand-cyan" />
              {S.none}
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {rows.map((l) => (
              <ListingRow key={l.id} listing={l} note={fmt(S.found, { date: formatDate(l.first_seen, lang) })} />
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ---- what this broker follows: the latest change on each
  function Tracked() {
    return (
      <div className="space-y-4">
        {tracked.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">{S.noneTracked}</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {tracked.map((l) => {
              const last = [...l.events].filter((e) => e.kind !== "new").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
              const change = !last
                ? null
                : last.kind === "gone"
                  ? { tone: "text-danger", icon: <XCircle className="size-3.5" />, text: fmt(S.goneOn, { date: formatDate(last.day, lang) }) }
                  : last.kind === "price" && last.old_price_eur !== null && last.price_eur !== null
                    ? Number(last.price_eur) < Number(last.old_price_eur)
                      ? { tone: "text-success", icon: <ArrowDownRight className="size-3.5" />, text: fmt(S.priceDown, { old: price(last.old_price_eur), now: price(last.price_eur) }) }
                      : { tone: "text-warning", icon: <ArrowUpRight className="size-3.5" />, text: fmt(S.priceUp, { old: price(last.old_price_eur), now: price(last.price_eur) }) }
                    : null;
              return (
                <ListingRow
                  key={l.id}
                  listing={l}
                  change={change}
                  note={l.checked_at ? fmt(S.checked, { date: formatDate(l.checked_at, lang) }) : S.notChecked}
                />
              );
            })}
          </ul>
        )}
        <Card title={S.followLink} description={S.followLinkHint}>
          <FollowLinkForm />
        </Card>
      </div>
    );
  }

  // ---- what this broker watches, and a new search
  async function Watches() {
    const hoodIds = [...new Set(watches.flatMap((w) => w.neighborhood_ids))];
    const [{ data: hoods }, { data: categories }, { data: subtypes }, { data: regions }, settlements] = await Promise.all([
      hoodIds.length ? supabase.from("geo_neighborhoods").select("id, name").in("id", hoodIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      supabase.from("property_categories").select("id, code, name, name_en").order("sort_order"),
      supabase.from("property_subtypes").select("id, category_id, code, name, name_en").order("sort_order"),
      supabase.from("geo_regions").select("id, code, name").order("name"),
      fetchAllSettlements(supabase),
    ]);
    const hoodName = new Map((hoods ?? []).map((h) => [h.id, h.name]));
    const subtypeById = new Map(((subtypes ?? []) as Subtype[]).map((s) => [s.id, s]));
    const varna = settlements.find((s) => s.name === "Варна" && s.settlement_type === "гр.");

    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="text-sm text-muted">{S.watchesHint}</p>
          {watches.map((w) => (
            <Card key={w.id} className={w.active ? "" : "opacity-60"}>
              <p className="font-semibold">
                {w.operation === "rent" ? S.rent : S.sale} · {w.settlement?.name ?? "—"}
                {w.private_only && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-fg">
                    <UserRound className="size-3" />
                    {S.privateOnly}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-fg-2">
                {[
                  w.neighborhood_ids.length ? w.neighborhood_ids.map((id) => hoodName.get(id)).filter(Boolean).join(", ") : S.anyArea,
                  w.subtype_ids.length ? w.subtype_ids.map((id) => subtypeById.get(id)).filter(Boolean).map((s) => localName(s!, lang)).join(", ") : S.anyKind,
                  w.price_max ? `≤ ${price(w.price_max)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-xs text-muted">{w.last_run_at ? fmt(S.lastRun, { date: formatDate(w.last_run_at, lang, true) }) : S.never}</p>
              <div className="mt-3">
                <WatchActions id={w.id} active={w.active} />
              </div>
            </Card>
          ))}
        </div>
        {watches.length < 5 && (
          <Card title={S.newWatch}>
            <WatchForm
              regions={(regions ?? []) as Region[]}
              settlements={settlements}
              categories={(categories ?? []) as Category[]}
              subtypes={(subtypes ?? []) as Subtype[]}
              defaultSettlementId={watches[0]?.settlement_id ?? varna?.id ?? null}
            />
          </Card>
        )}
      </div>
    );
  }

  function ListingRow({ listing: l, note, change }: { listing: Listing; note: string; change?: { tone: string; icon: React.ReactNode; text: string } | null }) {
    const perSqm = l.price_eur && l.area ? Math.round(Number(l.price_eur) / Number(l.area)) : null;
    return (
      <li className={`rounded-2xl border border-line bg-surface p-4 shadow-xs ${l.status === "gone" ? "opacity-60" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{l.title || l.url}</p>
            <p className="mt-0.5 text-sm text-fg-2">
              {[
                price(l.price_eur),
                l.area ? `${Math.round(Number(l.area))} м²` : null,
                perSqm ? fmt(S.perSqm, { price: formatPrice(perSqm, "EUR", lang) ?? "" }) : null,
                l.place,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {l.private === true && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success">
                  <UserRound className="size-3" />
                  {S.private}
                </span>
              )}
              {l.private === false && (
                <span className="inline-flex items-center gap-1">
                  <Store className="size-3" />
                  {S.agency}
                </span>
              )}
              {l.portal && <span>{l.portal}</span>}
              <span>{note}</span>
              {l.status === "gone" && <span className="font-semibold text-danger">{S.gone}</span>}
            </p>
            {change && (
              <p className={`mt-1.5 inline-flex items-center gap-1 text-sm font-semibold ${change.tone}`}>
                {change.icon}
                {change.text}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-fg-2 transition hover:bg-raised">
              <ExternalLink className="size-3.5" />
              {S.open}
            </a>
            <FollowButton listingId={l.id} following={trackedIds.has(l.id)} />
          </div>
        </div>
      </li>
    );
  }
}

const chip = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${on ? "border-accent bg-accent text-on-accent" : "border-line-strong text-fg-2 hover:border-subtle"}`;

