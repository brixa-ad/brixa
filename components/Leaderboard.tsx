"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/components/I18nProvider";
import { formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import type { BoardRow } from "@/lib/stats";

const MEDALS = ["bg-[#f5c542] text-[#3b2a00]", "bg-[#c9d1dc] text-[#1f2937]", "bg-[#d99a5b] text-[#3a1d00]"];

/** Top 10 of the agency: commission or activity points, this month or this year. */
export function Leaderboard({ month, year, viewerId }: { month: BoardRow[]; year: BoardRow[]; viewerId: string }) {
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
            <span className={`truncate ${you ? "font-bold" : "font-medium"}`}>{row.name}</span>
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

      {board === "activity" && <p className="mt-4 text-[11px] leading-relaxed text-subtle">{t.home.pointsHelp}</p>}
    </section>
  );
}
