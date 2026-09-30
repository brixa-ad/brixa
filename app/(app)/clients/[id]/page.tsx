import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarCheck, Eye, History, ImageIcon, Mail, MapPin, MousePointerClick, Pencil, Phone, Plus, SearchX, Sparkles } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ClassBadge } from "@/components/client/ClassBadge";
import { ClientStageSelect } from "@/components/client/ClientStageSelect";
import { DeleteClientButton } from "@/components/client/DeleteClientButton";
import { ActivityEntry } from "@/components/client/ActivityEntry";
import { QuickLog } from "@/components/client/QuickLog";
import { ShareSearchDialog } from "@/components/client/ShareSearchDialog";
import { ContactButtons } from "@/components/ContactButtons";
import { ProgramCard, type ClientProgram } from "@/components/program/ProgramCard";
import { SecretValue } from "@/components/client/SecretValue";
import { AssignSelect, ClaimButton } from "@/components/followup/FollowUpControls";
import { DealCard } from "@/components/deal/DealCard";
import { TaskItem } from "@/components/task/TaskItem";
import { PageHeader } from "@/components/PageHeader";
import { ShareList, type ShareRow } from "@/components/property/ShareList";
import { StatusBadge } from "@/components/property/StatusBadge";
import { Card, buttonClass } from "@/components/ui/form";
import { isOffering, isSeeking } from "@/lib/client-validation";
import { getClient } from "@/lib/clients";
import { formatDate, formatPrice, settlementLabel } from "@/lib/format";
import { fmt, locale } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { findMatches } from "@/lib/matching";
import { signPhotoUrls } from "@/lib/photos-server";
import { memberBack } from "@/lib/member-back";
import { getMembers } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { describeOffer, describeSearch } from "@/lib/search-describe";
import { createClient } from "@/lib/supabase/server";
import { sofiaToday } from "@/lib/dates";
import { TASK_SELECT, byDue, personName, type TaskRow } from "@/lib/tasks";
import { DEAL_SELECT, toDeals } from "@/lib/deals";
import { nameDayIn } from "@/lib/namedays";
import { firstName, suggestProgram } from "@/lib/programs";
import { CoolingTag } from "@/components/signals/CoolingTag";
import { ago, reasonText, type Reason } from "@/lib/signals";
import { getClientEvents } from "@/lib/signals-server";

export async function generateMetadata({ params }: PageProps<"/clients/[id]">): Promise<Metadata> {
  const client = await getClient((await params).id);
  return { title: client?.full_name ?? "Client" };
}

export default async function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const { from } = await searchParams;
  const [{ t, lang }, client, session] = await Promise.all([getI18n(), getClient(id), getSession()]);
  if (!client || !session) notFound();

  const supabase = await createClient();
  const seeking = isSeeking(client.types) && client.search;

  const [
    matches,
    searchLines,
    offerLines,
    { data: owned },
    { data: activityRows },
    { data: taskRows },
    { data: dealRows },
    { data: shareRows },
    { data: listingRows },
    { data: programRows },
    { data: identity },
    { data: temperature },
    events,
  ] = await Promise.all([
    seeking ? findMatches(supabase, session.organizationId, client.search!) : Promise.resolve([]),
    seeking ? describeSearch(client.search!, t, lang) : Promise.resolve([]),
    isOffering(client.types) && client.offer ? describeOffer(client.offer, t, lang) : Promise.resolve([] as [string, string][]),
    supabase
      .from("properties")
      .select("id, title, status, current_price, currency")
      .eq("owner_client_id", id)
      .order("updated_at", { ascending: false }),
    // My log for this client (managers see the whole team's)
    supabase
      .from("activities")
      .select("id, type, note, feedback, outcome, occurred_at, profile_id, person:profiles(full_name, email), property:properties(id, title)")
      .eq("client_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase.from("tasks").select(TASK_SELECT).eq("client_id", id).eq("status", "open"),
    supabase.from("deals").select(DEAL_SELECT).eq("client_id", id).order("updated_at", { ascending: false }),
    // listings sent to this client by link
    supabase
      .from("property_shares")
      .select("id, token, views, last_viewed_at, revoked_at, created_at, created_by, property:properties(id, title), creator:profiles(full_name, email)")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    // listings a viewing can be about
    supabase
      .from("properties")
      .select("id, title")
      .eq("organization_id", session.organizationId)
      .in("status", ["active", "reserved"])
      .in("operation_type", ["sale", "rent"])
      .order("updated_at", { ascending: false })
      .limit(500),
    // contact programs, the current one first
    supabase
      .from("contact_programs")
      .select("id, program, step, round, status, started_on")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    // ЕГН and ID card: only the client's broker and the managers get them back
    supabase.from("client_identity").select("egn, id_card").eq("client_id", id).maybeSingle(),
    // how the client behaves: the temperature and what they did with the links
    supabase
      .from("client_temperatures")
      .select("temperature, reasons, auto_class_at, auto_class_from, auto_class_reason")
      .eq("client_id", id)
      .maybeSingle(),
    getClientEvents(supabase, id),
  ]);
  const programs = (programRows ?? []) as ClientProgram[];
  const listings = (listingRows ?? []) as { id: string; title: string }[];
  const deals = toDeals(dealRows);
  const sent: ShareRow[] = (
    (shareRows ?? []) as unknown as {
      id: string;
      token: string;
      views: number;
      last_viewed_at: string | null;
      revoked_at: string | null;
      created_at: string;
      created_by: string | null;
      property: { id: string; title: string } | null;
      creator: { full_name: string | null; email: string } | null;
    }[]
  ).map((row) => ({
    id: row.id,
    token: row.token,
    name: row.property?.title ?? null,
    href: row.property ? `/properties/${row.property.id}` : null,
    sharedBy: row.creator && row.created_by !== session.userId ? personName(row.creator) : null,
    views: row.views,
    lastViewedAt: row.last_viewed_at,
    revoked: row.revoked_at !== null,
    createdAt: row.created_at,
  }));

  const activities = (activityRows ?? []) as unknown as {
    id: string;
    type: string;
    note: string | null;
    feedback: string | null;
    outcome: "positive" | "neutral" | "negative" | null;
    occurred_at: string;
    profile_id: string;
    person: { full_name: string | null; email: string } | null;
    property: { id: string; title: string } | null;
  }[];
  const openTasks = ((taskRows ?? []) as unknown as TaskRow[]).sort(byDue);
  const today = sofiaToday();
  const lastContact = activities[0]?.occurred_at ?? null;

  const covers = await signPhotoUrls(
    supabase,
    matches.map((m) => m.coverPath).filter((p): p is string => Boolean(p))
  );
  const brokerName = client.broker?.full_name || client.broker?.email || "—";
  const back = await memberBack(from, client.organization_id);
  // Free contacts are open to everyone to take; only the broker and managers change a client.
  const isFree = client.responsible_broker_id === null;
  const canEdit = session.isManager || client.responsible_broker_id === session.userId;
  const members = session.isManager ? await getMembers(supabase, session.organizationId) : [];
  const followUpLate = client.follow_up_at !== null && client.follow_up_at <= new Date().toISOString();
  const activeProgram = programs.find((p) => p.status === "active");
  const programTask = activeProgram ? openTasks.find((task) => task.program_id === activeProgram.id) : undefined;
  const year = Number(today.slice(0, 4));
  const nameDay = nameDayIn(firstName(client.full_name), year);
  const dayMonth = (day: number, month: number) =>
    new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, day)));

  return (
    <>
      <PageHeader
        backHref={back?.href ?? "/clients"}
        backLabel={back?.label ?? t.clients.title}
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
            {client.follow_up_at && (
              <span className={`inline-flex items-center gap-1 ${followUpLate ? "font-semibold text-danger" : ""}`}>
                <CalendarCheck className="size-3.5" />
                {t.followUp.nextContact}:{" "}
                {fmt(followUpLate ? t.followUp.lateBy : t.followUp.dueIn, { when: formatDate(client.follow_up_at, lang, true) })}
              </span>
            )}
          </span>
        }
        actions={
          <>
            {isFree && (
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-fg">
                {t.contacts.freeBadge}
              </span>
            )}
            {isFree && <ClaimButton clientId={client.id} />}
            {session.isManager && (
              <AssignSelect
                clientId={client.id}
                current={client.responsible_broker_id}
                label={isFree ? t.contacts.assign : t.followUp.reassign}
                members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
              />
            )}
            {canEdit && <ClientStageSelect clientId={client.id} stage={client.stage} />}
            {canEdit && (
              <Link href={`/clients/${client.id}/edit`} className={buttonClass.secondary}>
                <Pencil className="size-4" />
                {t.common.edit}
              </Link>
            )}
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
            {(client.phone || client.email) && (
              <div className="mt-3">
                <ContactButtons phone={client.phone} email={client.email} clientId={canEdit ? client.id : null} />
              </div>
            )}

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
                <dd className="text-right font-medium">
                  {client.source ? t.options.source[client.source as keyof typeof t.options.source] : "—"}
                  {client.referrer && (
                    <span className="block text-xs font-normal text-muted">{fmt(t.clients.fromReferrer, { name: client.referrer })}</span>
                  )}
                </dd>
              </div>
              {identity?.egn && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">{t.clients.egn}</dt>
                  <dd>
                    <SecretValue value={identity.egn} />
                  </dd>
                </div>
              )}
              {identity?.id_card && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted">{t.clients.idCard}</dt>
                  <dd>
                    <SecretValue value={identity.id_card} />
                  </dd>
                </div>
              )}
              {client.birth_day !== null && client.birth_month !== null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t.programs.birthdayLabel}</dt>
                  <dd className="font-medium">{dayMonth(client.birth_day, client.birth_month)}</dd>
                </div>
              )}
              {nameDay && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">{t.programs.nameDayLabel}</dt>
                  <dd className="text-right font-medium">
                    {dayMonth(Number(nameDay.day.slice(8)), Number(nameDay.day.slice(5, 7)))}
                    <span className="block text-xs font-normal text-muted">{nameDay.feast}</span>
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">{t.clients.lastUpdate}</dt>
                <dd className="font-medium">{formatDate(client.updated_at, lang, true)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-subtle">
              {fmt(t.clients.since, { date: formatDate(client.created_at, lang) })}
            </p>
          </Card>

          {/* ---- how the client behaves ---- */}
          {(temperature || events.length > 0) && (
            <Card
              title={
                <span className="flex items-center justify-between gap-2">
                  {t.signals.behaviour}
                  {temperature?.temperature === "cooling" && <CoolingTag t={t} />}
                </span>
              }
            >
              {/* the class — and when the system moved it, why */}
              <div className="mb-3 flex items-center gap-3">
                <ClassBadge value={client.client_class} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {client.client_class} — {t.options.clientClass[client.client_class as "A" | "B" | "C"]}
                  </p>
                  {temperature?.auto_class_at && temperature.auto_class_from && temperature.auto_class_from !== client.client_class && (
                    <p className="text-xs text-muted">
                      {fmt(t.signals.autoClass, {
                        from: temperature.auto_class_from,
                        to: client.client_class,
                        when: ago(temperature.auto_class_at, lang),
                      })}
                      {temperature.auto_class_reason &&
                        ` · ${(t.signals.autoReasons as Record<string, string>)[temperature.auto_class_reason] ?? ""}`}
                    </p>
                  )}
                </div>
              </div>
              {temperature && (temperature.reasons as Reason[]).length > 0 && (
                <ul className="mb-4 space-y-1 text-sm text-fg-2">
                  {(temperature.reasons as Reason[]).map((reason, i) => (
                    <li key={i}>• {reasonText(reason, t, lang)}</li>
                  ))}
                </ul>
              )}
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">{t.signals.timeline}</p>
              {events.length === 0 ? (
                <p className="text-sm text-muted">{t.signals.timelineNone}</p>
              ) : (
                <ul className="space-y-2">
                  {events.map((event) => {
                    const title = event.property?.title ?? "—";
                    return (
                      <li key={event.id} className="flex items-start gap-2 text-sm">
                        {event.kind === "open" ? (
                          <Eye className="mt-0.5 size-3.5 shrink-0 text-brand-cyan" />
                        ) : (
                          <MousePointerClick className="mt-0.5 size-3.5 shrink-0 text-danger" />
                        )}
                        <span className="min-w-0">
                          <span className={event.kind === "open" ? "text-fg-2" : "font-semibold text-danger"}>
                            {event.kind === "open"
                              ? fmt(t.signals.openedEvent, { title })
                              : fmt(t.signals.tappedEvent, { button: t.signals.buttons[event.kind], title })}
                          </span>
                          <span className="block text-xs text-muted">
                            {[
                              ago(event.occurred_at, lang),
                              event.seconds >= 30 ? fmt(t.signals.minutes, { n: Math.max(1, Math.round(event.seconds / 60)) }) : null,
                              event.photos > 0 ? fmt(t.signals.photos, { n: event.photos }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-4 text-[11px] text-subtle">{t.signals.classHint}</p>
            </Card>
          )}

          <ProgramCard
            programs={programs}
            openTask={programTask ? { id: programTask.id, due_date: programTask.due_date } : null}
            canEdit={canEdit}
            hasBroker={!isFree}
            clientId={client.id}
            suggested={suggestProgram(client, {
              wonDeal: deals.some((d) => d.status === "won"),
              activeListing: (owned ?? []).some((p) => p.status === "active"),
            })}
            t={t}
            lang={lang}
          />

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
                {canEdit && !isFree && (
                  <Link
                    href={`/tasks/new?client=${client.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline"
                  >
                    <Plus className="size-3.5" />
                    {t.activity.addTask}
                  </Link>
                )}
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

          <Card
            title={
              <span className="flex items-center justify-between gap-3">
                {t.deals.forClient}
                {canEdit && !isFree && (
                  <Link
                    href={`/deals/new?client=${client.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline"
                  >
                    <Plus className="size-3.5" />
                    {t.deals.newDeal}
                  </Link>
                )}
              </span>
            }
          >
            {deals.length === 0 ? (
              <p className="text-sm text-muted">{t.deals.none}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {deals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} t={t} lang={lang} showBroker={session.isManager} />
                ))}
              </div>
            )}
          </Card>

          <Card title={t.activity.title}>
            {canEdit && <QuickLog clientId={client.id} properties={listings} />}
            {activities.length === 0 ? (
              <p className="mt-5 text-sm text-muted">{t.activity.empty}</p>
            ) : (
              <ol className="relative mt-6 space-y-4 border-l border-line pl-5">
                {activities.map((a) => (
                  <ActivityEntry
                    key={a.id}
                    activity={{
                      id: a.id,
                      type: a.type,
                      note: a.note,
                      feedback: a.feedback,
                      outcome: a.outcome,
                      property: a.property,
                      when: formatDate(a.occurred_at, lang, true),
                      who: a.profile_id === session.userId ? t.activity.byYou : personName(a.person),
                      canEdit: a.type !== "task" && (a.profile_id === session.userId || session.isManager),
                    }}
                  />
                ))}
              </ol>
            )}
          </Card>

          {isSeeking(client.types) && (
            <Card title={t.clients.sectionSearch}>
              {searchLines.length > 0 ? (
                <>
                  <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    {searchLines.map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted">{label}</dt>
                        <dd className="mt-0.5 font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {canEdit && (
                    <div className="mt-5 border-t border-line-soft pt-4">
                      <ShareSearchDialog clientId={client.id} />
                    </div>
                  )}
                </>
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

          {isOffering(client.types) && (
            <Card
              title={
                client.types.includes("seller") && client.types.includes("landlord")
                  ? t.clients.sectionOfferBoth
                  : client.types.includes("landlord")
                    ? t.clients.sectionOfferRent
                    : t.clients.sectionOffer
              }
            >
              {offerLines.length > 0 ? (
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  {offerLines.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="mt-0.5 font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted">{t.clients.offerHint}</p>
                  {canEdit && (
                    <Link href={`/clients/${client.id}/edit`} className={buttonClass.secondary}>
                      <Pencil className="size-4" />
                      {t.common.edit}
                    </Link>
                  )}
                </div>
              )}
            </Card>
          )}

          {(sent.length > 0 || seeking) && (
            <Card title={t.share.sentTitle}>
              <ShareList rows={sent} empty={t.share.noneSent} />
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
