import type { Metadata } from "next";
import Link from "next/link";
import { FileUp, Building2, Plus } from "lucide-react";
import { ListingCard } from "@/components/listing/ListingCard";
import { PageHeader } from "@/components/PageHeader";
import { PropertyFilters } from "@/components/property/PropertyFilters";
import { buttonClass } from "@/components/ui/form";
import { formatNumber, formatPrice, settlementLabel } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getPlayers } from "@/lib/game-server";
import { getMembers } from "@/lib/lookups";
import { OPERATION_TYPES, STATUSES, isOneOf } from "@/lib/options";
import { signPhotoUrls } from "@/lib/photos-server";
import { fromQuery, memberBack } from "@/lib/member-back";
import { sofiaToday } from "@/lib/dates";
import { toStars } from "@/lib/rating";
import { getSession } from "@/lib/session";
import { ago } from "@/lib/signals";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.list.title };
}

const LIMIT = 200;

// the section's tabs: whose listings, and where they are
const VIEWS = {
  mine: ["active", "reserved"],
  sold: ["sold", "rented"],
  withdrawn: ["withdrawn", "sold_elsewhere"],
  colleagues: ["active", "reserved"],
  // "from the sleeve": not advertised — the whole agency's
  offmarket: ["active", "reserved"],
} as const;
type View = keyof typeof VIEWS;

type ListRow = {
  id: string;
  title: string;
  status: string;
  operation_type: string;
  area: number | null;
  rooms: number | null;
  bedrooms: number | null;
  floor: number | null;
  current_price: number | null;
  currency: string;
  off_market: boolean;
  exclusive_contract: boolean;
  /** how the price stands on the market, kept on the listing */
  market_stars: number | null;
  created_at: string;
  responsible_broker_id: string | null;
  owner: { phone: string | null } | null;
  subtype: { name: string; name_en: string | null } | null;
  settlement: { name: string; settlement_type: string } | null;
  neighborhood: { name: string } | null;
  photos: { storage_path: string }[];
  broker: { full_name: string | null; email: string; avatar_path: string | null; phone: string | null } | null;
};

export default async function PropertiesPage({ searchParams }: PageProps<"/properties">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.replace(/[,()%_\\]/g, " ").trim() : "";
  const op = isOneOf(OPERATION_TYPES, params.op) ? params.op : "";
  const status = isOneOf(STATUSES, params.status) ? params.status : "";
  const cat = typeof params.cat === "string" ? params.cat : "";
  const brokerParam = typeof params.broker === "string" ? params.broker : "";
  const view = typeof params.view === "string" && params.view in VIEWS ? (params.view as View) : null;

  const session = (await getSession())!;
  const supabase = await createClient();
  const { t, lang } = await getI18n();
  // "me" is the quick "only mine" filter
  const broker = brokerParam === "me" ? session.userId : brokerParam;
  // Opened from a colleague's profile → a way back there, and their listings remember it.
  const back = brokerParam === "me" ? null : await memberBack(broker, session.organizationId);

  let query = supabase
    .from("properties")
    .select(
      `id, title, status, operation_type, area, rooms, bedrooms, floor, current_price, currency, off_market, exclusive_contract, market_stars,
      created_at, responsible_broker_id, owner:clients!properties_owner_client_id_fkey(phone),
      subtype:property_subtypes(name, name_en),
      settlement:geo_settlements(name, settlement_type),
      neighborhood:geo_neighborhoods(name),
      photos:property_photos(storage_path),
      broker:profiles!properties_responsible_broker_id_fkey(full_name, email, avatar_path, phone)`
    )
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false })
    .order("position", { referencedTable: "property_photos" })
    .limit(5, { referencedTable: "property_photos" })
    .limit(LIMIT);

  if (q) query = query.or(`title.ilike.%${q}%,address.ilike.%${q}%`);
  if (op) query = query.eq("operation_type", op);
  if (cat) query = query.eq("category_id", cat);
  if (view) {
    // mine (on the market, sold, off the market), or the colleagues' on the market
    query = query.in("status", [...VIEWS[view]]);
    if (view === "offmarket") {
      query = query.eq("off_market", true);
      if (broker) query = query.eq("responsible_broker_id", broker);
    } else if (view !== "colleagues") query = query.eq("responsible_broker_id", session.userId);
    else if (broker && broker !== session.userId) query = query.eq("responsible_broker_id", broker);
    else query = query.neq("responsible_broker_id", session.userId);
  } else {
    if (status) query = query.eq("status", status);
    if (broker) query = query.eq("responsible_broker_id", broker);
  }

  const [{ data, error }, { data: statusRows }, { data: categories }, members, players] = await Promise.all([
    query,
    supabase.from("properties").select("status, responsible_broker_id").eq("organization_id", session.organizationId),
    supabase.from("property_categories").select("id, name, name_en").order("sort_order"),
    getMembers(supabase, session.organizationId),
    // each broker's level (shown on their listings)
    getPlayers(session.organizationId, sofiaToday()),
  ]);

  if (error) console.error("Loading properties failed:", error);

  const rows = (data ?? []) as unknown as ListRow[];
  const photoUrls = await signPhotoUrls(
    supabase,
    rows.flatMap((row) => row.photos.map((photo) => photo.storage_path))
  );

  // the numbers on top follow the tab: my own on my tabs, the whole agency's on the colleagues' (and with no tab)
  const counts = { total: 0, active: 0, reserved: 0, closed: 0 };
  const own = view === "mine" || view === "sold" || view === "withdrawn";
  for (const row of statusRows ?? []) {
    if (own && row.responsible_broker_id !== session.userId) continue;
    counts.total++;
    if (row.status === "active") counts.active++;
    if (row.status === "reserved") counts.reserved++;
    if (row.status === "sold" || row.status === "rented") counts.closed++;
  }

  const filtered = Boolean(q || op || cat || (!view && (status || broker)) || ((view === "colleagues" || view === "offmarket") && broker));
  const title = view
    ? {
        mine: t.nav.myProperties,
        sold: t.nav.soldProperties,
        withdrawn: t.nav.withdrawnProperties,
        colleagues: t.nav.colleaguesProperties,
        offmarket: t.nav.offMarketProperties,
      }[view]
    : t.list.title;

  return (
    <>
      <PageHeader
        backHref={back?.href}
        backLabel={back?.label}
        title={title}
        subtitle={session.solo ? t.list.subtitleSolo : t.list.subtitle}
        actions={
          <>
            <Link href="/import?what=properties" className={buttonClass.secondary}>
              <FileUp className="size-4" />
              {t.importer.link}
            </Link>
            <Link href="/properties/new" className={buttonClass.primary}>
              <Plus className="size-4" />
              {t.list.newProperty}
            </Link>
          </>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t.list.statTotal, counts.total],
          [t.list.statActive, counts.active],
          [t.list.statReserved, counts.reserved],
          [t.list.statClosed, counts.closed],
        ].map(([name, value]) => (
          <div key={name} className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-xs">
            <dt className="text-xs font-medium text-muted">{name}</dt>
            <dd className="mt-1 text-2xl font-bold tracking-tight">{value}</dd>
          </div>
        ))}
      </dl>

      <PropertyFilters
        categories={(categories ?? []).map((c) => ({ id: c.id, name: localName(c, lang) }))}
        brokers={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
        currentUserId={session.userId}
      />

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <Building2 className="mx-auto size-10 text-faint" />
          {filtered ? (
            <p className="mt-3 text-sm text-muted">{t.list.noResults}</p>
          ) : view && view !== "mine" ? (
            <p className="mt-3 text-sm text-muted">{t.list.emptyView}</p>
          ) : (
            <>
              <p className="mt-3 font-semibold">{t.list.emptyTitle}</p>
              <p className="mt-1 text-sm text-muted">{t.list.emptyHint}</p>
              <Link href="/properties/new" className={`${buttonClass.primary} mt-5`}>
                <Plus className="size-4" />
                {t.list.newProperty}
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const brokerName = row.broker ? row.broker.full_name || row.broker.email : null;
            const level = row.responsible_broker_id ? players.get(row.responsible_broker_id)?.level.index : undefined;
            const specs = [
              row.subtype ? localName(row.subtype, lang) : null,
              row.rooms ? (row.rooms === 1 ? t.listing.oneRoom : fmt(t.listing.rooms, { n: row.rooms })) : null,
              row.bedrooms ? (row.bedrooms === 1 ? t.listing.oneBedroom : fmt(t.listing.bedrooms, { n: row.bedrooms })) : null,
              row.area ? `${formatNumber(Number(row.area), lang)} ${t.units.sqm}` : null,
            ].filter((x): x is string => Boolean(x));
            // the buttons: my own listing → its owner; a colleague's → the colleague
            const mine = row.responsible_broker_id === session.userId;
            const phone = mine ? (row.owner?.phone ?? null) : (row.broker?.phone ?? null);
            return (
              <li key={row.id}>
                <ListingCard
                  t={t}
                  data={{
                    href: `/properties/${row.id}${fromQuery(back)}`,
                    photos: row.photos.map((p) => photoUrls.get(p.storage_path)).filter((u): u is string => Boolean(u)),
                    title: row.title,
                    place: [row.neighborhood?.name, row.settlement && settlementLabel(row.settlement)].filter(Boolean).join(", ") || null,
                    price: formatPrice(row.current_price === null ? null : Number(row.current_price), row.currency, lang) ?? t.common.notSet,
                    perMonth: row.operation_type === "rent" && row.current_price !== null,
                    specs,
                    status:
                      row.status === "active"
                        ? null
                        : { code: row.status, label: t.options.status[row.status as keyof typeof t.options.status] ?? row.status },
                    exclusive: row.exclusive_contract,
                    offMarket: row.off_market,
                    // alone: every listing is theirs
                    broker: brokerName && members.length > 1
                      ? { name: brokerName, avatarPath: row.broker?.avatar_path, level: level !== undefined ? t.game.levels[level] : null }
                      : null,
                    age: ago(row.created_at, lang),
                    phone,
                    rating: (() => {
                      const stars = toStars(row.market_stars);
                      return stars ? { stars, label: t.rating.labels[stars], title: fmt(t.rating.stars, { n: stars }) } : null;
                    })(),
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
