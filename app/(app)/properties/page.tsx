import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ImageIcon, MapPin, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PropertyFilters } from "@/components/property/PropertyFilters";
import { StatusBadge } from "@/components/property/StatusBadge";
import { buttonClass } from "@/components/ui/form";
import { formatNumber, formatPrice, settlementLabel } from "@/lib/format";
import { localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { OPERATION_TYPES, STATUSES, isOneOf } from "@/lib/options";
import { signPhotoUrls } from "@/lib/photos-server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.list.title };
}

const LIMIT = 200;

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
  subtype: { name: string; name_en: string | null } | null;
  settlement: { name: string; settlement_type: string } | null;
  neighborhood: { name: string } | null;
  photos: { storage_path: string }[];
};

export default async function PropertiesPage({ searchParams }: PageProps<"/properties">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.replace(/[,()%_\\]/g, " ").trim() : "";
  const op = isOneOf(OPERATION_TYPES, params.op) ? params.op : "";
  const status = isOneOf(STATUSES, params.status) ? params.status : "";
  const cat = typeof params.cat === "string" ? params.cat : "";

  const session = (await getSession())!;
  const supabase = await createClient();
  const { t, lang } = await getI18n();

  let query = supabase
    .from("properties")
    .select(
      `id, title, status, operation_type, area, rooms, floor, current_price, currency,
      subtype:property_subtypes(name, name_en),
      settlement:geo_settlements(name, settlement_type),
      neighborhood:geo_neighborhoods(name),
      photos:property_photos(storage_path)`
    )
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false })
    .order("position", { referencedTable: "property_photos" })
    .limit(1, { referencedTable: "property_photos" })
    .limit(LIMIT);

  if (q) query = query.or(`title.ilike.%${q}%,address.ilike.%${q}%`);
  if (op) query = query.eq("operation_type", op);
  if (status) query = query.eq("status", status);
  if (cat) query = query.eq("category_id", cat);

  const [{ data, error }, { data: statusRows }, { data: categories }] = await Promise.all([
    query,
    supabase.from("properties").select("status").eq("organization_id", session.organizationId),
    supabase.from("property_categories").select("id, name, name_en").order("sort_order"),
  ]);

  if (error) console.error("Loading properties failed:", error);

  const rows = (data ?? []) as unknown as ListRow[];
  const coverUrls = await signPhotoUrls(
    supabase,
    rows.flatMap((row) => row.photos.map((photo) => photo.storage_path))
  );

  const counts = { total: 0, active: 0, reserved: 0, closed: 0 };
  for (const row of statusRows ?? []) {
    counts.total++;
    if (row.status === "active") counts.active++;
    if (row.status === "reserved") counts.reserved++;
    if (row.status === "sold" || row.status === "rented") counts.closed++;
  }

  const filtered = Boolean(q || op || status || cat);

  return (
    <>
      <PageHeader
        title={t.list.title}
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
      />

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <Building2 className="mx-auto size-10 text-faint" />
          {filtered ? (
            <p className="mt-3 text-sm text-muted">{t.list.noResults}</p>
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
                  href={`/properties/${row.id}`}
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
                    </div>
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
