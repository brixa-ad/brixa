import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, BellOff, CheckCircle2, ClipboardList } from "lucide-react";
import { MarkNotificationsRead } from "@/components/MarkNotificationsRead";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import { fmt, type Dictionary } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.notifications.title };
}

type Row = {
  id: string;
  type: string;
  data: { title?: string; actor?: string; days?: number };
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/** Notifications are stored as type + data; the text is written in the reader's language. */
function text(n: Row, t: Dictionary) {
  const vars = { title: n.data.title ?? "", actor: n.data.actor ?? "", days: n.data.days ?? 0 };
  const late = (n.data.days ?? 0) > 0;
  switch (n.type) {
    case "task_assigned":
      return fmt(t.notifications.task_assigned, vars);
    case "task_done":
      return fmt(t.notifications.task_done, vars);
    case "task_overdue":
      return fmt(late ? t.notifications.task_overdue_days : t.notifications.task_overdue, vars);
    case "task_overdue_team":
      return fmt(late ? t.notifications.task_overdue_team_days : t.notifications.task_overdue_team, vars);
    default:
      return vars.title;
  }
}

const ICONS: Record<string, { icon: typeof ClipboardList; tone: string }> = {
  task_assigned: { icon: ClipboardList, tone: "bg-accent-soft text-accent-fg" },
  task_done: { icon: CheckCircle2, tone: "bg-success/10 text-success" },
  task_overdue: { icon: AlarmClock, tone: "bg-warning/10 text-warning" },
  task_overdue_team: { icon: AlarmClock, tone: "bg-danger/10 text-danger" },
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
                  <p className={`text-sm leading-snug ${n.read_at ? "text-fg-2" : "font-semibold text-fg"}`}>{text(n, t)}</p>
                  <p className="mt-0.5 text-xs text-subtle">{formatDate(n.created_at, lang, true)}</p>
                </div>
                {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent-fg" aria-hidden />}
              </div>
            );
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link href={n.link} className="block transition hover:bg-raised">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
