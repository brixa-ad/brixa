import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Plus, Quote } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ProgressRing } from "@/components/ProgressRing";
import { TaskItem } from "@/components/task/TaskItem";
import { Card, buttonClass } from "@/components/ui/form";
import { daysBetween, sofiaToday, TIME_ZONE } from "@/lib/dates";
import { fmt, locale } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { quoteOfTheDay } from "@/lib/quotes";
import { getSession } from "@/lib/session";
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

  const [{ t, lang }, day, team, members] = await Promise.all([
    getI18n(),
    getMyDay(session.userId, today),
    session.isManager ? getTeamDay(session.organizationId, today) : Promise.resolve(null),
    session.isManager ? getMembers(supabase, session.organizationId) : Promise.resolve([]),
  ]);

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
          </Card>

          {/* ---- managers: everyone's day ---- */}
          {team && (
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
                              {memberTotal === 0 ? "—" : `${stats.done}/${memberTotal}`}
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
                              {fmt(t.home.teamOverdue, { count: stats.overdue })}
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
