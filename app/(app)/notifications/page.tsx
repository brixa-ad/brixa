import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, BadgeCheck, DoorOpen, Globe, BellOff, BellRing, CalendarCheck, Inbox, ListX, PhoneMissed, Sparkles, UserPlus, CalendarClock, CheckCircle2, ClipboardList, FileBarChart, Flame, Handshake, Link2, Trophy, TrendingUp, Undo2, UserSearch } from "lucide-react";
import { ContactButtons } from "@/components/ContactButtons";
import { MarkNotificationsRead } from "@/components/MarkNotificationsRead";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { notificationLink, notificationText, type NotificationData } from "@/lib/notification-text";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.notifications.title };
}

type Row = {
  id: string;
  type: string;
  data: NotificationData;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const ICONS: Record<string, { icon: typeof ClipboardList; tone: string }> = {
  task_assigned: { icon: ClipboardList, tone: "bg-accent-soft text-accent-fg" },
  task_done: { icon: CheckCircle2, tone: "bg-success/10 text-success" },
  task_overdue: { icon: AlarmClock, tone: "bg-warning/10 text-warning" },
  task_overdue_team: { icon: AlarmClock, tone: "bg-danger/10 text-danger" },
  deal_to_confirm: { icon: Handshake, tone: "bg-warning/10 text-warning" },
  deal_confirmed: { icon: BadgeCheck, tone: "bg-success/10 text-success" },
  deal_returned: { icon: Undo2, tone: "bg-warning/10 text-warning" },
  commission_logged: { icon: Trophy, tone: "bg-accent-soft text-accent-fg" },
  overtaken: { icon: TrendingUp, tone: "bg-danger/10 text-danger" },
  deal_date_tomorrow: { icon: CalendarClock, tone: "bg-accent-soft text-accent-fg" },
  deal_date_today: { icon: CalendarClock, tone: "bg-warning/10 text-warning" },
  deal_date_team: { icon: CalendarClock, tone: "bg-warning/10 text-warning" },
  deal_date_soon: { icon: AlarmClock, tone: "bg-danger/10 text-danger" },
  push_test: { icon: BellRing, tone: "bg-success/10 text-success" },
  task_reminder: { icon: AlarmClock, tone: "bg-warning/10 text-warning" },
  tasks_missed: { icon: ListX, tone: "bg-danger/10 text-danger" },
  tasks_missed_team: { icon: ListX, tone: "bg-danger/10 text-danger" },
  follow_up_missed: { icon: PhoneMissed, tone: "bg-danger/10 text-danger" },
  follow_up_missed_team: { icon: PhoneMissed, tone: "bg-danger/10 text-danger" },
  client_released: { icon: Inbox, tone: "bg-warning/10 text-warning" },
  client_released_team: { icon: Inbox, tone: "bg-warning/10 text-warning" },
  free_contact: { icon: Inbox, tone: "bg-accent-soft text-accent-fg" },
  client_assigned: { icon: UserPlus, tone: "bg-accent-soft text-accent-fg" },
  contact_claimed: { icon: UserPlus, tone: "bg-success/10 text-success" },
  follow_ups_today: { icon: CalendarCheck, tone: "bg-accent-soft text-accent-fg" },
  morning_brief: { icon: Sparkles, tone: "bg-accent-soft text-accent-fg" },
  share_viewed: { icon: Link2, tone: "bg-success/10 text-success" },
  client_hot: { icon: Flame, tone: "bg-danger/10 text-danger" },
  lead_new: { icon: ClipboardList, tone: "bg-accent-soft text-accent-fg" },
  lead_known: { icon: ClipboardList, tone: "bg-accent-soft text-accent-fg" },
  partner_search: { icon: UserSearch, tone: "bg-accent-soft text-accent-fg" },
  report_viewed: { icon: FileBarChart, tone: "bg-success/10 text-success" },
  open_house_visitor: { icon: DoorOpen, tone: "bg-accent-soft text-accent-fg" },
  site_inquiry: { icon: Globe, tone: "bg-accent-soft text-accent-fg" },
};

export default async function NotificationsPage() {
  const session = (await getSession())!;
  const supabase = await createClient();
  const [{ t, lang }, { data }] = await Promise.all([
    getI18n(),
    supabase
      .from("notifications")
      .select("id, type, data, link, read_at, created_at")
      .eq("recipient_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const rows = (data ?? []) as Row[];

  // Task notifications get call / Viber / e-mail buttons for the task's client.
  const TASK_LINK = /^\/tasks\/([0-9a-f-]{36})$/;
  const taskIds = [...new Set(rows.map((n) => n.link?.match(TASK_LINK)?.[1]).filter((id): id is string => Boolean(id)))];
  const contacts = new Map<string, { id: string; phone: string | null; email: string | null }>();
  if (taskIds.length > 0) {
    const { data: tasks } = await supabase.from("tasks").select("id, client:clients(id, phone, email)").in("id", taskIds);
    for (const task of (tasks ?? []) as unknown as { id: string; client: { id: string; phone: string | null; email: string | null } | null }[]) {
      if (task.client && (task.client.phone || task.client.email)) contacts.set(task.id, task.client);
    }
  }
  // …and so do "🔥 a hot client" and "📝 a new contact from a form"
  const CLIENT_LINK = /^\/clients\/([0-9a-f-]{36})$/;
  const CLIENT_TYPES = new Set(["client_hot", "lead_new", "lead_known"]);
  const hotIds = [
    ...new Set(rows.filter((n) => CLIENT_TYPES.has(n.type)).map((n) => n.link?.match(CLIENT_LINK)?.[1]).filter((id): id is string => Boolean(id))),
  ];
  if (hotIds.length > 0) {
    const { data: hot } = await supabase.from("clients").select("id, phone, email").in("id", hotIds);
    for (const client of hot ?? []) if (client.phone || client.email) contacts.set(client.id, client);
  }

  return (
    <>
      <PageHeader title={t.notifications.title} />
      <MarkNotificationsRead hasUnread={rows.some((n) => !n.read_at)} />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <BellOff className="mx-auto size-10 text-faint" />
          <p className="mt-3 text-sm text-muted">{t.notifications.empty}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
          {rows.map((n) => {
            const { icon: Icon, tone } = ICONS[n.type] ?? ICONS.task_assigned;
            const body = (
              <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                <span className={`grid size-9 shrink-0 place-items-center rounded-full ${tone}`}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm leading-snug ${n.read_at ? "text-fg-2" : "font-semibold text-fg"}`}>{notificationText(n.type, n.data, t, lang)}</p>
                  <p className="mt-0.5 text-xs text-subtle">{formatDate(n.created_at, lang, true)}</p>
                </div>
                {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent-fg" aria-hidden />}
              </div>
            );
            const contact = contacts.get(n.link?.match(TASK_LINK)?.[1] ?? (CLIENT_TYPES.has(n.type) ? n.link?.match(CLIENT_LINK)?.[1] : null) ?? "");
            const href = notificationLink(n.type, n.link);
            return (
              <li key={n.id} className="flex items-center">
                {href ? (
                  <Link href={href} className="block min-w-0 flex-1 transition hover:bg-raised">
                    {body}
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1">{body}</div>
                )}
                {contact && (
                  <div className="shrink-0 pr-3 sm:pr-4">
                    <ContactButtons phone={contact.phone} email={contact.email} clientId={contact.id} compact />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
