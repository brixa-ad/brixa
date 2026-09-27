import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ClassBadge } from "@/components/client/ClassBadge";
import { ContactButtons } from "@/components/ContactButtons";
import { AssignSelect, ContactedButton } from "@/components/followup/FollowUpControls";
import { PageHeader } from "@/components/PageHeader";
import { BrokerPicker } from "@/components/task/BrokerPicker";
import { addDays, sofiaDay, sofiaToday } from "@/lib/dates";
import { formatDate, formatDayMonth } from "@/lib/format";
import { fmt, locale } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
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

/** Everyone to get back to, soonest first — overdue ones on top. */
export default async function FollowUpPage({ searchParams }: PageProps<"/follow-up">) {
  const params = await searchParams;
  const session = (await getSession())!;
  // Managers see the whole team by default (or one colleague); brokers their own.
  const broker = session.isManager ? (typeof params.broker === "string" ? params.broker : "all") : session.userId;
  const today = sofiaToday();
  const weekEnd = addDays(today, 7);

  const supabase = await createClient();
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
    session.isManager ? getMembers(supabase, session.organizationId) : Promise.resolve([]),
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
                    {session.isManager && (
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
