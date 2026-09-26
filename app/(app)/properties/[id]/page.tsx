import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Check, Eye, MapPin, Pencil, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { DeletePropertyButton } from "@/components/property/DeletePropertyButton";
import { PhotoGallery } from "@/components/property/PhotoGallery";
import { StatusBadge } from "@/components/property/StatusBadge";
import { StatusSelect } from "@/components/property/StatusSelect";
import { Card, buttonClass } from "@/components/ui/form";
import { formatDate, formatNumber, formatPrice, settlementLabel } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getProperty } from "@/lib/properties";
import { getSession } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/properties/[id]">): Promise<Metadata> {
  const property = await getProperty((await params).id);
  return { title: property?.title ?? "Property" };
}

export default async function PropertyPage({ params, searchParams }: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const { photos: photosParam } = await searchParams;
  const [{ t, lang }, property, session] = await Promise.all([getI18n(), getProperty(id), getSession()]);

  if (!property) notFound();

  // Everyone in the agency can view; only the responsible broker and managers can change it.
  const canEdit = Boolean(session?.isManager || property.responsible_broker_id === session?.userId);
  const brokerName = property.broker?.full_name || property.broker?.email || "";

  const label = <K extends keyof typeof t.options>(group: K, code: string | null) =>
    code ? ((t.options[group] as Record<string, string>)[code] ?? code) : null;

  const pricePerSqm =
    property.current_price && property.area ? property.current_price / property.area : null;

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
    [t.form.exposure, label("exposure", property.exposure)],
    [t.form.furnishing, label("furnishing", property.furnishing)],
    [t.form.heating, label("heating", property.heating)],
  ];
  const filledSpecs = specs.filter(([, value]) => value !== null);

  return (
    <>
      <PageHeader
        backHref="/properties"
        backLabel={t.nav.properties}
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
              <p className="whitespace-pre-line text-sm leading-relaxed text-fg-2">
                {property.description}
              </p>
            ) : (
              <p className="text-sm text-muted">{t.detail.noDescription}</p>
            )}
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
                <span className="line-through">
                  {formatPrice(property.asking_price, property.currency, lang)}
                </span>
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
              <Row name={t.detail.created} value={formatDate(property.created_at, lang)} />
              <Row name={t.detail.updated} value={formatDate(property.updated_at, lang, true)} />
            </dl>
          </Card>

          <Card title={t.detail.priceHistory}>
            {property.priceHistory.length === 0 ? (
              <p className="text-sm text-muted">{t.common.notSet}</p>
            ) : (
              <ol className="relative space-y-5 border-l border-line pl-5">
                {property.priceHistory.map((entry) => {
                  const change =
                    entry.old_price && entry.new_price !== null
                      ? ((entry.new_price - entry.old_price) / entry.old_price) * 100
                      : null;
                  return (
                    <li key={entry.id} className="relative">
                      <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-accent ring-1 ring-accent/30" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-fg">
                          {formatPrice(entry.new_price, entry.currency, lang) ?? t.common.notSet}
                        </span>
                        {change !== null && change !== 0 && (
                          <span
                            className={`inline-flex items-center text-xs font-semibold ${
                              change < 0 ? "text-success" : "text-danger"
                            }`}
                          >
                            {change < 0 ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                            {formatNumber(Math.abs(change), lang, 1)}%
                          </span>
                        )}
                        {entry.old_price === null && (
                          <span className="text-xs font-medium text-subtle">{t.detail.listed}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatDate(entry.changed_at, lang, true)}
                        {entry.changed_by && ` · ${entry.changed_by.full_name || entry.changed_by.email}`}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
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
