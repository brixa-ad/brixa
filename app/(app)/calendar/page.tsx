import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Handshake } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { BrokerPicker } from "@/components/task/BrokerPicker";
import { TypeIcon } from "@/components/task/TypeIcon";
import { Card, buttonClass } from "@/components/ui/form";
import { TIME_ZONE, addDays, daysBetween, sofiaToday } from "@/lib/dates";
import { formatDayMonth } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { locale } from "@/lib/i18n/dictionaries";
import { getMembers } from "@/lib/lookups";
import { dealStages, type DealKind, type DealStage } from "@/lib/options";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { GoogleCalendarLink } from "./GoogleCalendarLink";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.calendar.title };
}

type Entry = {
  key: string;
  day: string;
  time: string | null;
  title: string;
  subtitle: string;
  href: string;
  done: boolean;
  task?: string;
};

const STEP_COLUMNS: Record<DealStage, [string, string]> = {
  viewing: ["viewing_on", "viewing_time"],
  offer: ["offer_on", "offer_time"],
  deposit: ["deposit_on", "deposit_time"],
  preliminary: ["preliminary_on", "preliminary_time"],
  notary: ["notary_on", "notary_time"],
};

/** Monday of the week the day falls in. */
function mondayOf(day: string) {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = await searchParams;
  const session = (await getSession())!;
  const today = sofiaToday();
  const requested = typeof params.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : today;
  const monday = mondayOf(requested);
  const sunday = addDays(monday, 6);
  // Managers can look at a colleague's week; everyone else sees their own.
  const person = session.isManager && typeof params.broker === "string" ? params.broker : session.userId;

  const supabase = await createClient();
  const stepFilter = Object.values(STEP_COLUMNS)
    .map(([day]) => `and(${day}.gte.${monday},${day}.lte.${sunday})`)
    .join(",");
  const [{ t, lang }, tasksRes, dealsRes, tokenRes, members, requestHeaders] = await Promise.all([
    getI18n(),
    supabase
      .from("tasks")
      .select("id, title, type, status, due_date, due_time, client:clients(full_name)")
      .eq("assigned_to", person)
      .gte("due_date", monday)
      .lte("due_date", sunday),
    supabase
      .from("deals")
      .select(
        `id, kind, stage, status, viewing_on, offer_on, deposit_on, preliminary_on, notary_on,
        viewing_time, offer_time, deposit_time, preliminary_time, notary_time,
        property:properties(title), client:clients(full_name)`
      )
      .eq("broker_id", person)
      .neq("status", "lost")
      .or(stepFilter),
    person === session.userId ? supabase.rpc("my_calendar_token") : Promise.resolve({ data: null }),
    session.isManager ? getMembers(supabase, session.organizationId) : Promise.resolve([]),
    headers(),
  ]);

  const entries: Entry[] = [];
  for (const task of (tasksRes.data ?? []) as unknown as {
    id: string;
    title: string;
    type: string;
    status: string;
    due_date: string;
    due_time: string | null;
    client: { full_name: string } | null;
  }[]) {
    entries.push({
      key: `task-${task.id}`,
      day: task.due_date,
      time: task.due_time?.slice(0, 5) ?? null,
      title: task.title,
      subtitle: task.client?.full_name ?? t.options.taskType[task.type as keyof typeof t.options.taskType] ?? "",
      href: `/tasks/${task.id}`,
      done: task.status === "done",
      task: task.type,
    });
  }
  for (const deal of (dealsRes.data ?? []) as unknown as Record<string, unknown>[]) {
    const kind = deal.kind as DealKind;
    const labels = kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
    const property = deal.property as { title: string } | null;
    const client = deal.client as { full_name: string } | null;
    for (const stage of dealStages(kind)) {
      const [dayColumn, timeColumn] = STEP_COLUMNS[stage];
      const day = deal[dayColumn] as string | null;
      if (!day || day < monday || day > sunday) continue;
      entries.push({
        key: `deal-${deal.id}-${stage}`,
        day,
        time: (deal[timeColumn] as string | null)?.slice(0, 5) ?? null,
        title: `${labels[stage]}: ${property?.title ?? client?.full_name ?? t.deals.untitled}`,
        subtitle: property && client ? client.full_name : t.nav.deals,
        href: `/deals/${deal.id}`,
        done: deal.status === "won",
      });
    }
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const byDay = new Map(days.map((d) => [d, [] as Entry[]]));
  for (const entry of entries) byDay.get(entry.day)?.push(entry);
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99") || a.title.localeCompare(b.title));
  }

  const weekday = new Intl.DateTimeFormat(locale(lang), { weekday: "long", timeZone: TIME_ZONE });
  const weekHref = (day: string) => {
    const qs = new URLSearchParams();
    if (mondayOf(day) !== mondayOf(today)) qs.set("week", day);
    if (person !== session.userId) qs.set("broker", person);
    const s = qs.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };
  const host = requestHeaders.get("host") ?? "brixa-yavlena.vercel.app";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const feedUrl = tokenRes.data ? `${protocol}://${host}/api/calendar/${tokenRes.data}.ics` : null;
  const isThisWeek = daysBetween(monday, today) >= 0 && daysBetween(monday, today) < 7;

  return (
    <>
      <PageHeader
        title={t.calendar.title}
        subtitle={t.calendar.subtitle}
        actions={
          session.isManager ? (
            <BrokerPicker
              value={person}
              selfId={session.userId}
              members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
            />
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Link href={weekHref(addDays(monday, -7))} aria-label={t.calendar.previous} className={`${buttonClass.secondary} px-3!`}>
              <ChevronLeft className="size-4" />
            </Link>
            <p className="flex-1 text-center text-sm font-semibold">
              {formatDayMonth(monday, lang)} – {formatDayMonth(sunday, lang)}
            </p>
            {!isThisWeek && (
              <Link href={weekHref(today)} className={`${buttonClass.ghost} px-3!`}>
                {t.calendar.thisWeek}
              </Link>
            )}
            <Link href={weekHref(addDays(monday, 7))} aria-label={t.calendar.next} className={`${buttonClass.secondary} px-3!`}>
              <ChevronRight className="size-4" />
            </Link>
          </div>

          <ol className="space-y-3">
            {days.map((day) => {
              const list = byDay.get(day) ?? [];
              const isToday = day === today;
              return (
                <li
                  key={day}
                  className={`rounded-2xl border bg-surface p-3 shadow-xs sm:p-4 ${isToday ? "border-accent/50" : "border-line"}`}
                >
                  <h2 className="mb-1 flex items-baseline gap-2 px-1 text-sm">
                    <span className={`font-semibold capitalize ${isToday ? "text-accent-fg" : ""}`}>
                      {weekday.format(new Date(`${day}T12:00:00Z`))}
                    </span>
                    <span className="text-muted">{formatDayMonth(day, lang)}</span>
                    {isToday && (
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-fg">
                        {t.home.todayLabel}
                      </span>
                    )}
                  </h2>
                  {list.length === 0 ? (
                    <p className="px-1 py-1.5 text-xs text-faint">{t.calendar.nothing}</p>
                  ) : (
                    <ul>
                      {list.map((entry) => (
                        <li key={entry.key}>
                          <Link
                            href={entry.href}
                            className="flex items-center gap-3 rounded-lg px-1 py-2 transition hover:bg-raised"
                          >
                            <span className="w-12 shrink-0 text-center text-xs font-semibold tabular-nums text-fg-2">
                              {entry.time ?? <span className="font-normal text-subtle">{t.calendar.allDay}</span>}
                            </span>
                            <span
                              className={`grid size-7 shrink-0 place-items-center rounded-lg ${
                                entry.task ? "bg-accent-soft text-accent-fg" : "bg-warning/10 text-warning"
                              }`}
                            >
                              {entry.task ? <TypeIcon type={entry.task} className="size-3.5" /> : <Handshake className="size-3.5" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-sm font-medium ${entry.done ? "text-muted line-through" : ""}`}>
                                {entry.title}
                              </span>
                              {entry.subtitle && <span className="block truncate text-xs text-muted">{entry.subtitle}</span>}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {feedUrl && (
          <Card
            title={
              <span className="flex items-center gap-2">
                <CalendarDays className="size-4 text-brand-cyan" />
                {t.calendar.googleTitle}
              </span>
            }
            description={t.calendar.googleHint}
            className="h-fit"
          >
            <GoogleCalendarLink url={feedUrl} />
          </Card>
        )}
      </div>
    </>
  );
}
