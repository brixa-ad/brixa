import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, DoorOpen, Handshake, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { BrokerPicker } from "@/components/task/BrokerPicker";
import { TypeIcon } from "@/components/task/TypeIcon";
import { Card, buttonClass } from "@/components/ui/form";
import { TIME_ZONE, addDays, sofiaToday } from "@/lib/dates";
import { formatDayMonth } from "@/lib/format";
import { fmt, locale } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { dealStages, type DealKind, type DealStage } from "@/lib/options";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { GoogleCalendarLink } from "./GoogleCalendarLink";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.calendar.title };
}

type Kind = "task" | "deal" | "openHouse";
type Entry = {
  key: string;
  day: string;
  time: string | null;
  title: string;
  subtitle: string;
  href: string;
  done: boolean;
  kind: Kind;
  task?: string;
};

const VIEWS = ["month", "week", "day"] as const;
type View = (typeof VIEWS)[number];

const STEP_COLUMNS: Record<DealStage, [string, string]> = {
  viewing: ["viewing_on", "viewing_time"],
  offer: ["offer_on", "offer_time"],
  deposit: ["deposit_on", "deposit_time"],
  preliminary: ["preliminary_on", "preliminary_time"],
  notary: ["notary_on", "notary_time"],
};

// the colour of each kind: a task, a deal step, an open house
const DOT: Record<Kind, string> = { task: "bg-accent", deal: "bg-warning", openHouse: "bg-brand-cyan" };
const CHIP: Record<Kind, string> = {
  task: "bg-accent-soft text-accent-fg",
  deal: "bg-warning/10 text-warning",
  openHouse: "bg-brand-cyan/15 text-brand-cyan",
};

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

/** Monday of the week the day falls in. */
function mondayOf(day: string) {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

/** The first day of the month before / after. */
function shiftMonth(day: string, step: -1 | 1) {
  const [y, m] = day.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + step, 1));
  return d.toISOString().slice(0, 10);
}

const lastOfMonth = (day: string) => {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** The calendar: the month (days with something marked), a week, a day by the hour. */
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = await searchParams;
  const session = (await getSession())!;
  const today = sofiaToday();
  // an old link: ?week=
  const view: View = VIEWS.includes(params.view as View) ? (params.view as View) : isDay(params.week) ? "week" : "month";
  const date = isDay(params.date) ? params.date : isDay(params.week) ? params.week : today;
  // Managers can look at a colleague's calendar; everyone else sees their own.
  const person =
    session.isManager && typeof params.broker === "string" && params.broker !== "all" ? params.broker : session.userId;

  // the days on screen
  const monthStart = `${date.slice(0, 7)}-01`;
  const from = view === "month" ? mondayOf(monthStart) : view === "week" ? mondayOf(date) : date;
  const to = view === "month" ? addDays(mondayOf(lastOfMonth(date)), 6) : view === "week" ? addDays(mondayOf(date), 6) : date;

  const supabase = await createClient();
  const stepFilter = Object.values(STEP_COLUMNS)
    .map(([day]) => `and(${day}.gte.${from},${day}.lte.${to})`)
    .join(",");
  const [{ t, lang }, tasksRes, dealsRes, housesRes, tokenRes, members, requestHeaders] = await Promise.all([
    getI18n(),
    supabase
      .from("tasks")
      .select("id, title, type, status, due_date, due_time, client:clients(full_name)")
      .eq("assigned_to", person)
      .gte("due_date", from)
      .lte("due_date", to),
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
    supabase
      .from("open_houses")
      .select("id, day, starts_at, ends_at, property:properties(title)")
      .eq("host_id", person)
      .is("cancelled_at", null)
      .gte("day", from)
      .lte("day", to),
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
      kind: "task",
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
      if (!day || day < from || day > to) continue;
      entries.push({
        key: `deal-${deal.id}-${stage}`,
        day,
        time: (deal[timeColumn] as string | null)?.slice(0, 5) ?? null,
        title: `${labels[stage]}: ${property?.title ?? client?.full_name ?? t.deals.untitled}`,
        subtitle: property && client ? client.full_name : t.nav.deals,
        href: `/deals/${deal.id}`,
        done: deal.status === "won",
        kind: "deal",
      });
    }
  }
  for (const house of (housesRes.data ?? []) as unknown as { id: string; day: string; starts_at: string; ends_at: string; property: { title: string } | null }[]) {
    entries.push({
      key: `house-${house.id}`,
      day: house.day,
      time: house.starts_at.slice(0, 5),
      title: `${t.openHouses.title}: ${house.property?.title ?? ""}`,
      subtitle: `${house.starts_at.slice(0, 5)}–${house.ends_at.slice(0, 5)}`,
      href: `/open-houses/${house.id}`,
      done: false,
      kind: "openHouse",
    });
  }
  entries.sort((a, b) => (a.time ?? "00").localeCompare(b.time ?? "00") || a.title.localeCompare(b.title));
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);

  // ---- links: keep the view, the day and whose calendar
  const link = (next: { view?: View; date?: string }) => {
    const qs = new URLSearchParams();
    const v = next.view ?? view;
    const d = next.date ?? date;
    if (v !== "month") qs.set("view", v);
    if (d !== today) qs.set("date", d);
    if (person !== session.userId) qs.set("broker", person);
    const s = qs.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };
  const previous = view === "month" ? shiftMonth(date, -1) : addDays(date, view === "week" ? -7 : -1);
  const next = view === "month" ? shiftMonth(date, 1) : addDays(date, view === "week" ? 7 : 1);
  const showsToday = today >= from && today <= to && (view !== "month" || today.slice(0, 7) === date.slice(0, 7));

  const monthTitle = (() => {
    const s = new Intl.DateTimeFormat(locale(lang), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthStart}T12:00:00Z`));
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();
  const longDay = new Intl.DateTimeFormat(locale(lang), { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE });
  const weekdayName = new Intl.DateTimeFormat(locale(lang), { weekday: "long", timeZone: TIME_ZONE });
  const weekdayShort = new Intl.DateTimeFormat(locale(lang), { weekday: "short", timeZone: "UTC" });
  const title =
    view === "month" ? monthTitle : view === "week" ? `${formatDayMonth(from, lang)} – ${formatDayMonth(to, lang)}` : longDay.format(new Date(`${date}T12:00:00Z`));

  const host = requestHeaders.get("host") ?? "brixa-yavlena.vercel.app";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const feedUrl = tokenRes.data ? `${protocol}://${host}/api/calendar/${tokenRes.data}.ics` : null;

  // one line in a list (the week and the day)
  const row = (entry: Entry, showTime = true) => (
    <li key={entry.key}>
      <Link href={entry.href} className="flex items-center gap-3 rounded-lg px-1 py-2 transition hover:bg-raised">
        {showTime && (
          <span className="w-12 shrink-0 text-center text-xs font-semibold tabular-nums text-fg-2">
            {entry.time ?? <span className="font-normal text-subtle">{t.calendar.allDay}</span>}
          </span>
        )}
        <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${CHIP[entry.kind]}`}>
          {entry.kind === "task" ? (
            <TypeIcon type={entry.task!} className="size-3.5" />
          ) : entry.kind === "deal" ? (
            <Handshake className="size-3.5" />
          ) : (
            <DoorOpen className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${entry.done ? "text-muted line-through" : ""}`}>{entry.title}</span>
          {entry.subtitle && <span className="block truncate text-xs text-muted">{entry.subtitle}</span>}
        </span>
      </Link>
    </li>
  );

  // the day's hours: 8:00–20:00, stretched to fit what's planned
  const dayEntries = byDay.get(date) ?? [];
  const timed = dayEntries.filter((e) => e.time);
  const untimed = dayEntries.filter((e) => !e.time);
  const hours = (() => {
    const hs = timed.map((e) => Number(e.time!.slice(0, 2)));
    const first = Math.min(8, ...hs);
    const last = Math.max(20, ...hs);
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  })();
  const nowHour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: TIME_ZONE }).format(new Date())
  );

  const tab = (active: boolean) => `rounded-md px-3 py-1.5 text-sm font-medium transition ${active ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`;

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
              allowAll={false}
            />
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {/* ---- the view, and moving through time ---- */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <nav className="inline-flex rounded-lg border border-line bg-surface p-0.5">
              {VIEWS.map((v) => (
                <Link key={v} href={link({ view: v })} className={tab(view === v)} aria-current={view === v ? "page" : undefined}>
                  {t.calendar.views[v]}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1.5">
              {!showsToday && (
                <Link href={link({ date: today })} className={`${buttonClass.ghost} px-3!`}>
                  {t.home.todayLabel}
                </Link>
              )}
              <Link href={link({ date: previous })} aria-label={t.calendar.previous} className={`${buttonClass.secondary} px-2.5!`}>
                <ChevronLeft className="size-4" />
              </Link>
              <Link href={link({ date: next })} aria-label={t.calendar.next} className={`${buttonClass.secondary} px-2.5!`}>
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
          <h2 className="mb-3 text-lg font-bold capitalize tracking-tight">{title}</h2>

          {/* ---- the month: every day, marked when something is on ---- */}
          {view === "month" && (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
              <div className="grid grid-cols-7 border-b border-line bg-raised/50 text-center text-[11px] font-semibold uppercase tracking-wide text-subtle">
                {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
                  <span key={d} className="py-2">
                    {weekdayShort.format(new Date(`${d}T12:00:00Z`))}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 }, (_, i) => addDays(from, i)).map((d, i) => {
                  const list = byDay.get(d) ?? [];
                  const inMonth = d.slice(0, 7) === date.slice(0, 7);
                  const isToday = d === today;
                  const kinds = [...new Set(list.map((e) => e.kind))];
                  return (
                    <Link
                      key={d}
                      href={link({ view: "day", date: d })}
                      className={`group relative flex min-h-16 flex-col gap-1 border-line-soft p-1.5 transition hover:bg-raised sm:min-h-28 sm:p-2 ${
                        i % 7 !== 6 ? "border-r" : ""
                      } ${i >= 7 ? "border-t" : ""} ${inMonth ? "" : "bg-canvas/40"}`}
                    >
                      <span
                        className={`grid size-7 place-items-center rounded-full text-xs font-semibold tabular-nums ${
                          isToday ? "bg-accent text-on-accent" : inMonth ? "text-fg" : "text-faint"
                        }`}
                      >
                        {Number(d.slice(8))}
                      </span>
                      {list.length > 0 && (
                        <>
                          {/* on the phone: a dot per kind, and how many */}
                          <span className="flex items-center gap-1 sm:hidden">
                            {kinds.map((k) => (
                              <span key={k} className={`size-1.5 rounded-full ${DOT[k]}`} />
                            ))}
                            {list.length > 1 && <span className="text-[10px] font-semibold text-muted">{list.length}</span>}
                          </span>
                          {/* on a computer: the first few, with their time */}
                          <ul className="hidden space-y-0.5 sm:block">
                            {list.slice(0, 3).map((e) => (
                              <li key={e.key} className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] ${CHIP[e.kind]} ${e.done ? "line-through opacity-60" : ""}`}>
                                {e.time && <span className="shrink-0 font-semibold tabular-nums">{e.time}</span>}
                                <span className="truncate">{e.title}</span>
                              </li>
                            ))}
                            {list.length > 3 && <li className="px-1 text-[11px] font-medium text-muted">{fmt(t.calendar.more, { n: list.length - 3 })}</li>}
                          </ul>
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
              <p className="flex flex-wrap gap-4 border-t border-line px-3 py-2 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${DOT.task}`} />
                  {t.nav.tasks}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${DOT.deal}`} />
                  {t.nav.deals}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${DOT.openHouse}`} />
                  {t.openHouses.title}
                </span>
              </p>
            </div>
          )}

          {/* ---- the week: day by day ---- */}
          {view === "week" && (
            <ol className="space-y-3">
              {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => {
                const list = byDay.get(d) ?? [];
                const isToday = d === today;
                return (
                  <li key={d} className={`rounded-2xl border bg-surface p-3 shadow-xs sm:p-4 ${isToday ? "border-accent/50" : "border-line"}`}>
                    <Link href={link({ view: "day", date: d })} className="mb-1 flex items-baseline gap-2 px-1 text-sm hover:text-accent-fg">
                      <span className={`font-semibold capitalize ${isToday ? "text-accent-fg" : ""}`}>{weekdayName.format(new Date(`${d}T12:00:00Z`))}</span>
                      <span className="text-muted">{formatDayMonth(d, lang)}</span>
                      {isToday && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-fg">{t.home.todayLabel}</span>}
                    </Link>
                    {list.length === 0 ? (
                      <p className="px-1 py-1.5 text-xs text-faint">{t.calendar.nothing}</p>
                    ) : (
                      <ul>{list.map((e) => row(e))}</ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {/* ---- the day: hour by hour ---- */}
          {view === "day" && (
            <div className="rounded-2xl border border-line bg-surface p-3 shadow-xs sm:p-4">
              <div className="mb-2 flex justify-end">
                <Link
                  href={`/tasks/new?date=${date}${person !== session.userId ? `&assignee=${person}` : ""}`}
                  className={`${buttonClass.primary} px-3! py-1.5!`}
                >
                  <Plus className="size-4" />
                  {t.calendar.newTask}
                </Link>
              </div>
              {untimed.length > 0 && (
                <div className="mb-3 rounded-xl bg-raised/50 p-2">
                  <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{t.calendar.noTime}</p>
                  <ul>{untimed.map((e) => row(e, false))}</ul>
                </div>
              )}
              <ol>
                {hours.map((h) => {
                  const at = timed.filter((e) => Number(e.time!.slice(0, 2)) === h);
                  const current = date === today && h === nowHour;
                  return (
                    <li key={h} className={`flex gap-3 border-t border-line-soft py-1.5 first:border-t-0 ${current ? "bg-accent-soft/30" : ""}`}>
                      <span className={`w-12 shrink-0 pt-2 text-right text-xs tabular-nums ${current ? "font-bold text-accent-fg" : "text-subtle"}`}>
                        {`${String(h).padStart(2, "0")}:00`}
                      </span>
                      <ul className="min-h-8 min-w-0 flex-1">{at.map((e) => row(e))}</ul>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
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
