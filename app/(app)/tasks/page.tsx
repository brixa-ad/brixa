import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { BrokerPicker } from "@/components/task/BrokerPicker";
import { TaskItem } from "@/components/task/TaskItem";
import { buttonClass } from "@/components/ui/form";
import { sofiaToday } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { TASK_SELECT, byDue, type TaskRow } from "@/lib/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.tasks.title };
}

const TABS = ["today", "upcoming", "done", "given"] as const;
type Tab = (typeof TABS)[number];

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const params = await searchParams;
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "today";
  const session = (await getSession())!;
  const supabase = await createClient();
  const today = sofiaToday();
  const { t, lang } = await getI18n();

  // Managers can look at a colleague's (or everyone's) list; brokers see their own.
  const broker = session.isManager && typeof params.broker === "string" ? params.broker : session.userId;
  const showAssignee = broker === "all";

  let query = supabase.from("tasks").select(TASK_SELECT).eq("organization_id", session.organizationId);
  if (tab === "given") {
    query = query.eq("created_by", session.userId).neq("assigned_to", session.userId).order("due_date");
  } else {
    if (broker !== "all") query = query.eq("assigned_to", broker);
    if (tab === "today") query = query.eq("status", "open").lte("due_date", today);
    if (tab === "upcoming") query = query.eq("status", "open").gt("due_date", today).order("due_date");
    if (tab === "done") query = query.eq("status", "done").order("completed_at", { ascending: false }).limit(100);
  }

  const [{ data, error }, members] = await Promise.all([
    query,
    session.isManager ? getMembers(supabase, session.organizationId) : Promise.resolve([]),
  ]);
  if (error) console.error("Loading tasks failed:", error.message);

  let tasks = (data ?? []) as unknown as TaskRow[];
  if (tab === "today" || tab === "upcoming") tasks = [...tasks].sort(byDue);

  // Upcoming: grouped by day.
  const groups = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const key = tab === "upcoming" ? task.due_date : "";
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }

  const tabLabel: Record<Tab, string> = {
    today: t.tasks.tabToday,
    upcoming: t.tasks.tabUpcoming,
    done: t.tasks.tabDone,
    given: t.tasks.tabGiven,
  };
  const tabHref = (next: Tab) => {
    const qs = new URLSearchParams();
    if (next !== "today") qs.set("tab", next);
    if (broker !== session.userId) qs.set("broker", broker);
    const s = qs.toString();
    return s ? `/tasks?${s}` : "/tasks";
  };

  return (
    <>
      <PageHeader
        title={t.tasks.title}
        subtitle={session.isManager ? t.tasks.subtitleManager : t.tasks.subtitle}
        actions={
          <>
            {session.isManager && (
              <BrokerPicker
                value={broker}
                selfId={session.userId}
                members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
              />
            )}
            <Link
              href={broker !== session.userId && broker !== "all" ? `/tasks/new?assignee=${broker}` : "/tasks/new"}
              className={buttonClass.primary}
            >
              <Plus className="size-4" />
              {t.tasks.newTask}
            </Link>
          </>
        }
      />

      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {TABS.map((key) => (
          <Link
            key={key}
            href={tabHref(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
              tab === key ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
            }`}
          >
            {tabLabel[key]}
          </Link>
        ))}
      </nav>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <ListChecks className="mx-auto size-10 text-faint" />
          <p className="mt-3 text-sm text-muted">{t.tasks.empty}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([day, list]) => (
            <section key={day || "all"} className="rounded-2xl border border-line bg-surface p-2 shadow-xs sm:p-3">
              {day && (
                <h2 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-subtle">
                  {formatDate(day, lang)}
                </h2>
              )}
              <ul>
                {list.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    today={today}
                    viewerId={session.userId}
                    t={t}
                    showAssignee={showAssignee || tab === "given"}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
