import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeCheck, CalendarClock, CalendarDays, CheckCircle2, Clock, Flame, ListChecks, PartyPopper, Plus, Quote, Target, UsersRound } from "lucide-react";
import { GameIntro } from "@/components/game/GameIntro";
import { MissionList, missionRows } from "@/components/game/Missions";
import { PlayerCard } from "@/components/game/PlayerCard";
import { GreetingsList } from "@/components/program/GreetingsCard";
import { Avatar } from "@/components/Avatar";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { Leaderboard } from "@/components/Leaderboard";
import { MorningBrief } from "@/components/brix/MorningBrief";
import { FirstSteps } from "@/components/home/FirstSteps";
import { TodayWindow } from "@/components/home/TodayWindow";
import { PushBanner } from "@/components/push/PushBanner";
import { TemperatureItem } from "@/components/signals/SignalRows";
import { TaskItem } from "@/components/task/TaskItem";
import { Card, buttonClass } from "@/components/ui/form";
import { addDays, sofiaToday, TIME_ZONE } from "@/lib/dates";
import { getCalendarEntries, monthRange } from "@/lib/calendar";
import { formatDayMonth, formatPrice } from "@/lib/format";
import { fmt, locale } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMyPeople } from "@/lib/lookups";
import { quoteOfTheDay } from "@/lib/quotes";
import { getSession } from "@/lib/session";
import { DEFAULT_POINTS, getAgency } from "@/lib/agency";
import { getMissions, getPlanInputs, getPlayers } from "@/lib/game-server";
import { getFirstSteps } from "@/lib/first-steps";
import { getGreetings } from "@/lib/greetings-server";
import { countTemperatures, getTemperatures } from "@/lib/signals-server";
import { getLeaderboards, getMyNumbers, getStaleDeals, getUpcomingSteps } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { getMyDay, getTeamDay } from "@/lib/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.home };
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  // the morning notification opens the day in a window
  const showDay = (await searchParams).today === "1";
  const session = (await getSession())!;
  const today = sofiaToday();
  const supabase = await createClient();

  const [{ t, lang }, day, team, members, numbers, boards, { count: toConfirm }, upcoming, players, planInputs] = await Promise.all([
    getI18n(),
    getMyDay(session.userId, today),
    session.isManager ? getTeamDay(session.organizationId, today) : Promise.resolve(null),
    session.isManager ? getMyPeople(supabase) : Promise.resolve([]),
    getMyNumbers(session, today),
    getLeaderboards(session.organizationId),
    session.isManager
      ? supabase
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", session.organizationId)
          .eq("status", "won")
          .is("confirmed_at", null)
      : Promise.resolve({ count: 0 }),
    getUpcomingSteps(session, today),
    getPlayers(session.organizationId, today),
    getPlanInputs(session, today),
  ]);
  // the game: my level and streak, today's and this week's missions
  const me = players.get(session.userId);
  const month = monthRange(today);
  const [missionData, greetings, stale, monthDays, hotClients, coolingCount] = await Promise.all([
    getMissions(session, today, planInputs, me?.streak.today ?? 0),
    getGreetings(session, today, t),
    session.isManager && !session.solo ? getStaleDeals(session, today) : Promise.resolve([]),
    getCalendarEntries(supabase, session.userId, month.from, month.to, t),
    // how my clients behave: the hottest, and how many are cooling down
    getTemperatures(supabase, session.organizationId, { broker: session.userId, temperatures: ["hot"], limit: 5 }),
    countTemperatures(supabase, session.organizationId, session.userId, ["cooling", "cold"]),
  ]);
  const agency = await getAgency(session.organizationId);
  const firstSteps = await getFirstSteps(session, Boolean(agency?.logoPath));
  // Brix's plan (written on the first visit of the day, when the AI key is set)
  const brixReady = Boolean(process.env.ANTHROPIC_API_KEY);
  const { data: brief } = brixReady
    ? await supabase.from("brix_briefs").select("content").eq("profile_id", session.userId).eq("day", today).maybeSingle()
    : { data: null };
  const euro = (value: number) => formatPrice(value, "EUR", lang) ?? "0";
  const { goals } = numbers;
  const missions = [
    {
      label: t.home.missionMonth,
      done: numbers.monthCommission,
      target: goals.monthlyTarget,
      bonus: goals.monthlyBonus,
    },
    {
      label: t.home.missionYear,
      done: numbers.ytdCommission,
      target: goals.yearlyTarget,
      bonus: goals.yearlyBonus,
    },
  ];

  const firstName = (session.fullName || session.email).split(/[\s@]+/)[0];
  const quote = quoteOfTheDay(lang);
  const monthTitle = (() => {
    const s = new Intl.DateTimeFormat(locale(lang), { month: "long", year: "numeric", timeZone: TIME_ZONE }).format(new Date());
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();
  const dateLabel = new Intl.DateTimeFormat(locale(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  }).format(new Date());

  const total = day.open.length + day.doneToday.length;
  const done = day.doneToday.length;
  const missionList = missionRows(missionData, { done, total }, t);

  const stepsToday = upcoming.filter((step) => step.day === today);
  const heading = "mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-subtle";

  return (
    <div className="space-y-6">
      {showDay && (
        <TodayWindow title={t.home.dayTitle} subtitle={dateLabel} closeLabel={t.home.dayClose} allLabel={t.home.viewAll}>
          {/* today's tasks, in the same order as on the Tasks page */}
          <section>
            <h3 className={heading}>
              <ListChecks className="size-4 text-brand-cyan" />
              {`${t.home.dayTasks} · ${day.open.length}`}
            </h3>
            {day.open.length === 0 ? (
              <p className="flex items-center gap-2 py-3 text-sm text-muted">
                <CheckCircle2 className="size-5 text-success" />
                {total > 0 ? t.home.allDone : t.home.noTasks}
              </p>
            ) : (
              <ul className="-mx-3">
                {day.open.map((task) => (
                  <TaskItem key={task.id} task={task} today={today} viewerId={session.userId} t={t} />
                ))}
              </ul>
            )}
            {day.doneToday.length > 0 && (
              <>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-subtle">{t.home.doneToday}</p>
                <ul className="-mx-3">
                  {day.doneToday.map((task) => (
                    <TaskItem key={task.id} task={task} today={today} viewerId={session.userId} t={t} />
                  ))}
                </ul>
              </>
            )}
          </section>

          {stepsToday.length > 0 && (
            <section>
              <h3 className={heading}>
                <CalendarClock className="size-4 text-brand-cyan" />
                {`${t.home.dayDeals} · ${stepsToday.length}`}
              </h3>
              <ul className="-mx-3">
                {stepsToday.map((step) => {
                  const stages = step.kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
                  return (
                    <li key={`${step.dealId}-${step.stage}`}>
                      <Link href={`/deals/${step.dealId}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-raised">
                        <span className="w-12 shrink-0 text-xs font-bold text-warning">{step.time ?? t.home.todayLabel}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{stages[step.stage]}</span>
                          <span className="block truncate text-xs text-muted">
                            {step.title}
                            {step.brokerName ? ` · ${step.brokerName}` : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {greetings.length > 0 && (
            <section>
              <h3 className={heading}>
                <PartyPopper className="size-4 text-brand-cyan" />
                {`${t.programs.greetingsTitle} · ${greetings.length}`}
              </h3>
              <div className="pt-1">
                <GreetingsList greetings={greetings} t={t} />
              </div>
            </section>
          )}

          {/* the missions: today's and this week's */}
          <section>
            <h3 className={heading}>
              <Target className="size-4 text-brand-cyan" />
              {t.game.missionsTitle}
            </h3>
            <div className="pt-1">
              <div className="space-y-5">
                <MissionList title={t.game.missionsToday} rows={missionList.today} t={t} />
                <MissionList title={t.game.missionsWeek} rows={missionList.week} t={t} />
              </div>
            </div>
          </section>
        </TodayWindow>
      )}

      {/* ---- greeting + thought for the day ---- */}
      <section>
        <p className="text-sm font-medium capitalize text-muted">{dateLabel}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          {fmt(t.home.hello, { name: firstName })} <span aria-hidden>👋</span>
        </h1>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <figure className="flex gap-3 rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur sm:p-5">
            <Quote className="size-5 shrink-0 text-accent-fg" />
            <div>
              <blockquote className="text-[15px] leading-relaxed text-fg-2 italic">{quote.text}</blockquote>
              <figcaption className="mt-1.5 text-xs font-medium text-subtle">{quote.author ? `— ${quote.author}` : t.home.quoteLabel}</figcaption>
            </div>
          </figure>

          {/* ---- what my hour is worth (the details are in My business) ---- */}
          <Link
            href="/business"
            className="block rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur transition hover:border-accent/50 sm:p-5"
          >
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-subtle">
              <Clock className="size-3.5 text-brand-cyan" />
              {t.home.hourTitle}
            </p>
            {numbers.hourValue === null ? (
              <p className="mt-2 text-sm text-muted">{t.home.hourNoData}</p>
            ) : (
              <>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-accent-fg">{fmt(t.home.hourValue, { amount: euro(numbers.hourValue) })}</p>
                <p className="mt-1.5 text-sm font-medium text-danger">{fmt(t.home.hourLoss, { amount: euro(numbers.hourValue) })}</p>
              </>
            )}
            {numbers.needPerHour !== null && (
              <p className="mt-1.5 text-xs text-fg-2">
                {numbers.needPerHour === 0 ? t.home.hourTargetDone : fmt(t.home.hourNeed, { amount: euro(numbers.needPerHour) })}
              </p>
            )}
          </Link>
        </div>
      </section>

      {firstSteps && <FirstSteps userId={session.userId} steps={firstSteps} />}
      {!showDay && <GameIntro userId={session.userId} level={me?.level.index ?? 0} />}
      <PushBanner />

      {/* ---- today: what to do now ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-0! sm:p-0!">
          <header className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <ListChecks className="size-4 text-brand-cyan" />
              {t.home.todayTitle}
              {day.open.length > 0 && <span className="text-sm font-normal text-muted">· {day.open.length}</span>}
            </h2>
            <Link href="/tasks/new" className={`${buttonClass.primary} px-3! py-1.5!`}>
              <Plus className="size-4" />
              {t.home.addTask}
            </Link>
          </header>

          <div className="px-2 pb-3 pt-2 sm:px-3">
            {day.open.length === 0 ? (
              <p className="flex items-center gap-2 px-3 py-5 text-sm text-muted">
                <CheckCircle2 className="size-5 text-success" />
                {total > 0 ? t.home.allDone : t.home.noTasks}
              </p>
            ) : (
              <ul>
                {day.open.map((task) => (
                  <TaskItem key={task.id} task={task} today={today} viewerId={session.userId} t={t} />
                ))}
              </ul>
            )}

            {/* the deal steps planned for today */}
            {stepsToday.length > 0 && (
              <>
                <p className="mt-2 flex items-center gap-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-subtle">
                  <CalendarClock className="size-3.5" />
                  {t.home.dayDeals}
                </p>
                <ul>
                  {stepsToday.map((step) => {
                    const stages = step.kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
                    return (
                      <li key={`${step.dealId}-${step.stage}`}>
                        <Link href={`/deals/${step.dealId}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-raised">
                          <span className="w-12 shrink-0 text-xs font-bold text-warning">{step.time ?? t.home.todayLabel}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{stages[step.stage]}</span>
                            <span className="block truncate text-xs text-muted">
                              {step.title}
                              {step.brokerName ? ` · ${step.brokerName}` : ""}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {day.doneToday.length > 0 && (
              <>
                <p className="mt-2 px-3 text-xs font-semibold uppercase tracking-wide text-subtle">{t.home.doneToday}</p>
                <ul>
                  {day.doneToday.map((task) => (
                    <TaskItem key={task.id} task={task} today={today} viewerId={session.userId} t={t} />
                  ))}
                </ul>
              </>
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-line-soft px-5 py-3 text-sm sm:px-6">
            <span className="text-muted">{fmt(t.home.upcoming, { count: day.upcomingCount })}</span>
            <Link href="/tasks" className="inline-flex items-center gap-1 font-medium text-accent-fg hover:underline">
              {t.home.viewAll}
              <ArrowRight className="size-3.5" />
            </Link>
          </footer>
        </Card>

        <div className="space-y-6">
          {/* the level: where I am in the game */}
          {me && <PlayerCard player={me} t={t} lang={lang} href="/plan" />}

          {/* 🔥 the clients to call first */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <Flame className="size-4 text-danger" />
                {t.signals.homeTitle}
                {hotClients.length > 0 && <span className="text-sm font-normal text-muted">· {hotClients.length}</span>}
              </span>
            }
            className="p-4! sm:p-5!"
          >
            {hotClients.length === 0 ? (
              <p className="text-sm text-muted">{t.signals.homeNone}</p>
            ) : (
              <ul className="-my-3 divide-y divide-line-soft">
                {hotClients.map((row) => (
                  <TemperatureItem key={row.client.id} row={row} t={t} lang={lang} reasons={1} />
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line-soft pt-3 text-sm">
              {coolingCount > 0 ? (
                <Link href="/follow-up?view=signals" className="font-medium text-sky-500 hover:underline">
                  🧊 {fmt(t.signals.homeCooling, { count: coolingCount })}
                </Link>
              ) : (
                <span />
              )}
              <Link href="/follow-up?view=signals" className="inline-flex items-center gap-1 font-medium text-accent-fg hover:underline">
                {t.signals.viewAll}
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {greetings.length > 0 && (
        <Card
          title={
            <span className="flex items-center gap-2">
              <PartyPopper className="size-4 text-brand-cyan" />
              {t.programs.greetingsTitle}
            </span>
          }
          description={t.programs.greetingsHint}
        >
          <GreetingsList greetings={greetings} t={t} />
        </Card>
      )}

      {brixReady && <MorningBrief initial={brief?.content ?? null} />}

      {/* ---- the game: today's and this week's missions, and the ranking with the targets ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div>
          <Card
            title={
              <span className="flex items-center gap-2">
                <Target className="size-4 text-brand-cyan" />
                {t.game.missionsTitle}
              </span>
            }
            className="p-4! sm:p-5!"
          >
            <div className="space-y-5">
              <MissionList title={t.game.missionsToday} rows={missionList.today} t={t} />
              <MissionList title={t.game.missionsWeek} rows={missionList.week} t={t} />
            </div>
          </Card>
        </div>
        <Leaderboard
          month={boards.month}
          year={boards.year}
          groups={boards.groups}
          viewerId={session.userId}
          missions={missions}
          points={agency?.points ?? DEFAULT_POINTS}
          players={Object.fromEntries(
            [...players.values()].map((p) => [p.profileId, { level: p.level.index, streak: p.streak.current }])
          )}
          records={
            session.solo && me
              ? [
                  { label: t.home.recordDeals, value: String(me.stats.deals) },
                  { label: t.home.recordCommission, value: euro(me.stats.commission) },
                  { label: t.home.recordStreak, value: fmt(t.game.streakDays, { n: me.streak.best }) },
                  { label: t.home.recordLevel, value: t.game.levels[me.level.index] },
                ]
              : null
          }
        />
      </div>

      {/* ---- what's coming on the deals ---- */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <CalendarClock className="size-4 text-brand-cyan" />
            {t.home.upcomingDeals}
          </span>
        }
      >
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">{t.home.upcomingNone}</p>
        ) : (
          <ul className="-mx-2 grid gap-x-6 gap-y-0.5 lg:grid-cols-2">
            {upcoming.slice(0, 8).map((step) => {
              const soon = step.day === today ? t.home.todayLabel : step.day === addDays(today, 1) ? t.home.tomorrowLabel : null;
              const stages = step.kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
              return (
                <li key={`${step.dealId}-${step.stage}`}>
                  <Link href={`/deals/${step.dealId}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-raised">
                    <span className={`w-16 shrink-0 text-center text-xs font-bold ${soon ? "text-warning" : "text-muted"}`}>
                      {soon ?? formatDayMonth(step.day, lang)}
                      {step.time && <span className="block font-medium text-fg-2">{step.time}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{stages[step.stage]}</span>
                      <span className="block truncate text-xs text-muted">
                        {step.title}
                        {step.brokerName ? ` · ${step.brokerName}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ---- managers: the team, together ---- */}
      {team && !session.solo && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <UsersRound className="size-5 text-brand-cyan" />
            {t.home.teamSection}
          </h2>

          {(toConfirm ?? 0) > 0 && (
            <Link
              href="/deals?tab=confirm"
              className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm font-semibold text-warning transition hover:bg-warning/15"
            >
              <BadgeCheck className="size-5 shrink-0" />
              <span className="flex-1">{fmt(t.home.toConfirm, { count: toConfirm ?? 0 })}</span>
              <ArrowRight className="size-4" />
            </Link>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={t.home.teamToday}>
              <ul className="space-y-4">
                {members.map((member) => {
                  const stats = team.get(member.profile_id) ?? { open: 0, done: 0, overdue: 0 };
                  const memberTotal = stats.open + stats.done;
                  const memberPercent = memberTotal === 0 ? 0 : Math.round((stats.done / memberTotal) * 100);
                  const name = member.full_name || member.email;
                  return (
                    <li key={member.profile_id}>
                      <Link href={`/tasks?broker=${member.profile_id}`} className="group flex items-center gap-3">
                        <Avatar path={member.avatar_path} name={name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate font-medium group-hover:text-accent-fg">{name}</span>
                            <span className="shrink-0 text-xs text-muted">
                              {memberTotal === 0 ? (
                                "—"
                              ) : (
                                <>
                                  {stats.done}/{memberTotal}{" "}
                                  <span className={`font-bold ${memberPercent === 100 ? "text-success" : memberPercent < 50 ? "text-warning" : "text-fg-2"}`}>
                                    {memberPercent}%
                                  </span>
                                </>
                              )}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                            <div className="h-full rounded-full bg-gradient-to-r from-accent to-brand-cyan" style={{ width: `${memberPercent}%` }} />
                          </div>
                          {stats.overdue > 0 && (
                            <p className="mt-1 text-[11px] font-semibold text-danger">{fmt(t.home.teamOverdue, { count: stats.overdue })}</p>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card
              title={
                <span className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warning" />
                  {t.stats.staleTitle}
                </span>
              }
              description={t.stats.staleHint}
            >
              {stale.length === 0 ? (
                <p className="text-sm text-muted">{t.stats.noStale}</p>
              ) : (
                <ul className="-mx-2 space-y-0.5">
                  {stale.map((d) => {
                    const labels = d.kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
                    return (
                      <li key={d.id}>
                        <Link href={`/deals/${d.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-raised">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{d.title}</span>
                            {d.broker && <span className="block truncate text-xs text-muted">{d.broker}</span>}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-warning">
                            {fmt(t.stats.staleDays, { days: d.days, stage: labels[d.stage as keyof typeof labels] ?? d.stage })}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </section>
      )}

      {/* ---- this month: every day with something on is marked ---- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <CalendarDays className="size-5 text-brand-cyan" />
            {monthTitle}
          </h2>
          <Link href="/calendar" className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">
            {t.home.openCalendar}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <MonthGrid
          from={month.from}
          to={month.to}
          month={today}
          today={today}
          byDay={monthDays}
          dayHref={(d) => (d === today ? "/calendar?view=day" : `/calendar?view=day&date=${d}`)}
          t={t}
          lang={lang}
        />
      </section>
    </div>
  );
}
