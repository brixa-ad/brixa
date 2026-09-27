import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Eye,
  FileText,
  Flag,
  Handshake,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { QuickLog } from "@/components/client/QuickLog";
import { DealCard } from "@/components/deal/DealCard";
import { PropertyDocuments, type PropertyDocument } from "@/components/property/PropertyDocuments";
import { TypeIcon } from "@/components/task/TypeIcon";
import { PageHeader } from "@/components/PageHeader";
import { DeletePropertyButton } from "@/components/property/DeletePropertyButton";
import { PhotoGallery } from "@/components/property/PhotoGallery";
import { StatusBadge } from "@/components/property/StatusBadge";
import { StatusSelect } from "@/components/property/StatusSelect";
import { Card, buttonClass } from "@/components/ui/form";
import { commissionRate, expectedCommission, rateLabel } from "@/lib/commission";
import { DEAL_SELECT, toDeals } from "@/lib/deals";
import { formatDate, formatNumber, formatPrice, settlementLabel } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getCommissionDefaults } from "@/lib/lookups";
import { getProperty } from "@/lib/properties";
import { memberBack } from "@/lib/member-back";
import { DOCUMENT_BUCKET } from "@/lib/documents";
import { getSession } from "@/lib/session";
import { personName } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/properties/[id]">): Promise<Metadata> {
  const property = await getProperty((await params).id);
  return { title: property?.title ?? "Property" };
}

export default async function PropertyPage({ params, searchParams }: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const { photos: photosParam, from } = await searchParams;
  const [{ t, lang }, property, session] = await Promise.all([getI18n(), getProperty(id), getSession()]);

  if (!property) notFound();
  const back = await memberBack(from, property.organization_id);

  // Deals on this listing that this user may see (their own; managers: all).
  const listing = property.operation_type === "sale" || property.operation_type === "rent";
  const kind = property.operation_type === "rent" ? "rent" : "sale";
  const supabase = await createClient();
  const [defaults, { data: dealRows }, { data: statusRows }, { data: activityRows }, { data: documentRows }] =
    await Promise.all([
      getCommissionDefaults(property.organization_id),
      supabase.from("deals").select(DEAL_SELECT).eq("property_id", id).order("updated_at", { ascending: false }),
      supabase
        .from("property_status_log")
        .select("id, status, changed_at, person:profiles(full_name, email)")
        .eq("property_id", id),
      // viewings, calls… logged on this property (own; managers: everyone's)
      supabase
        .from("activities")
        .select("id, type, note, occurred_at, person:profiles(full_name, email)")
        .eq("property_id", id)
        .order("occurred_at", { ascending: false })
        .limit(50),
      // only the responsible broker and managers get any back
      supabase
        .from("property_documents")
        .select("id, name, size_bytes, storage_path, created_at, uploader:profiles(full_name, email)")
        .eq("property_id", id)
        .order("created_at", { ascending: false }),
    ]);
  const deals = toDeals(dealRows);

  type Person = { full_name: string | null; email: string } | null;
  const documents: PropertyDocument[] = await Promise.all(
    (
      (documentRows ?? []) as unknown as {
        id: string;
        name: string;
        size_bytes: number | null;
        storage_path: string;
        created_at: string;
        uploader: Person;
      }[]
    ).map(async (doc) => {
      const { data } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .createSignedUrl(doc.storage_path, 3600, { download: doc.name });
      return {
        id: doc.id,
        name: doc.name,
        size_bytes: doc.size_bytes === null ? null : Number(doc.size_bytes),
        created_at: doc.created_at,
        url: data?.signedUrl ?? null,
        uploader: doc.uploader ? personName(doc.uploader) : null,
      };
    }),
  );

  // ---- everything that happened to the listing, newest first
  type HistoryEntry = {
    key: string;
    at: string;
    icon: "created" | "price" | "status" | "deal" | "document" | string;
    text: string;
    who?: string | null;
    note?: string | null;
    change?: number | null;
  };
  const history: HistoryEntry[] = [
    {
      key: "created",
      at: property.created_at,
      icon: "created",
      text: t.detail.historyCreated,
      who: property.broker ? personName(property.broker) : null,
    },
    ...property.priceHistory.map((entry) => ({
      key: `price-${entry.id}`,
      at: entry.changed_at,
      icon: "price",
      text: fmt(entry.old_price === null ? t.detail.historyListed : t.detail.historyPrice, {
        price: formatPrice(entry.new_price, entry.currency, lang) ?? t.common.notSet,
      }),
      who: entry.changed_by ? personName(entry.changed_by) : null,
      change:
        entry.old_price && entry.new_price !== null
          ? ((entry.new_price - entry.old_price) / entry.old_price) * 100
          : null,
    })),
    ...((statusRows ?? []) as unknown as { id: number; status: string; changed_at: string; person: Person }[]).map(
      (row) => ({
        key: `status-${row.id}`,
        at: row.changed_at,
        icon: "status",
        text: fmt(t.detail.historyStatus, {
          status: t.options.status[row.status as keyof typeof t.options.status] ?? row.status,
        }),
        who: row.person ? personName(row.person) : null,
      }),
    ),
    ...(
      (activityRows ?? []) as unknown as {
        id: string;
        type: string;
        note: string | null;
        occurred_at: string;
        person: Person;
      }[]
    ).map((row) => ({
      key: `activity-${row.id}`,
      at: row.occurred_at,
      icon: row.type,
      text: t.options.activityType[row.type as keyof typeof t.options.activityType] ?? row.type,
      who: row.person ? personName(row.person) : null,
      note: row.note,
    })),
    ...deals.flatMap((deal) => {
      const name = deal.client?.full_name ?? t.deals.untitled;
      const entries: HistoryEntry[] = [
        {
          key: `deal-${deal.id}`,
          at: deal.created_at,
          icon: "deal",
          text: fmt(t.detail.historyDealNew, { name }),
          who: deal.broker ? personName(deal.broker) : null,
        },
      ];
      if (deal.status === "won" && deal.closed_on)
        entries.push({
          key: `won-${deal.id}`,
          at: `${deal.closed_on}T12:00:00Z`,
          icon: "deal",
          text: fmt(t.detail.historyDealWon, { name }),
        });
      if (deal.status === "lost")
        entries.push({
          key: `lost-${deal.id}`,
          at: deal.updated_at,
          icon: "deal",
          text: fmt(t.detail.historyDealLost, { name }),
          note: deal.lost_reason,
        });
      return entries;
    }),
    ...documents.map((doc) => ({
      key: `doc-${doc.id}`,
      at: doc.created_at,
      icon: "document",
      text: fmt(t.detail.historyDocument, { name: doc.name }),
      who: doc.uploader,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const rate = commissionRate(kind, property.commission_rate, defaults);
  const commission = listing ? expectedCommission(kind, property.current_price, property.currency, rate) : null;

  // Everyone in the agency can view; only the responsible broker and managers can change it.
  const canEdit = Boolean(session?.isManager || property.responsible_broker_id === session?.userId);
  const brokerName = property.broker?.full_name || property.broker?.email || "";

  const label = <K extends keyof typeof t.options>(group: K, code: string | null) =>
    code ? ((t.options[group] as Record<string, string>)[code] ?? code) : null;

  const pricePerSqm = property.current_price && property.area ? property.current_price / property.area : null;

  const locationParts = [
    property.settlement && settlementLabel(property.settlement),
    property.neighborhood?.name,
    property.region && `${t.location.regionPrefix} ${property.region.name}`,
  ].filter(Boolean);

  const specs: [string, string | null][] = [
    [t.form.area, property.area ? `${formatNumber(property.area, lang, 2)} ${t.units.sqm}` : null],
    [t.form.rooms, formatNumber(property.rooms, lang)],
    [t.form.bedrooms, formatNumber(property.bedrooms, lang)],
    [
      t.form.floor,
      property.floor !== null
        ? property.total_floors !== null
          ? fmt(t.detail.floorOf, { floor: property.floor, total: property.total_floors })
          : String(property.floor)
        : null,
    ],
    [t.form.condition, label("condition", property.condition)],
    [t.form.construction, label("construction", property.construction_type)],
    [
      t.form.exposure,
      property.exposures?.length
        ? property.exposures.map((code) => label("exposure", code)).join(", ")
        : label("exposure", property.exposure),
    ],
    [t.form.furnishing, label("furnishing", property.furnishing)],
    [t.form.heating, label("heating", property.heating)],
  ];
  const filledSpecs = specs.filter(([, value]) => value !== null);

  return (
    <>
      <PageHeader
        backHref={back?.href ?? "/properties"}
        backLabel={back?.label ?? t.nav.properties}
        title={property.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {[property.subtype && localName(property.subtype, lang), label("operation", property.operation_type)]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {locationParts.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {locationParts.join(", ")}
              </span>
            )}
          </span>
        }
        actions={
          canEdit ? (
            <>
              <StatusSelect propertyId={property.id} status={property.status} />
              <Link href={`/properties/${property.id}/edit`} className={buttonClass.secondary}>
                <Pencil className="size-4" />
                {t.common.edit}
              </Link>
              {session?.isManager && <DeletePropertyButton propertyId={property.id} />}
            </>
          ) : (
            <StatusBadge
              status={property.status}
              label={t.options.status[property.status as keyof typeof t.options.status] ?? property.status}
            />
          )
        }
      />

      {!canEdit && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-fg-2">
          <Eye className="size-4 shrink-0 text-accent-fg" />
          <p className="min-w-0 flex-1">{fmt(t.detail.readOnly, { name: brokerName })}</p>
          {property.responsible_broker_id && (
            <Link href={`/team/${property.responsible_broker_id}`} className={buttonClass.secondary}>
              <Avatar path={property.broker?.avatar_path} name={brokerName} size="sm" className="-my-1 -ml-1" />
              {t.detail.contactBroker}
            </Link>
          )}
        </div>
      )}

      {photosParam === "failed" && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t.photos.uploadFailed}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <PhotoGallery photos={property.photos} />

          <Card title={t.detail.specs}>
            {filledSpecs.length === 0 ? (
              <p className="text-sm text-muted">{t.common.notSet}</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                {filledSpecs.map(([name, value]) => (
                  <div key={name}>
                    <dt className="text-xs text-muted">{name}</dt>
                    <dd className="mt-0.5 font-medium text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card title={t.detail.features}>
            {property.features.length === 0 ? (
              <p className="text-sm text-muted">{t.detail.noFeatures}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {property.features.map((feature) => (
                  <li key={feature.id} className="flex items-center gap-2 text-sm text-fg-2">
                    <span className="grid size-5 place-items-center rounded-full bg-success/10 text-success">
                      <Check className="size-3" />
                    </span>
                    {localName(feature, lang)}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t.detail.description}>
            {property.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-fg-2">{property.description}</p>
            ) : (
              <p className="text-sm text-muted">{t.detail.noDescription}</p>
            )}
          </Card>

          <Card title={t.detail.historyTitle}>
            <QuickLog propertyId={property.id} />
            <ol className="relative mt-6 space-y-4 border-l border-line pl-5">
              {history.map((entry) => (
                <li key={entry.key} className="relative">
                  <span className="absolute -left-[31px] top-0 grid size-5 place-items-center rounded-full border border-line bg-surface text-accent-fg">
                    {entry.icon === "created" ? (
                      <Sparkles className="size-3" />
                    ) : entry.icon === "price" ? (
                      <Tag className="size-3" />
                    ) : entry.icon === "status" ? (
                      <Flag className="size-3" />
                    ) : entry.icon === "deal" ? (
                      <Handshake className="size-3" />
                    ) : entry.icon === "document" ? (
                      <FileText className="size-3" />
                    ) : (
                      <TypeIcon type={entry.icon} className="size-3" />
                    )}
                  </span>
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-medium">{entry.text}</span>
                    {entry.change != null && entry.change !== 0 && (
                      <span
                        className={`inline-flex items-center text-xs font-semibold ${entry.change < 0 ? "text-success" : "text-danger"}`}
                      >
                        {entry.change < 0 ? (
                          <ArrowDownRight className="size-3.5" />
                        ) : (
                          <ArrowUpRight className="size-3.5" />
                        )}
                        {formatNumber(Math.abs(entry.change), lang, 1)}%
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-subtle">
                    {formatDate(entry.at, lang, true)}
                    {entry.who ? ` · ${entry.who}` : ""}
                  </p>
                  {entry.note && <p className="mt-0.5 whitespace-pre-line text-sm text-fg-2">{entry.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <p className="text-3xl font-bold tracking-tight text-fg">
              {formatPrice(property.current_price, property.currency, lang) ?? t.common.notSet}
            </p>
            {pricePerSqm && (
              <p className="mt-1 text-sm text-muted">
                {formatPrice(pricePerSqm, property.currency, lang)} / {t.units.sqm}
              </p>
            )}
            {property.asking_price !== null && property.asking_price !== property.current_price && (
              <p className="mt-1 text-sm text-muted">
                {t.detail.initialPrice}:{" "}
                <span className="line-through">{formatPrice(property.asking_price, property.currency, lang)}</span>
              </p>
            )}

            {commission !== null && (
              <p className="mt-2 text-sm text-muted">
                {t.form.expectedCommission}:{" "}
                <span className="font-semibold text-accent-fg">{formatPrice(commission, "EUR", lang)}</span> (
                {rateLabel(kind, rate, t.units.months)})
              </p>
            )}

            {property.exclusive_contract && (
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-fg">
                <ShieldCheck className="size-3.5" />
                {t.detail.exclusive}
              </p>
            )}

            <dl className="mt-5 space-y-3 border-t border-line-soft pt-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="shrink-0 text-muted">{t.detail.broker}</dt>
                <dd>
                  {property.responsible_broker_id ? (
                    <Link
                      href={`/team/${property.responsible_broker_id}`}
                      className="flex items-center gap-2 font-medium text-fg hover:text-accent-fg"
                    >
                      <Avatar path={property.broker?.avatar_path} name={brokerName} size="sm" />
                      {brokerName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {property.owner && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="shrink-0 text-muted">{t.clients.owner}</dt>
                  <dd className="text-right">
                    <Link href={`/clients/${property.owner.id}`} className="font-medium text-fg hover:text-accent-fg">
                      {property.owner.full_name}
                    </Link>
                    {property.owner.phone && (
                      <a
                        href={`tel:${property.owner.phone.replace(/[^\d+]/g, "")}`}
                        className="block text-xs text-muted hover:text-fg"
                      >
                        {property.owner.phone}
                      </a>
                    )}
                  </dd>
                </div>
              )}
              <Row name={t.detail.location} value={locationParts.join(", ") || null} />
              {property.address && <Row name={t.location.address} value={property.address} />}
              {property.cadastral_id && <Row name={t.location.cadastral} value={property.cadastral_id} />}
              <Row name={t.detail.created} value={formatDate(property.created_at, lang)} />
              <Row name={t.detail.updated} value={formatDate(property.updated_at, lang, true)} />
            </dl>
          </Card>

          {listing && (
            <Card
              title={
                <span className="flex items-center justify-between gap-3">
                  {t.deals.forProperty}
                  <Link
                    href={`/deals/new?property=${property.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline"
                  >
                    <Plus className="size-3.5" />
                    {t.deals.newDeal}
                  </Link>
                </span>
              }
            >
              {deals.length === 0 ? (
                <p className="text-sm text-muted">{t.deals.none}</p>
              ) : (
                <div className="space-y-2">
                  {deals.map((deal) => (
                    <DealCard key={deal.id} deal={deal} t={t} lang={lang} showBroker />
                  ))}
                </div>
              )}
            </Card>
          )}

          {canEdit && session && (
            <Card title={t.documents.title}>
              <PropertyDocuments
                propertyId={property.id}
                organizationId={property.organization_id}
                userId={session.userId}
                documents={documents}
              />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function Row({ name, value }: { name: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{name}</dt>
      <dd className="text-right font-medium text-fg">{value || "—"}</dd>
    </div>
  );
}
