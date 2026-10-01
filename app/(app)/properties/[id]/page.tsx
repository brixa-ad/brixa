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
  Megaphone,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Tag,
  DoorOpen,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { QuickLog } from "@/components/client/QuickLog";
import { DealCard } from "@/components/deal/DealCard";
import { PropertyDocuments, type PropertyDocument } from "@/components/property/PropertyDocuments";
import { MarketCard } from "@/components/market/MarketCard";
import { BuyerMatchesCard, PartnerMatchesCard } from "@/components/property/MatchCards";
import { OwnerReportDialog } from "@/components/property/OwnerReportDialog";
import { ShareDialog, type ShareClient } from "@/components/property/ShareDialog";
import { MarketingPlan } from "@/components/marketing/MarketingPlan";
import { ColleagueLog } from "@/components/partners/ColleagueLog";
import { LogTabs } from "@/components/partners/LogTabs";
import type { PartnerOption } from "@/components/partners/PartnerPicker";
import { ShareWithColleague } from "@/components/partners/ShareWithColleague";
import { cleanTemplate, listingPlan, type MarketingDone } from "@/lib/marketing";
import { ShareList, type ShareRow } from "@/components/property/ShareList";
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
import { getMarketSnapshot } from "@/lib/market";
import { findBuyers, findPartnerSearches } from "@/lib/matching";
import { getProperty } from "@/lib/properties";
import { memberBack } from "@/lib/member-back";
import { DOCUMENT_BUCKET } from "@/lib/documents";
import { addDays, sofiaDay, sofiaToday } from "@/lib/dates";
import { getSession } from "@/lib/session";
import { personName } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import { hhmm, weekdayDate } from "@/lib/open-houses";

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
  const [
    defaults,
    { data: dealRows },
    { data: statusRows },
    { data: activityRows },
    { data: documentRows },
    { data: shareRows },
    { data: clientRows },
    { data: reportRows },
    market,
    buyers,
    partnerMatches,
    { data: partnerRows },
    { data: marketingRow },
    { data: doneRows },
    { data: orgRow },
    { count: colleagueCalls },
  ] = await Promise.all([
      getCommissionDefaults(property.organization_id),
      supabase.from("deals").select(DEAL_SELECT).eq("property_id", id).order("updated_at", { ascending: false }),
      supabase
        .from("property_status_log")
        .select("id, status, changed_at, person:profiles(full_name, email)")
        .eq("property_id", id),
      // viewings, calls… logged on this property (own; managers: everyone's)
      supabase
        .from("activities")
        .select("id, type, note, occurred_at, person:profiles(full_name, email), partner:partners(id, full_name, agency)")
        .eq("property_id", id)
        .order("occurred_at", { ascending: false })
        .limit(50),
      // only the responsible broker and managers get any back
      supabase
        .from("property_documents")
        .select("id, name, size_bytes, storage_path, created_at, uploader:profiles(full_name, email)")
        .eq("property_id", id)
        .order("created_at", { ascending: false }),
      // links sent to clients (own; managers: everyone's)
      supabase
        .from("property_shares")
        .select(
          "id, token, views, last_viewed_at, revoked_at, created_at, created_by, client:clients(id, full_name), partner:partners(id, full_name, agency), creator:profiles(full_name, email)"
        )
        .eq("property_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      // who the listing can be sent to: own clients (managers: all)
      listing && session
        ? (session.isManager
            ? supabase.from("clients").select("id, full_name, phone, email").eq("organization_id", property.organization_id).not("responsible_broker_id", "is", null)
            : supabase.from("clients").select("id, full_name, phone, email").eq("responsible_broker_id", session.userId)
          )
            .order("full_name")
            .limit(1000)
        : Promise.resolve({ data: [] as ShareClient[] }),
      // reports sent to the owner (the listing's broker and managers only)
      supabase
        .from("owner_reports")
        .select("id, token, period_start, period_end, views, last_viewed_at, revoked_at, created_at, created_by, creator:profiles(full_name, email)")
        .eq("property_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      // its price against the market (listings only)
      listing ? getMarketSnapshot(id) : Promise.resolve(null),
      // who it fits: our buyers (the ones this user may see) and colleagues' searches
      listing ? findBuyers(supabase, id) : Promise.resolve([]),
      listing ? findPartnerSearches(supabase, id) : Promise.resolve([]),
      // colleagues from other agencies (to log a call with, to share with)
      supabase.from("partners").select("id, full_name, agency, phone").eq("organization_id", property.organization_id).order("full_name").limit(1000),
      // the marketing plan: the listing's own changes, what was done, the agency's template
      supabase.from("properties").select("marketing_hidden, marketing_extra").eq("id", id).maybeSingle(),
      supabase.from("marketing_done").select("id, key, done_on, auto, done_by").eq("property_id", id).order("done_on", { ascending: false }).limit(500),
      supabase.from("organizations").select("marketing_template").eq("id", property.organization_id).maybeSingle(),
      supabase.from("activities").select("id", { count: "exact", head: true }).eq("property_id", id).not("partner_id", "is", null),
    ]);
  const deals = toDeals(dealRows);
  const shares: ShareRow[] = (
    (shareRows ?? []) as unknown as {
      id: string;
      token: string;
      views: number;
      last_viewed_at: string | null;
      revoked_at: string | null;
      created_at: string;
      created_by: string | null;
      client: { id: string; full_name: string } | null;
      partner: { id: string; full_name: string; agency: string | null } | null;
      creator: { full_name: string | null; email: string } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    token: row.token,
    name: row.client?.full_name ?? (row.partner ? `${row.partner.full_name}${row.partner.agency ? ` (${row.partner.agency})` : ""}` : null),
    href: row.client ? `/clients/${row.client.id}` : row.partner ? `/partners/${row.partner.id}` : null,
    colleague: Boolean(row.partner),
    sharedBy: row.creator && row.created_by !== session?.userId ? personName(row.creator) : null,
    views: row.views,
    lastViewedAt: row.last_viewed_at,
    revoked: row.revoked_at !== null,
    createdAt: row.created_at,
  }));
  const shareClients = (clientRows ?? []) as ShareClient[];
  const partners = (partnerRows ?? []) as PartnerOption[];

  // ---- the marketing plan and its funnel
  const plan = listingPlan(
    cleanTemplate(orgRow?.marketing_template),
    (marketingRow?.marketing_hidden ?? []) as string[],
    cleanTemplate(marketingRow?.marketing_extra)
  );
  const done = (doneRows ?? []) as MarketingDone[];
  const funnel = {
    colleagues: shares.filter((s) => s.colleague).length,
    opened: shares.filter((s) => s.colleague && s.views > 0).length,
    calls: colleagueCalls ?? 0,
    buyers: shares.filter((s) => !s.colleague && s.href).length,
  };
  const reports: ShareRow[] = (
    (reportRows ?? []) as unknown as {
      id: string;
      token: string;
      period_start: string;
      period_end: string;
      views: number;
      last_viewed_at: string | null;
      revoked_at: string | null;
      created_at: string;
      created_by: string | null;
      creator: { full_name: string | null; email: string } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    token: row.token,
    name: `${formatDate(row.period_start, lang)} – ${formatDate(row.period_end, lang)}`,
    href: null,
    sharedBy: row.creator && row.created_by !== session?.userId ? personName(row.creator) : null,
    views: row.views,
    lastViewedAt: row.last_viewed_at,
    revoked: row.revoked_at !== null,
    createdAt: row.created_at,
  }));

  type Person = { full_name: string | null; email: string } | null;
  // open houses for this listing (the latest few)
  const { data: houseRows } = listing
    ? await supabase
        .from("open_houses")
        .select("id, day, starts_at, ends_at, cancelled_at")
        .eq("property_id", id)
        .order("day", { ascending: false })
        .limit(5)
    : { data: [] as { id: string; day: string; starts_at: string; ends_at: string; cancelled_at: string | null }[] };

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
        partner: { id: string; full_name: string; agency: string | null } | null;
      }[]
    ).map((row) => ({
      key: `activity-${row.id}`,
      at: row.occurred_at,
      icon: row.type,
      text: [
        t.options.activityType[row.type as keyof typeof t.options.activityType] ?? row.type,
        row.partner ? `${row.partner.full_name}${row.partner.agency ? ` (${row.partner.agency})` : ""}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
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
              {listing && <ShareDialog propertyId={property.id} title={property.title} clients={shareClients} />}
              {listing && <ShareWithColleague propertyId={property.id} title={property.title} partners={partners} />}
              <StatusSelect propertyId={property.id} status={property.status} />
              <Link href={`/properties/${property.id}/edit`} className={buttonClass.secondary}>
                <Pencil className="size-4" />
                {t.common.edit}
              </Link>
              {session?.isManager && <DeletePropertyButton propertyId={property.id} />}
            </>
          ) : (
            <>
              {listing && <ShareDialog propertyId={property.id} title={property.title} clients={shareClients} />}
              {listing && <ShareWithColleague propertyId={property.id} title={property.title} partners={partners} />}
              <StatusBadge
                status={property.status}
                label={t.options.status[property.status as keyof typeof t.options.status] ?? property.status}
              />
            </>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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

          {listing && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  <Megaphone className="size-4 text-brand-cyan" />
                  {t.marketing.title}
                </span>
              }
              description={t.marketing.hint}
            >
              <dl className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    [t.marketing.funnelColleagues, funnel.colleagues],
                    [t.marketing.funnelOpened, funnel.opened],
                    [t.marketing.funnelCalls, funnel.calls],
                    [t.marketing.funnelBuyers, funnel.buyers],
                  ] as const
                ).map(([name, value]) => (
                  <div key={name} className="rounded-xl bg-raised/60 px-3 py-2">
                    <dt className="text-[11px] font-medium text-muted">{name}</dt>
                    <dd className="text-lg font-bold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <MarketingPlan
                propertyId={property.id}
                shown={plan.shown}
                hidden={plan.hidden}
                extraKeys={cleanTemplate(marketingRow?.marketing_extra).map((p) => p.key)}
                done={done}
                today={sofiaToday()}
                canEdit={canEdit}
              />
            </Card>
          )}

          <Card title={t.detail.historyTitle}>
            <LogTabs
              own={<QuickLog propertyId={property.id} />}
              colleague={
                <>
                  <p className="mb-3 text-xs text-muted">{t.partners.colleagueHint}</p>
                  <ColleagueLog partners={partners} propertyId={property.id} tomorrow={addDays(sofiaToday(), 1)} />
                </>
              }
            />
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

          {market && (
            <MarketCard
              facts={market}
              place={property.neighborhood?.name ?? null}
              town={property.settlement ? settlementLabel(property.settlement) : null}
              t={t}
              lang={lang}
            />
          )}

          {listing && <BuyerMatchesCard buyers={buyers} t={t} />}
          {partnerMatches.length > 0 && <PartnerMatchesCard matches={partnerMatches} t={t} />}

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

          {listing && (
            <Card
              title={
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <DoorOpen className="size-4 text-brand-cyan" />
                    {t.openHouses.propertyCard}
                  </span>
                  {["active", "reserved"].includes(property.status) && (
                    <Link
                      href={`/open-houses/new?property=${property.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline"
                    >
                      <Plus className="size-3.5" />
                      {t.openHouses.organize}
                    </Link>
                  )}
                </span>
              }
            >
              {(houseRows ?? []).length === 0 ? (
                <p className="text-sm text-muted">{t.openHouses.noneForProperty}</p>
              ) : (
                <ul className="-mx-2 space-y-0.5">
                  {(houseRows ?? []).map((h) => (
                    <li key={h.id}>
                      <Link href={`/open-houses/${h.id}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-raised">
                        <span className={`min-w-0 flex-1 truncate capitalize ${h.cancelled_at ? "text-muted line-through" : "font-medium"}`}>
                          {fmt(t.openHouses.when, { day: weekdayDate(h.day, lang), from: hhmm(h.starts_at), to: hhmm(h.ends_at) })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {listing && shares.length > 0 && (
            <Card title={t.share.linksTitle}>
              <ShareList rows={shares} empty={t.share.noLinks} />
            </Card>
          )}

          {listing && canEdit && (
            <Card title={t.report.title} description={t.report.hint}>
              <OwnerReportDialog
                propertyId={property.id}
                title={property.title}
                listedOn={sofiaDay(property.created_at)}
                today={sofiaToday()}
                owner={property.owner}
              />
              {reports.length > 0 && (
                <div className="mt-5 border-t border-line-soft pt-4">
                  <h3 className="mb-3 text-sm font-semibold text-fg-2">{t.report.linksTitle}</h3>
                  <ShareList rows={reports} empty={t.report.noLinks} kind="report" />
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
