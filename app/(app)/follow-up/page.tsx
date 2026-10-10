import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Flame, Newspaper, PhoneCall } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ClassBadge } from "@/components/client/ClassBadge";
import { ContactButtons } from "@/components/ContactButtons";
import { AssignSelect, ContactedButton } from "@/components/followup/FollowUpControls";
import { PageHeader } from "@/components/PageHeader";
import { NewsList, type NewsItem } from "@/components/news/NewsList";
import { SignalsBoard } from "@/components/signals/SignalsBoard";
import { BrokerPicker } from "@/components/task/BrokerPicker";
import { addDays, sofiaDay, sofiaToday } from "@/lib/dates";
import { formatDate, formatDayMonth } from "@/lib/format";
import { fmt, locale, type Dictionary } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMyPeople } from "@/lib/lookups";
import { isNewsKind, newsText, newsTitle, type NewsData } from "@/lib/news";
import { firstName } from "@/lib/programs";
import type { ClientClass } from "@/lib/options";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { personName } from "@/lib/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.followUp.title };
}

type Row = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  client_class: ClientClass;
  follow_up_at: string;
  responsible_broker_id: string;
  broker: { full_name: string | null; email: string; avatar_path: string | null } | null;
};

/** Everyone to get back to, soonest first — overdue ones on top; and the signals (how the clients behave). */
export default async function FollowUpPage({ searchParams }: PageProps<"/follow-up">) {
  const params = await searchParams;
  const session = (await getSession())!;
  // Managers see the whole team by default (or one colleague); brokers their own.
  const broker = session.isManager ? (typeof params.broker === "string" ? params.broker : "all") : session.userId;
  const today = sofiaToday();
  const weekEnd = addDays(today, 7);

  const supabase = await createClient();

  // three views: who to contact, the signals, and the market news ready to send
  const view = params.view === "signals" || params.view === "news" ? params.view : "calls";
  const viewHref = (v: "calls" | "signals" | "news") => {
    const qs = new URLSearchParams();
    if (v !== "calls") qs.set("view", v);
    if (typeof params.broker === "string") qs.set("broker", params.broker);
    const s = qs.toString();
    return s ? `/follow-up?${s}` : "/follow-up";
  };
  // the news waiting to be sent (whose: as the list below)
  const newsSince = addDays(today, -30);
  const newsQuery = (columns: string, head = false) => {
    let q = supabase
      .from("client_news")
      .select(columns, head ? { count: "exact", head: true } : undefined)
      .eq("organization_id", session.organizationId)
      .is("sent_at", null)
      .is("skipped_at", null)
      .gte("created_on", newsSince);
    if (broker !== "all") q = q.eq("client.responsible_broker_id", broker);
    return q;
  };
  const { count: newsCount } = await newsQuery("id, client:clients!inner(responsible_broker_id)", true);
  const viewTabs = (t: Dictionary) => (
    <nav className="mb-5 inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-0.5">
      {(
        [
          ["calls", PhoneCall, t.followUp.viewCalls],
          ["signals", Flame, t.followUp.viewSignals],
          ["news", Newspaper, t.followUp.viewNews],
        ] as const
      ).map(([v, Icon, label]) => (
        <Link
          key={v}
          href={viewHref(v)}
          aria-current={view === v ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            view === v ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
          }`}
        >
          <Icon className="size-4" />
          {label}
          {v === "news" && (newsCount ?? 0) > 0 && (
            <span className={`rounded-full px-1.5 text-[11px] font-semibold ${view === v ? "bg-on-accent/20" : "bg-accent text-on-accent"}`}>{newsCount}</span>
          )}
        </Link>
      ))}
    </nav>
  );
  if (view === "news") {
    const [{ t, lang }, { data: rows }, members] = await Promise.all([
      getI18n(),
      newsQuery("id, kind, data, created_on, client:clients!inner(id, full_name, phone, email, responsible_broker_id)")
        .order("created_on", { ascending: false })
        .limit(300),
      session.isManager ? getMyPeople(supabase) : Promise.resolve([]),
    ]);
    const signer = session.fullName || session.email;
    const items: NewsItem[] = (
      (rows ?? []) as unknown as {
        id: string;
        kind: string;
        data: NewsData;
        created_on: string;
        client: { id: string; full_name: string; phone: string | null; email: string | null };
      }[]
    )
      .filter((row) => isNewsKind(row.kind))
      .map((row) => {
        const kind = row.kind as Parameters<typeof newsTitle>[0];
        return {
          id: row.id,
          clientId: row.client.id,
          name: row.client.full_name,
          phone: row.client.phone,
          email: row.client.email,
          kind,
          title: newsTitle(kind, row.data, t, lang),
          date: formatDate(row.created_on, lang),
          text: newsText(kind, row.data, { name: firstName(row.client.full_name), broker: signer }, t, lang, today),
        };
      });
    return (
      <>
        <PageHeader
          title={t.followUp.title}
          subtitle={t.news.subtitle}
          actions={
            session.isManager ? (
              <BrokerPicker
                value={broker}
                selfId={session.userId}
                members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
                allByDefault
              />
            ) : undefined
          }
        />
        {viewTabs(t)}
        <NewsList items={items} />
      </>
    );
  }
  if (view === "signals") {
    const [{ t, lang }, members] = await Promise.all([
      getI18n(),
      session.isManager ? getMyPeople(supabase) : Promise.resolve([]),
    ]);
    return (
      <>
        <PageHeader
          title={t.followUp.title}
          subtitle={t.signals.subtitle}
          actions={
            session.isManager ? (
              <BrokerPicker
                value={broker}
                selfId={session.userId}
                members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
                allByDefault
              />
            ) : undefined
          }
        />
        {viewTabs(t)}
        <SignalsBoard organizationId={session.organizationId} broker={broker === "all" ? null : broker} viewerId={session.userId} t={t} lang={lang} />
      </>
    );
  }

  let query = supabase
    .from("clients")
    .select(
      `id, full_name, phone, email, client_class, follow_up_at, responsible_broker_id,
      broker:profiles!clients_responsible_broker_id_fkey(full_name, email, avatar_path)`
    )
    .eq("organization_id", session.organizationId)
    .not("follow_up_at", "is", null)
    .order("follow_up_at")
    .limit(1000);
  if (broker !== "all") query = query.eq("responsible_broker_id", broker);

  const [{ t, lang }, { data }, members] = await Promise.all([
    getI18n(),
    query,
    session.isManager ? getMyPeople(supabase) : Promise.resolve([]),
  ]);
  const rows = (data ?? []) as unknown as Row[];

  // last real contact per client (a note doesn't count)
  const lastContact = new Map<string, string>();
  if (rows.length > 0) {
    const { data: acts } = await supabase
      .from("activities")
      .select("client_id, occurred_at")
      .in("client_id", rows.slice(0, 300).map((r) => r.id))
      .neq("type", "note")
      .order("occurred_at", { ascending: false });
    for (const a of acts ?? []) if (a.client_id && !lastContact.has(a.client_id)) lastContact.set(a.client_id, a.occurred_at);
  }

  const now = new Date().toISOString();
  const groups = {
    overdue: rows.filter((r) => r.follow_up_at <= now),
    today: rows.filter((r) => r.follow_up_at > now && sofiaDay(r.follow_up_at) === today),
    week: rows.filter((r) => sofiaDay(r.follow_up_at) > today && sofiaDay(r.follow_up_at) <= weekEnd),
  };
  const later = rows.filter((r) => sofiaDay(r.follow_up_at) > weekEnd).length;
  const memberList = members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }));
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale(lang), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" }).format(new Date(iso));

  const section = (key: keyof typeof groups, title: string, tone: string) => {
    const list = groups[key];
    return (
      <section key={key} className="rounded-2xl border border-line bg-surface p-2 shadow-xs sm:p-3">
        <h2 className={`flex items-center justify-between px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide ${tone}`}>
          {title}
          <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] text-fg-2">{list.length}</span>
        </h2>
        {list.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted">{key === "overdue" ? t.followUp.allClear : t.followUp.none}</p>
        ) : (
          <ul>
            {list.map((r) => {
              const last = lastContact.get(r.id);
              const due =
                key === "overdue"
                  ? fmt(t.followUp.lateBy, { when: formatDate(r.follow_up_at, lang, true) })
                  : fmt(t.followUp.dueIn, {
                      when: key === "today" ? time(r.follow_up_at) : `${formatDayMonth(r.follow_up_at, lang)}, ${time(r.follow_up_at)}`,
                    });
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 hover:bg-raised/50">
                  <ClassBadge value={r.client_class} title={t.options.clientClass[r.client_class]} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/clients/${r.id}`} className="block truncate text-sm font-semibold hover:text-accent-fg">
                      {r.full_name}
                    </Link>
                    <p className={`truncate text-xs ${key === "overdue" ? "font-semibold text-danger" : "text-muted"}`}>
                      {due}
                      <span className="font-normal text-subtle">
                        {" · "}
                        {last ? fmt(t.followUp.lastContact, { when: formatDate(last, lang) }) : t.followUp.never}
                      </span>
                    </p>
                  </div>
                  {broker === "all" && r.broker && (
                    <Avatar path={r.broker.avatar_path} name={personName(r.broker)} size="sm" />
                  )}
                  {/* on the phone the buttons get their own line under the name */}
                  <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
                    <ContactButtons phone={r.phone} email={r.email} clientId={r.id} compact />
                    <ContactedButton clientId={r.id} />
                    {session.isManager && memberList.length > 1 && (
                      <AssignSelect
                        clientId={r.id}
                        current={r.responsible_broker_id}
                        label={t.followUp.reassign}
                        members={memberList}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };

  return (
    <>
      <PageHeader
        title={t.followUp.title}
        subtitle={t.followUp.subtitle}
        actions={
          session.isManager ? (
            <BrokerPicker value={broker} selfId={session.userId} members={memberList} allByDefault />
          ) : undefined
        }
      />
      {viewTabs(t)}

      <div className="space-y-4">
        {section("overdue", t.followUp.overdue, "text-danger")}
        {section("today", t.followUp.today, "text-accent-fg")}
        {section("week", t.followUp.week, "text-subtle")}
        {later > 0 && (
          <p className="flex items-center gap-2 px-2 text-sm text-muted">
            <CalendarCheck className="size-4" />
            {t.followUp.later}: {later}
          </p>
        )}
      </div>
    </>
  );
}
