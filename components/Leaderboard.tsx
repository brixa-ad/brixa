"use client";

import { useState } from "react";
import { Flame, Gift, Trophy } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/components/I18nProvider";
import { formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import type { BoardRow } from "@/lib/stats";

const MEDALS = ["bg-[#f5c542] text-[#3b2a00]", "bg-[#c9d1dc] text-[#1f2937]", "bg-[#d99a5b] text-[#3a1d00]"];

export type Mission = { label: string; done: number; target: number; bonus: string | null };

/** Top 10 of the agency: commission or activity points, this month or this year — with my missions and rewards on top. */
export function Leaderboard({
  month,
  year,
  viewerId,
  missions,
  points,
  players = {},
}: {
  month: BoardRow[];
  year: BoardRow[];
  viewerId: string;
  missions: Mission[];
  /** the agency's point values, for the explanation under the activity ranking */
  points: Record<string, number>;
  /** everyone's level (0-based) and current streak */
  players?: Record<string, { level: number; streak: number }>;
}) {
  const { t, lang } = useI18n();
  const [board, setBoard] = useState<"money" | "activity">("money");
  const [period, setPeriod] = useState<"month" | "year">("month");

  const value = (row: BoardRow) => (board === "money" ? row.commission : row.points);
  const ranked = [...(period === "month" ? month : year)].sort((a, b) => value(b) - value(a));
  const top = ranked.slice(0, 10);
  const leader = Math.max(0, ...ranked.map(value));
  const myRank = ranked.findIndex((row) => row.profileId === viewerId);

  const toggle = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-semibold transition ${active ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`;

  const line = (row: BoardRow, rank: number) => {
    const you = row.profileId === viewerId;
    const percent = leader > 0 ? Math.max(2, (value(row) / leader) * 100) : 0;
    return (
      <li key={row.profileId} className={`flex items-center gap-3 rounded-xl px-2 py-2 ${you ? "bg-accent-soft/60" : ""}`}>
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
            rank < 3 && value(row) > 0 ? MEDALS[rank] : "text-subtle"
          }`}
        >
          {rank + 1}
        </span>
        <Avatar path={row.avatarPath} name={row.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              {players[row.profileId] && (
                <span
                  title={t.game.levels[players[row.profileId].level]}
                  className="grid size-4.5 shrink-0 place-items-center rounded-md bg-gradient-to-br from-accent to-brand-cyan text-[10px] font-black text-white"
                >
                  {players[row.profileId].level + 1}
                </span>
              )}
              <span className={`truncate ${you ? "font-bold" : "font-medium"}`}>{row.name}</span>
              {(players[row.profileId]?.streak ?? 0) >= 2 && (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-warning">
                  <Flame className="size-3" />
                  {players[row.profileId].streak}
                </span>
              )}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {board === "money"
                ? formatPrice(row.commission, "EUR", lang)
                : fmt(t.home.boardPoints, { points: row.points })}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-brand-cyan transition-[width] duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </li>
    );
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6" id="leaderboard">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Trophy className="size-4 text-brand-cyan" />
          {t.home.boardTitle}
        </h2>
        <div className="flex gap-2">
          <div className="inline-flex rounded-lg border border-line bg-canvas/40 p-0.5">
            <button type="button" onClick={() => setBoard("money")} className={toggle(board === "money")} aria-pressed={board === "money"}>
              {t.home.boardMoney}
            </button>
            <button
              type="button"
              onClick={() => setBoard("activity")}
              className={toggle(board === "activity")}
              aria-pressed={board === "activity"}
            >
              {t.home.boardActivity}
            </button>
          </div>
          <div className="inline-flex rounded-lg border border-line bg-canvas/40 p-0.5">
            <button type="button" onClick={() => setPeriod("month")} className={toggle(period === "month")} aria-pressed={period === "month"}>
              {t.home.boardMonth}
            </button>
            <button type="button" onClick={() => setPeriod("year")} className={toggle(period === "year")} aria-pressed={period === "year"}>
              {t.home.boardYear}
            </button>
          </div>
        </div>
      </header>

      {missions.some((m) => m.target > 0 || m.bonus) && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          {missions
            .filter((m) => m.target > 0 || m.bonus)
            .map((mission) => {
              const percent = mission.target > 0 ? Math.min(100, (mission.done / mission.target) * 100) : null;
              const done = percent !== null && percent >= 100;
              return (
                <div
                  key={mission.label}
                  className={`rounded-xl border p-3.5 ${done ? "border-success/40 bg-success/10" : "border-line bg-canvas/40"}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{mission.label}</p>
                    {percent !== null && (
                      <span className={`text-xs font-bold ${done ? "text-success" : "text-accent-fg"}`}>
                        {done ? t.home.missionDone : `${Math.round(percent)}%`}
                      </span>
                    )}
                  </div>
                  {mission.target > 0 && (
                    <>
                      <p className="mt-1 text-sm font-semibold tabular-nums">
                        {formatPrice(mission.done, "EUR", lang)}
                        <span className="ml-1 text-xs font-medium text-muted">
                          {fmt(t.home.targetOf, { target: formatPrice(mission.target, "EUR", lang) ?? "" })}
                        </span>
                      </p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                        <div
                          className={`h-full rounded-full ${done ? "bg-success" : "bg-gradient-to-r from-accent to-brand-cyan"}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </>
                  )}
                  {mission.bonus && (
                    <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-brand-cyan">
                      <Gift className="size-4 shrink-0" />
                      <span className="min-w-0">{fmt(t.home.reward, { bonus: mission.bonus })}</span>
                    </p>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {leader === 0 ? (
        <p className="py-4 text-sm text-muted">{t.home.boardEmpty}</p>
      ) : (
        <ol className="space-y-0.5">
          {top.map((row, index) => line(row, index))}
          {myRank >= 10 && (
            <>
              <li aria-hidden className="px-4 text-subtle">
                ⋮
              </li>
              {line(ranked[myRank], myRank)}
            </>
          )}
        </ol>
      )}

      {board === "activity" && <p className="mt-4 text-[11px] leading-relaxed text-subtle">{fmt(t.home.pointsHelp, points)}</p>}
    </section>
  );
}
