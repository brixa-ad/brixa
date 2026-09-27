import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarCheck, CalendarClock, CheckCircle2, Clock, Plus, Quote } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Leaderboard } from "@/components/Leaderboard";
import { MorningBrief } from "@/components/brix/MorningBrief";
import { PushBanner } from "@/components/push/PushBanner";
import { ProgressRing } from "@/components/ProgressRing";
import { TaskItem } from "@/components/task/TaskItem";
import { Card, buttonClass } from "@/components/ui/form";
import { addDays, daysBetween, sofiaDay, sofiaToday, TIME_ZONE } from "@/lib/dates";
import { formatDayMonth, formatPrice } from "@/lib/format";
import { fmt, locale } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { quoteOfTheDay } from "@/lib/quotes";
import { getSession } from "@/lib/session";
import { DEFAULT_POINTS, getAgency } from "@/lib/agency";
import { getLeaderboards, getMyNumbers, getUpcomingSteps } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { getMyDay, getTeamDay } from "@/lib/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.home };
}

export default async function HomePage() {
  const session = (await getSession())!;
  const today = sofiaToday();
  const supabase = await createClient();

  const [{ t, lang }, day, team, members, numbers, boards, { count: toConfirm }, upcoming] = await Promise.all([
    getI18n(),
    getMyDay(session.userId, today),
    session.isManager ? getTeamDay(session.organizationId, today) : Promise.resolve(null),
    session.isManager ? getMembers(supabase, session.organizationId) : Promise.resolve([]),
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
  ]);
  // my follow-ups due by the end of today
  const { data: dueRows } = await supabase
    .from("clients")
    .select("follow_up_at")
    .eq("responsible_broker_id", session.userId)
    .not("follow_up_at", "is", null)
    .lt("follow_up_at", addDays(today, 2)); // a little past today; narrowed below
  const nowIso = new Date().toISOString();
  const agency = await getAgency(session.organizationId);
  // Brix's plan (written on the first visit of the day, when the AI key is set)
  const brixReady = Boolean(process.env.ANTHROPIC_API_KEY);
  const { data: brief } = brixReady
    ? await supabase.from("brix_briefs").select("content").eq("profile_id", session.userId).eq("day", today).maybeSingle()
    : { data: null };
  const followUpsLate = (dueRows ?? []).filter((r) => r.follow_up_at! <= nowIso).length;
  const followUpsToday = (dueRows ?? []).filter((r) => r.follow_up_at! > nowIso && sofiaDay(r.follow_up_at!) === today).length;
  const euro = (value: number) => formatPrice(value, "EUR", lang) ?? "0";
  const { goals } = numbers;
  const dailyGoals = [
    {
      label: t.home.goalCalls,
      done: numbers.today.calls,
      goal: goals.dailyCalls,
    },
    {
      label: t.home.goalViewings,
      done: numbers.today.viewings,
      goal: goals.dailyViewings,
    },
    {
      label: t.home.goalListings,
      done: numbers.today.listings,
      goal: goals.dailyListings,
    },
  ];
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
  const dateLabel = new Intl.DateTimeFormat(locale(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  }).format(new Date());

  const total = day.open.length + day.doneToday.length;
  const done = day.doneToday.length;
  const percent = total === 0 ? 100 : (done / total) * 100;
  const carried = day.open.filter((task) => daysBetween(task.due_date, today) > 0).length;

  return (
    <div className="space-y-6">
      {/* ---- greeting + thought for the day ---- */}
      <section>
        <p className="text-sm font-medium capitalize text-muted">{dateLabel}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          {fmt(t.home.hello, { name: firstName })} <span aria-hidden>👋</span>
        </h1>
        <figure className="mt-4 flex gap-3 rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur sm:p-5">
          <Quote className="size-5 shrink-0 text-accent-fg" />
          <div>
            <blockquote className="text-[15px] leading-relaxed text-fg-2 italic">{quote.text}</blockquote>
            <figcaption className="mt-1.5 text-xs font-medium text-subtle">
              {quote.author ? `— ${quote.author}` : t.home.quoteLabel}
            </figcaption>
          </div>
        </figure>
      </section>

      {brixReady && <MorningBrief initial={brief?.content ?? null} />}

      <PushBanner />

      {/* ---- managers: closings waiting for a yes ---- */}
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

      {/* ---- my year in numbers ---- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">{fmt(t.home.statsTitle, { year: today.slice(0, 4) })}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: t.home.statDeals,
              value: String(numbers.ytdDeals),
              href: "/deals?tab=won",
            },
            {
              label: t.home.statTurnover,
              value: euro(numbers.ytdTurnover),
              href: "/deals?tab=won",
              extra:
                numbers.pendingTurnover > 0
                  ? fmt(t.home.pendingAmount, {
                      amount: euro(numbers.pendingTurnover),
                    })
                  : null,
            },
            {
              label: t.home.statListings,
              value: String(numbers.activeListings),
              href: "/properties",
            },
            {
              label: t.home.statBuyers,
              value: String(numbers.activeBuyers),
              href: "/clients",
            },
          ].map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:border-accent/50"
            >
              <p className="text-xs font-medium text-muted">{stat.label}</p>
              <p className="mt-1 truncate text-2xl font-bold tracking-tight">{stat.value}</p>
              {stat.extra && <p className="mt-0.5 truncate text-[11px] font-medium text-warning">{stat.extra}</p>}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* ---- today's tasks ---- */}
          <Card className="p-0! sm:p-0!">
            <header className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
              <h2 className="text-base font-semibold">{t.home.todayTasks}</h2>
              <Link href="/tasks/new" className={`${buttonClass.primary} px-3! py-1.5!`}>
                <Plus className="size-4" />
                {t.home.addTask}
              </Link>
            </header>

            <div className="px-2 pb-3 pt-2 sm:px-3">
              {day.open.length === 0 ? (
                <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted">
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

              {day.doneToday.length > 0 && (
                <>
                  <p className="mt-2 px-3 text-xs font-semibold uppercase tracking-wide text-subtle">
                    {t.home.doneToday}
                  </p>
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

          <Leaderboard
            month={boards.month}
            year={boards.year}
            viewerId={session.userId}
            missions={missions}
            points={agency?.points ?? DEFAULT_POINTS}
          />
        </div>

        <div className="space-y-6">
          {/* ---- how far through the day ---- */}
          <Card title={t.home.progressTitle}>
            <div className="flex items-center gap-5">
              <ProgressRing value={percent} />
              <div className="space-y-1.5">
                <p className="text-lg font-semibold">{fmt(t.home.progressOf, { done, total })}</p>
                {carried > 0 && (
                  <p className="inline-flex rounded-md bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                    {fmt(t.home.carried, { count: carried })}
                  </p>
                )}
                {total > 0 && done === total && <p className="text-sm text-success">{t.home.allDone}</p>}
              </div>
            </div>

            <div className="mt-5 space-y-3 border-t border-line-soft pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{t.home.goalsTitle}</p>
              {dailyGoals.map((g) => (
                <div key={g.label}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-fg-2">{g.label}</span>
                    <span
                      className={`font-semibold tabular-nums ${g.goal > 0 && g.done >= g.goal ? "text-success" : ""}`}
                    >
                      {g.goal > 0 ? `${g.done} / ${g.goal}` : g.done}
                    </span>
                  </div>
                  {g.goal > 0 && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-brand-cyan"
                        style={{
                          width: `${Math.min(100, (g.done / g.goal) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* ---- clients to get back to ---- */}
          <Link
            href="/follow-up"
            className={`flex items-center gap-3 rounded-2xl border p-4 shadow-xs transition hover:border-accent/50 ${
              followUpsLate > 0 ? "border-danger/40 bg-danger/5" : "border-line bg-surface"
            }`}
          >
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                followUpsLate > 0 ? "bg-danger/10 text-danger" : "bg-accent-soft text-accent-fg"
              }`}
            >
              <CalendarCheck className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t.followUp.homeTitle}</span>
              <span className="block text-xs text-muted">
                {followUpsLate === 0 && followUpsToday === 0 ? (
                  t.followUp.homeNone
                ) : (
                  <>
                    {followUpsLate > 0 && (
                      <span className="font-semibold text-danger">{fmt(t.followUp.homeOverdue, { count: followUpsLate })}</span>
                    )}
                    {followUpsLate > 0 && followUpsToday > 0 && " · "}
                    {followUpsToday > 0 && fmt(t.followUp.homeToday, { count: followUpsToday })}
                  </>
                )}
              </span>
            </span>
            <ArrowRight className="size-4 text-muted" />
          </Link>

          {/* ---- scheduled deal steps ---- */}
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
              <ul className="-mx-2 space-y-0.5">
                {upcoming.slice(0, 8).map((step) => {
                  const soon = step.day === today ? t.home.todayLabel : step.day === addDays(today, 1) ? t.home.tomorrowLabel : null;
                  const stages = step.kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
                  return (
                    <li key={`${step.dealId}-${step.stage}`}>
                      <Link href={`/deals/${step.dealId}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-raised">
                        <span
                          className={`w-16 shrink-0 text-center text-xs font-bold ${soon ? "text-warning" : "text-muted"}`}
                        >
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

          {/* ---- what an hour is worth ---- */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <Clock className="size-4 text-brand-cyan" />
                {t.home.hourTitle}
              </span>
            }
          >
            {numbers.hourValue === null ? (
              <p className="text-sm text-muted">{t.home.hourNoData}</p>
            ) : (
              <>
                <p className="text-3xl font-bold tracking-tight text-accent-fg">
                  {fmt(t.home.hourValue, { amount: euro(numbers.hourValue) })}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {fmt(t.home.hourValueHint, { hours: numbers.yearHours, days: numbers.yearHours / 8 })}
                </p>
                <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
                  {fmt(t.home.hourLoss, { amount: euro(numbers.hourValue) })}
                </p>
              </>
            )}
            {numbers.needPerHour !== null && (
              <p className="mt-3 text-sm text-fg-2">
                {numbers.needPerHour === 0
                  ? t.home.hourTargetDone
                  : fmt(t.home.hourNeed, { amount: euro(numbers.needPerHour) })}
              </p>
            )}
          </Card>

          {/* ---- managers: everyone's day ---- */}
          {team && (
            <Card title={t.home.teamToday}>
              <ul className="space-y-4">
                {members.map((member) => {
                  const stats = team.get(member.profile_id) ?? {
                    open: 0,
                    done: 0,
                    overdue: 0,
                  };
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
                                  <span
                                    className={`font-bold ${memberPercent === 100 ? "text-success" : memberPercent < 50 ? "text-warning" : "text-fg-2"}`}
                                  >
                                    {memberPercent}%
                                  </span>
                                </>
                              )}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-accent to-brand-cyan"
                              style={{ width: `${memberPercent}%` }}
                            />
                          </div>
                          {stats.overdue > 0 && (
                            <p className="mt-1 text-[11px] font-semibold text-danger">
                              {fmt(t.home.teamOverdue, {
                                count: stats.overdue,
                              })}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
