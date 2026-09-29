import { CheckCircle2, Circle } from "lucide-react";
import { STREAK_POINTS } from "@/lib/game";
import type { Missions as MissionData } from "@/lib/game-server";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type Row = { label: string; done: number; target: number; note?: string };

/** Today's and this week's missions: the calls, the streak's points, the tasks; the viewings and the new listings. */
export function missionRows(m: MissionData, tasks: { done: number; total: number }, t: Dictionary) {
  const source = (s: "manager" | "plan" | "default") =>
    s === "manager" ? t.game.fromManager : s === "plan" ? t.game.fromPlan : t.game.fromDefault;
  const today: Row[] = [
    { label: t.game.missionCalls, done: m.calls.done, target: m.calls.target.value, note: source(m.calls.target.source) },
    { label: t.game.missionPoints, done: m.points.done, target: STREAK_POINTS },
    ...(tasks.total > 0 ? [{ label: t.game.missionTasks, done: tasks.done, target: tasks.total }] : []),
  ];
  const week: Row[] = [
    { label: t.game.missionViewings, done: m.viewings.done, target: m.viewings.target.value, note: source(m.viewings.target.source) },
    { label: t.game.missionListings, done: m.listings.done, target: m.listings.target.value, note: source(m.listings.target.source) },
  ];
  return { today, week };
}

export function MissionList({ title, rows, t }: { title: string; rows: Row[]; t: Dictionary }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</p>
      <ul className="space-y-2.5">
        {rows.map((row) => {
          const complete = row.target > 0 && row.done >= row.target;
          const Icon = complete ? CheckCircle2 : Circle;
          return (
            <li key={row.label}>
              <div className="flex items-center gap-2 text-sm">
                <Icon className={`size-4 shrink-0 ${complete ? "text-success" : "text-faint"}`} />
                <span className={`min-w-0 flex-1 truncate ${complete ? "text-muted" : "text-fg-2"}`}>
                  {row.label}
                  {row.note && <span className="ml-1.5 text-[11px] text-subtle">· {row.note}</span>}
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${complete ? "text-success" : ""}`}>
                  {complete ? t.game.missionDone : `${row.done} / ${row.target}`}
                </span>
              </div>
              <div className="ml-6 mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className={`h-full rounded-full ${complete ? "bg-success" : "bg-gradient-to-r from-accent to-brand-cyan"}`}
                  style={{ width: `${row.target > 0 ? Math.min(100, (row.done / row.target) * 100) : 0}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
