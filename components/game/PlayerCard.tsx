import Link from "next/link";
import { ChevronRight, Flame, Medal } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { STREAK_POINTS } from "@/lib/game";
import type { Player } from "@/lib/game-server";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";

/** The level as a shield with its number. */
export function LevelShield({ index, size = "md" }: { index: number; size?: "sm" | "md" | "lg" }) {
  const box = size === "sm" ? "size-5 text-[10px]" : size === "lg" ? "size-16 text-2xl" : "size-11 text-lg";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-brand-cyan font-black text-white shadow-sm ${box} ${
        size === "sm" ? "rounded-md" : ""
      }`}
      aria-hidden
    >
      {index + 1}
    </span>
  );
}

/** Level, experience to the next level, the streak and the badges — the player at a glance. */
export function PlayerCard({ player, t, lang, href }: { player: Player; t: Dictionary; lang: Lang; href?: string }) {
  const { level, streak } = player;
  const title = t.game.levels[level.index];
  const next = level.to === null ? null : t.game.levels[level.index + 1];
  const todayDone = streak.today >= STREAK_POINTS;

  const body = (
    <>
      <div className="flex items-center gap-3.5">
        <LevelShield index={level.index} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{fmt(t.game.level, { n: level.index + 1 })}</p>
          <p className="truncate text-lg font-bold tracking-tight">{title}</p>
        </div>
        {href && <ChevronRight className="size-5 shrink-0 text-faint" />}
      </div>

      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-brand-cyan transition-[width] duration-700"
            style={{ width: `${Math.max(2, level.progress * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
          <span className="tabular-nums">{fmt(t.game.xp, { xp: formatNumber(level.xp, lang) ?? "0" })}</span>
          <span>
            {next === null
              ? t.game.maxLevel
              : fmt(t.game.xpToNext, { left: formatNumber(level.to! - level.xp, lang) ?? "0", next })}
          </span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className={`rounded-xl px-3 py-2 ${streak.current > 0 ? "bg-warning/10" : "bg-raised/60"}`}>
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Flame className={`size-4 ${streak.current > 0 ? "text-warning" : "text-faint"}`} />
            {streak.current > 0 ? fmt(t.game.streakDays, { n: streak.current }) : t.game.streakNone}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {todayDone
              ? t.game.streakTodayDone
              : fmt(t.game.streakToday, { points: streak.today, goal: STREAK_POINTS })}
            {streak.best > streak.current && ` · ${fmt(t.game.streakBest, { n: streak.best })}`}
          </p>
        </div>
        <div className="rounded-xl bg-raised/60 px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Medal className="size-4 text-brand-cyan" />
            {fmt(t.game.badgesCount, { n: player.badges })}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted">{t.game.badges}</p>
        </div>
      </div>
    </>
  );

  return href ? (
    <Link href={href} className="block rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:border-accent/50 sm:p-5">
      {body}
    </Link>
  ) : (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-xs sm:p-5">{body}</section>
  );
}
