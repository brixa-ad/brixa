import type { Metadata } from "next";
import { Flame, Medal, Quote, Target } from "lucide-react";
import { BadgeGrid } from "@/components/game/BadgeGrid";
import { MissionList, missionRows } from "@/components/game/Missions";
import { PlanSimulator } from "@/components/game/PlanSimulator";
import { PlayerCard } from "@/components/game/PlayerCard";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/form";
import { sofiaToday } from "@/lib/dates";
import { STREAK_POINTS, levelFor } from "@/lib/game";
import { getMissions, getPlanInputs, getPlayers, type Player } from "@/lib/game-server";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { getMyDay } from "@/lib/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.game.title };
}

/** The player's page: level and streak, today's and this week's missions, the business plan, the badges. */
export default async function PlanPage() {
  const session = (await getSession())!;
  const today = sofiaToday();
  const [{ t, lang }, players, inputs, day] = await Promise.all([
    getI18n(),
    getPlayers(session.organizationId, today),
    getPlanInputs(session, today),
    getMyDay(session.userId, today),
  ]);
  const me: Player = players.get(session.userId) ?? {
    profileId: session.userId,
    name: session.fullName || session.email,
    avatarPath: session.avatarPath,
    level: levelFor(0),
    streak: { current: 0, best: 0, today: 0 },
    stats: { deals: 0, commission: 0, listings: 0, exclusives: 0, viewings: 0, calls: 0, clients: 0, streak: 0 },
    badges: 0,
  };
  const missions = await getMissions(session, today, inputs, me.streak.today);
  const rows = missionRows(missions, { done: day.doneToday.length, total: day.open.length + day.doneToday.length }, t);
  const managerSet = inputs.managerDaily.calls + inputs.managerDaily.viewings + inputs.managerDaily.listings > 0;

  return (
    <>
      <PageHeader title={t.game.title} subtitle={t.game.subtitle} />

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-4">
            <PlayerCard player={me} t={t} lang={lang} />
            {inputs.bigWhy && (
              <figure className="flex gap-3 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
                <Quote className="size-5 shrink-0 text-accent-fg" />
                <div>
                  <figcaption className="text-xs font-semibold uppercase tracking-wide text-subtle">{t.game.why}</figcaption>
                  <blockquote className="mt-1 text-[15px] font-medium leading-relaxed">{inputs.bigWhy}</blockquote>
                </div>
              </figure>
            )}
          </div>

          <Card
            title={
              <span className="flex items-center gap-2">
                <Target className="size-4 text-brand-cyan" />
                {t.game.missionsTitle}
              </span>
            }
            description={managerSet ? t.game.managerMissions : undefined}
          >
            <div className="space-y-5">
              <MissionList title={t.game.missionsToday} rows={rows.today} t={t} />
              <MissionList title={t.game.missionsWeek} rows={rows.week} t={t} />
            </div>
            <p className="mt-5 flex items-start gap-2 border-t border-line-soft pt-4 text-xs text-muted">
              <Flame className="size-4 shrink-0 text-warning" />
              {fmt(t.game.streakHint, { points: STREAK_POINTS })}
            </p>
          </Card>
        </div>

        <PlanSimulator
          inputs={{
            goal: inputs.goal,
            managerTarget: inputs.managerTarget,
            bigWhy: inputs.bigWhy,
            earned: inputs.earned,
            rates: inputs.rates,
            workDaysLeft: inputs.workDaysLeft,
          }}
        />

        <Card
          title={
            <span className="flex items-center gap-2">
              <Medal className="size-4 text-brand-cyan" />
              {t.game.badges}
            </span>
          }
        >
          <BadgeGrid stats={me.stats} t={t} lang={lang} />
        </Card>
      </div>
    </>
  );
}
