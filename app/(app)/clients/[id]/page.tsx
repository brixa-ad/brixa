import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, History, ImageIcon, Mail, MapPin, Pencil, Phone, Plus, SearchX, Sparkles } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ClassBadge } from "@/components/client/ClassBadge";
import { ClientStageSelect } from "@/components/client/ClientStageSelect";
import { DeleteClientButton } from "@/components/client/DeleteClientButton";
import { QuickLog } from "@/components/client/QuickLog";
import { TaskItem } from "@/components/task/TaskItem";
import { TypeIcon } from "@/components/task/TypeIcon";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/property/StatusBadge";
import { Card, buttonClass } from "@/components/ui/form";
import { isSeeking, type SearchInput } from "@/lib/client-validation";
import { getClient } from "@/lib/clients";
import { formatDate, formatNumber, formatPrice, settlementLabel } from "@/lib/format";
import { fmt, localName, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { findMatches } from "@/lib/matching";
import { signPhotoUrls } from "@/lib/photos-server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { sofiaToday } from "@/lib/dates";
import { TASK_SELECT, byDue, personName, type TaskRow } from "@/lib/tasks";

export async function generateMetadata({ params }: PageProps<"/clients/[id]">): Promise<Metadata> {
  const client = await getClient((await params).id);
  return { title: client?.full_name ?? "Client" };
}

function range(min: number | null, max: number | null, t: Dictionary, format: (n: number) => string) {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${format(min)} – ${format(max)}`;
  return min !== null ? `${t.clients.from} ${format(min)}` : `${t.clients.to} ${format(max!)}`;
}

/** Turn the saved search into short readable lines. */
async function describeSearch(search: SearchInput, t: Dictionary, lang: Lang) {
  const supabase = await createClient();
  const [subtypes, settlements, hoods, features] = await Promise.all([
    search.subtypeIds.length
      ? supabase.from("property_subtypes").select("id, name, name_en").in("id", search.subtypeIds)
      : Promise.resolve({ data: [] }),
    search.settlementIds.length
      ? supabase.from("geo_settlements").select("id, name, settlement_type").in("id", search.settlementIds)
      : Promise.resolve({ data: [] }),
    search.neighborhoodIds.length
      ? supabase.from("geo_neighborhoods").select("id, name, settlement_id").in("id", search.neighborhoodIds)
      : Promise.resolve({ data: [] }),
    search.featureIds.length
      ? supabase.from("property_features").select("id, name, name_en").in("id", search.featureIds)
      : Promise.resolve({ data: [] }),
  ]);

  const locations = (settlements.data ?? []).map((s) => {
    const inTown = (hoods.data ?? []).filter((h) => h.settlement_id === s.id).map((h) => h.name);
    return inTown.length ? `${settlementLabel(s)} (${inTown.join(", ")})` : settlementLabel(s);
  });
  const money = (n: number) => formatPrice(n, search.currency, lang)!;
  const plain = (n: number) => formatNumber(n, lang)!;

  return [
    [t.clients.searchOperation, t.options.searchOperation[search.operation]],
    [t.clients.searchSubtypes, (subtypes.data ?? []).map((s) => localName(s, lang)).join(", ") || t.clients.anyValue],
    [t.clients.searchLocations, locations.join(", ") || t.clients.anyValue],
    [t.clients.searchBudget, range(search.budgetMin, search.budgetMax, t, money) ?? t.clients.anyValue],
    [t.clients.searchArea, range(search.areaMin, search.areaMax, t, plain) ?? t.clients.anyValue],
    [t.clients.searchRooms, range(search.roomsMin, search.roomsMax, t, plain) ?? t.clients.anyValue],
    ...(search.featureIds.length
      ? [[t.clients.searchFeatures, (features.data ?? []).map((f) => localName(f, lang)).join(", ")]]
      : []),
  ] as [string, string][];
}

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const [{ t, lang }, client, session] = await Promise.all([getI18n(), getClient(id), getSession()]);
  if (!client || !session) notFound();

  const supabase = await createClient();
  const seeking = isSeeking(client.types) && client.search;

  const [matches, searchLines, { data: owned }, { data: activityRows }, { data: taskRows }] = await Promise.all([
    seeking ? findMatches(supabase, session.organizationId, client.search!) : Promise.resolve([]),
    seeking ? describeSearch(client.search!, t, lang) : Promise.resolve([]),
    supabase
      .from("properties")
      .select("id, title, status, current_price, currency")
      .eq("owner_client_id", id)
      .order("updated_at", { ascending: false }),
    // My log for this client (managers see the whole team's)
    supabase
      .from("activities")
      .select("id, type, note, occurred_at, profile_id, person:profiles(full_name, email)")
      .eq("client_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase.from("tasks").select(TASK_SELECT).eq("client_id", id).eq("status", "open"),
  ]);

  const activities = (activityRows ?? []) as unknown as {
    id: string;
    type: string;
    note: string | null;
    occurred_at: string;
    profile_id: string;
    person: { full_name: string | null; email: string } | null;
  }[];
  const openTasks = ((taskRows ?? []) as unknown as TaskRow[]).sort(byDue);
  const today = sofiaToday();
  const lastContact = activities[0]?.occurred_at ?? null;

  const covers = await signPhotoUrls(
    supabase,
    matches.map((m) => m.coverPath).filter((p): p is string => Boolean(p))
  );
  const brokerName = client.broker?.full_name || client.broker?.email || "—";

  return (
    <>
      <PageHeader
        backHref="/clients"
        backLabel={t.clients.title}
        title={
          <span className="flex items-center gap-3">
            <ClassBadge value={client.client_class} title={t.options.clientClass[client.client_class]} />
            {client.full_name}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{client.types.map((type) => t.options.clientType[type]).join(" · ")}</span>
            <span className="inline-flex items-center gap-1">
              <History className="size-3.5" />
              {lastContact
                ? fmt(t.activity.lastContact, { when: formatDate(lastContact, lang, true) })
                : t.activity.neverContacted}
            </span>
          </span>
        }
        actions={
          <>
            <ClientStageSelect clientId={client.id} stage={client.stage} />
            <Link href={`/clients/${client.id}/edit`} className={buttonClass.secondary}>
              <Pencil className="size-4" />
              {t.common.edit}
            </Link>
            {session.isManager && <DeleteClientButton clientId={client.id} />}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <div className="space-y-2">
              {client.phone && (
                <a
                  href={`tel:${client.phone.replace(/[^\d+]/g, "")}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-raised"
                >
                  <Phone className="size-4 text-accent-fg" />
                  <span className="font-medium">{client.phone}</span>
                </a>
              )}
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-raised"
                >
                  <Mail className="size-4 text-accent-fg" />
                  <span className="truncate font-medium">{client.email}</span>
                </a>
              )}
            </div>

            <dl className="mt-4 space-y-3 border-t border-line-soft pt-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">{t.clients.broker}</dt>
                <dd className="flex items-center gap-2 font-medium">
                  <Avatar path={client.broker?.avatar_path} name={brokerName} size="sm" />
                  {brokerName}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t.clients.source}</dt>
                <dd className="font-medium">
                  {client.source ? t.options.source[client.source as keyof typeof t.options.source] : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t.clients.lastUpdate}</dt>
                <dd className="font-medium">{formatDate(client.updated_at, lang, true)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-subtle">
              {fmt(t.clients.since, { date: formatDate(client.created_at, lang) })}
            </p>
          </Card>

          <Card title={t.clients.notes}>
            {client.notes ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-fg-2">{client.notes}</p>
            ) : (
              <p className="text-sm text-muted">—</p>
            )}
          </Card>

          {(owned?.length ?? 0) > 0 || client.types.some((tp) => tp === "seller" || tp === "landlord") ? (
            <Card title={t.clients.sellerProperties}>
              {owned && owned.length > 0 ? (
                <ul className="divide-y divide-line-soft">
                  {owned.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/properties/${p.id}`}
                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-raised"
                      >
                        <Building2 className="size-4 shrink-0 text-subtle" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</span>
                        <StatusBadge
                          status={p.status}
                          label={t.options.status[p.status as keyof typeof t.options.status] ?? p.status}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t.clients.noSellerProperties}</p>
              )}
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {/* ---- tasks + what happened ---- */}
          <Card
            title={
              <span className="flex items-center justify-between gap-3">
                {t.activity.tasksTitle}
                <Link
                  href={`/tasks/new?client=${client.id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline"
                >
                  <Plus className="size-3.5" />
                  {t.activity.addTask}
                </Link>
              </span>
            }
          >
            {openTasks.length === 0 ? (
              <p className="text-sm text-muted">{t.tasks.empty}</p>
            ) : (
              <ul className="-mx-3">
                {openTasks.map((task) => (
                  <TaskItem key={task.id} task={task} today={today} viewerId={session.userId} t={t} showAssignee={session.isManager} />
                ))}
              </ul>
            )}
          </Card>

          <Card title={t.activity.title}>
            <QuickLog clientId={client.id} />
            {activities.length === 0 ? (
              <p className="mt-5 text-sm text-muted">{t.activity.empty}</p>
            ) : (
              <ol className="relative mt-6 space-y-4 border-l border-line pl-5">
                {activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[31px] top-0 grid size-5 place-items-center rounded-full border border-line bg-surface text-accent-fg">
                      <TypeIcon type={a.type} className="size-3" />
                    </span>
                    <p className="text-sm">
                      <span className="font-medium">
                        {t.options.activityType[a.type as keyof typeof t.options.activityType] ?? a.type}
                      </span>
                      <span className="text-subtle">
                        {" · "}
                        {a.profile_id === session.userId ? t.activity.byYou : personName(a.person)}
                        {" · "}
                        {formatDate(a.occurred_at, lang, true)}
                      </span>
                    </p>
                    {a.note && <p className="mt-0.5 whitespace-pre-line text-sm text-fg-2">{a.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {isSeeking(client.types) && (
            <Card title={t.clients.sectionSearch}>
              {searchLines.length > 0 ? (
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  {searchLines.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="mt-0.5 font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted">{t.clients.noSearch}</p>
                  <Link href={`/clients/${client.id}/edit`} className={buttonClass.secondary}>
                    {t.clients.addSearch}
                  </Link>
                </div>
              )}
            </Card>
          )}

          {seeking && (
            <Card
              title={
                <span className="flex items-center gap-2">
                  <Sparkles className="size-4 text-accent-fg" />
                  {t.clients.matchesTitle}
                  <span className="font-normal text-subtle">{matches.length}</span>
                </span>
              }
              description={t.clients.matchesHint}
            >
              {matches.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl bg-raised px-4 py-6 text-sm text-muted">
                  <SearchX className="size-5 shrink-0" />
                  {t.clients.noMatches}
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {matches.slice(0, 24).map((m) => {
                    const cover = m.coverPath ? covers.get(m.coverPath) : undefined;
                    const mine = m.brokerId === session.userId;
                    const name = m.broker?.full_name || m.broker?.email || "—";
                    return (
                      <li key={m.id}>
                        <Link
                          href={`/properties/${m.id}`}
                          className="group flex gap-3 rounded-xl border border-line p-2 transition hover:border-line-strong hover:bg-raised"
                        >
                          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-raised">
                            {cover ? (
                              <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                            ) : (
                              <ImageIcon className="size-5 text-faint" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 py-0.5">
                            <p className="font-bold tracking-tight">
                              {formatPrice(m.price, m.currency, lang) ?? t.common.notSet}
                            </p>
                            <p className="truncate text-sm font-medium group-hover:text-accent-fg">{m.title}</p>
                            {m.settlement && (
                              <p className="flex items-center gap-1 truncate text-xs text-muted">
                                <MapPin className="size-3 shrink-0" />
                                {[settlementLabel(m.settlement), m.neighborhood?.name].filter(Boolean).join(", ")}
                              </p>
                            )}
                            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                              <span
                                className={`rounded-md px-1.5 py-0.5 font-medium ${
                                  mine ? "bg-accent-soft text-accent-fg" : "bg-raised text-fg-2"
                                }`}
                              >
                                {mine ? t.clients.yours : fmt(t.clients.colleague, { name })}
                              </span>
                              {m.overBudgetPct !== null && (
                                <span className="rounded-md bg-warning/10 px-1.5 py-0.5 font-medium text-warning">
                                  {fmt(t.clients.overBudget, { pct: m.overBudgetPct })}
                                </span>
                              )}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
