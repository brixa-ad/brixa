import type { Metadata } from "next";
import Link from "next/link";
import { Building2, EyeOff, ImageIcon, MapPin, Plus, UserRound } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { PropertyFilters } from "@/components/property/PropertyFilters";
import { StatusBadge } from "@/components/property/StatusBadge";
import { buttonClass } from "@/components/ui/form";
import { formatNumber, formatPrice, settlementLabel } from "@/lib/format";
import { localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { OPERATION_TYPES, STATUSES, isOneOf } from "@/lib/options";
import { signPhotoUrls } from "@/lib/photos-server";
import { fromQuery, memberBack } from "@/lib/member-back";
import { getSession } from "@/lib/session";
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
  floor: number | null;
  current_price: number | null;
  currency: string;
  off_market: boolean;
  subtype: { name: string; name_en: string | null } | null;
  settlement: { name: string; settlement_type: string } | null;
  neighborhood: { name: string } | null;
  photos: { storage_path: string }[];
  broker: { full_name: string | null; email: string; avatar_path: string | null } | null;
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
      `id, title, status, operation_type, area, rooms, floor, current_price, currency, off_market,
      subtype:property_subtypes(name, name_en),
      settlement:geo_settlements(name, settlement_type),
      neighborhood:geo_neighborhoods(name),
      photos:property_photos(storage_path),
      broker:profiles!properties_responsible_broker_id_fkey(full_name, email, avatar_path)`
    )
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false })
    .order("position", { referencedTable: "property_photos" })
    .limit(1, { referencedTable: "property_photos" })
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

  const [{ data, error }, { data: statusRows }, { data: categories }, members] = await Promise.all([
    query,
    supabase.from("properties").select("status, responsible_broker_id").eq("organization_id", session.organizationId),
    supabase.from("property_categories").select("id, name, name_en").order("sort_order"),
    getMembers(supabase, session.organizationId),
  ]);

  if (error) console.error("Loading properties failed:", error);

  const rows = (data ?? []) as unknown as ListRow[];
  const coverUrls = await signPhotoUrls(
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
        subtitle={t.list.subtitle}
        actions={
          <Link href="/properties/new" className={buttonClass.primary}>
            <Plus className="size-4" />
            {t.list.newProperty}
          </Link>
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
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const cover = row.photos[0] ? coverUrls.get(row.photos[0].storage_path) : undefined;
            const location = [row.settlement && settlementLabel(row.settlement), row.neighborhood?.name]
              .filter(Boolean)
              .join(", ");
            const specs = [
              row.area && `${formatNumber(Number(row.area), lang)} ${t.units.sqm}`,
              row.rooms !== null && `${row.rooms} ${t.form.rooms.toLowerCase()}`,
              row.floor !== null && `${t.form.floor.toLowerCase()} ${row.floor}`,
            ].filter(Boolean);

            return (
              <li key={row.id}>
                <Link
                  href={`/properties/${row.id}${fromQuery(back)}`}
                  className="group block overflow-hidden rounded-2xl border border-line bg-surface shadow-xs transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg hover:shadow-black/40"
                >
                  <div className="relative grid aspect-[16/10] place-items-center bg-raised">
                    {cover ? (
                      <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <ImageIcon className="size-8 text-faint" />
                    )}
                    <div className="absolute left-3 top-3 flex gap-1.5">
                      <StatusBadge
                        status={row.status}
                        label={t.options.status[row.status as keyof typeof t.options.status] ?? row.status}
                      />
                      {row.off_market && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur">
                          <EyeOff className="size-3" />
                          {t.menu.tabs.offMarketProperties}
                        </span>
                      )}
                    </div>
                    {/* who offers it: the broker's face */}
                    {row.broker && (
                      <Avatar
                        path={row.broker.avatar_path}
                        name={row.broker.full_name || row.broker.email}
                        size="md"
                        className="absolute bottom-3 left-3 shadow-lg ring-2! ring-white"
                      />
                    )}
                    <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur">
                      {t.options.operation[row.operation_type as keyof typeof t.options.operation] ??
                        row.operation_type}
                    </span>
                  </div>

                  <div className="p-4">
                    <p className="text-lg font-bold tracking-tight">
                      {formatPrice(row.current_price === null ? null : Number(row.current_price), row.currency, lang) ??
                        t.common.notSet}
                    </p>
                    <p className="mt-0.5 line-clamp-1 font-medium text-fg group-hover:text-accent-fg">
                      {row.title}
                    </p>
                    {location && (
                      <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">{location}</span>
                      </p>
                    )}
                    {row.broker && (
                      <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                        <UserRound className="size-3.5 shrink-0" />
                        <span className="truncate">{row.broker.full_name || row.broker.email}</span>
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-fg-2">
                      {row.subtype && (
                        <span className="rounded-md bg-raised px-2 py-0.5">{localName(row.subtype, lang)}</span>
                      )}
                      {specs.map((spec) => (
                        <span key={spec as string} className="rounded-md bg-raised px-2 py-0.5">
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
