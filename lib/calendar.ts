import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/dates";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { dealStages, type DealKind, type DealStage } from "@/lib/options";

/** What's on a day in the calendar: a task, a deal step, an open house. */
export type CalendarKind = "task" | "deal" | "openHouse";
export type CalendarEntry = {
  key: string;
  day: string;
  time: string | null;
  title: string;
  subtitle: string;
  href: string;
  done: boolean;
  kind: CalendarKind;
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
export function mondayOf(day: string) {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

/** The first day of the month before / after. */
export function shiftMonth(day: string, step: -1 | 1) {
  const [y, m] = day.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + step, 1));
  return d.toISOString().slice(0, 10);
}

export const lastOfMonth = (day: string) => {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** The days a month is shown with: from the Monday before the 1st to the Sunday after the last day. */
export function monthRange(day: string) {
  return { from: mondayOf(`${day.slice(0, 7)}-01`), to: addDays(mondayOf(lastOfMonth(day)), 6) };
}

/** Everything one person has on between two days, by the time of day. */
export async function getCalendarEntries(supabase: SupabaseClient, person: string, from: string, to: string, t: Dictionary) {
  const stepFilter = Object.values(STEP_COLUMNS)
    .map(([day]) => `and(${day}.gte.${from},${day}.lte.${to})`)
    .join(",");
  const [tasksRes, dealsRes, housesRes] = await Promise.all([
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
  ]);

  const entries: CalendarEntry[] = [];
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
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  return byDay;
}
