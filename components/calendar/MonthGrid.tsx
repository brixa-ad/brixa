import Link from "next/link";
import { addDays } from "@/lib/dates";
import type { CalendarEntry, CalendarKind } from "@/lib/calendar";
import { fmt, locale, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";

// the colour of each kind: a task, a deal step, an open house
export const DOT: Record<CalendarKind, string> = { task: "bg-accent", deal: "bg-warning", openHouse: "bg-brand-cyan" };
export const CHIP: Record<CalendarKind, string> = {
  task: "bg-accent-soft text-accent-fg",
  deal: "bg-warning/10 text-warning",
  openHouse: "bg-brand-cyan/15 text-brand-cyan",
};

/**
 * The month: every day from the Monday before the 1st to the Sunday after the last day, marked when
 * something is on (a dot per kind on the phone, the first few with their time on a computer).
 */
export function MonthGrid({
  from,
  to,
  month,
  today,
  byDay,
  dayHref,
  t,
  lang,
}: {
  from: string;
  to: string;
  /** any day in the month shown */
  month: string;
  today: string;
  byDay: Map<string, CalendarEntry[]>;
  dayHref: (day: string) => string;
  t: Dictionary;
  lang: Lang;
}) {
  const weekdayShort = new Intl.DateTimeFormat(locale(lang), { weekday: "short", timeZone: "UTC" });
  const days = Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 }, (_, i) => addDays(from, i));

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
      <div className="grid grid-cols-7 border-b border-line bg-raised/50 text-center text-[11px] font-semibold uppercase tracking-wide text-subtle">
        {days.slice(0, 7).map((d) => (
          <span key={d} className="py-2">
            {weekdayShort.format(new Date(`${d}T12:00:00Z`))}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const list = byDay.get(d) ?? [];
          const inMonth = d.slice(0, 7) === month.slice(0, 7);
          const isToday = d === today;
          const kinds = [...new Set(list.map((e) => e.kind))];
          return (
            <Link
              key={d}
              href={dayHref(d)}
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
  );
}
