import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, Award, CheckCircle2, Clock, Download, GraduationCap, PlayCircle, ShieldCheck, Shuffle } from "lucide-react";
import { StartButton } from "@/components/academy/StartButton";
import { TopicIcon } from "@/components/academy/TopicIcon";
import { PageHeader } from "@/components/PageHeader";
import { Card, buttonClass } from "@/components/ui/form";
import {
  ACADEMY_LEVELS,
  ACADEMY_TOPICS,
  EXAM_MINUTES,
  EXAM_QUESTIONS,
  PRACTICE_QUESTIONS,
  isAcademyLevel,
  levelName,
  periodLabel,
  topicShares,
  type AcademyAttempt,
  type AcademyCertificate,
  type AcademyMe,
  type TopicScore,
} from "@/lib/academy";
import { sofiaToday } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { startTest } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.academy };
}

type BankRow = { topic: string; level: number; builtin: number; own: number };

/** A share of right answers as a bar's colour: at the pass mark green, near it amber, else red. */
const barTone = (share: number, pass: number) => (share * 100 >= pass ? "bg-success" : share >= 0.6 ? "bg-warning" : "bg-danger");

/** The academy: my level, this round's exam, practice by topic, my certificates and how I did. */
export default async function AcademyPage({ searchParams }: PageProps<"/academy">) {
  const session = (await getSession())!;
  const params = await searchParams;
  const supabase = await createClient();
  const [{ t, lang }, { data: meData }, { data: attemptRows }, { data: certificateRows }, { data: topicRows }, { data: bankRows }] = await Promise.all([
    getI18n(),
    supabase.rpc("academy_me"),
    supabase
      .from("academy_attempts")
      .select("id, profile_id, mode, level, topic, period, total, correct, score, passed, started_at, deadline_at, finished_at")
      .eq("profile_id", session.userId)
      .order("started_at", { ascending: false })
      .limit(30),
    supabase
      .from("academy_certificates")
      .select("id, number, code, profile_id, level, score, holder_name, agency_name, signer_name, issued_on, valid_until")
      .eq("profile_id", session.userId)
      .order("issued_on", { ascending: false }),
    supabase.rpc("academy_topics", { target_org: session.organizationId, target: session.userId }),
    supabase.rpc("academy_bank", { target_org: session.organizationId }),
  ]);
  const A = t.academy;
  const me = meData as AcademyMe | null;

  if (!me) {
    return (
      <>
        <PageHeader title={A.title} subtitle={A.subtitle} />
        <Card>
          <p className="text-sm text-muted">{t.errors.generic}</p>
        </Card>
      </>
    );
  }

  const attempts = (attemptRows ?? []) as AcademyAttempt[];
  const certificates = (certificateRows ?? []) as AcademyCertificate[];
  const bank = (bankRows ?? []) as BankRow[];
  const shares = topicShares((topicRows ?? []) as TopicScore[]);
  const now = new Date().getTime();
  const today = sofiaToday();

  const practiceLevel = isAcademyLevel(Number(params.level)) ? (Number(params.level) as 1 | 2 | 3) : me.level;
  const count = (topic: string, level: number) =>
    bank.filter((r) => r.topic === topic && r.level === level).reduce((sum, r) => sum + r.builtin + r.own, 0);
  const total = bank.reduce((sum, r) => sum + r.builtin + r.own, 0);

  // the exam: running, done this round, waiting after a fail, or to take
  const running = attempts.find((a) => a.mode === "exam" && !a.finished_at && a.deadline_at && new Date(a.deadline_at).getTime() > now);
  const done = me.passed_level !== null && me.passed_level >= me.level;
  const best = attempts
    .filter((a) => a.mode === "exam" && a.passed && (me.period ? a.period === me.period : true))
    .sort((a, b) => b.level - a.level || (b.score ?? 0) - (a.score ?? 0))[0];
  const waiting = me.wait_until && new Date(me.wait_until).getTime() > now ? me.wait_until : null;
  // the levels above: above mine before the exam, above the one passed after it
  const higher = ACADEMY_LEVELS.filter((level) => level > (done ? me.passed_level! : me.level));
  const error = typeof params.error === "string" ? (A.errors as Record<string, string>)[params.error] ?? A.errors.other : null;

  return (
    <>
      <PageHeader title={A.title} subtitle={A.subtitle} />

      {error && (
        <p role="alert" className="mb-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* my level */}
        <Card>
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-fg">
              <GraduationCap className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{A.yourLevel}</p>
              <p className="mt-0.5 text-xl font-bold">{levelName(me.level, t)}</p>
              <p className="mt-1 text-sm text-fg-2">{A.levelHints[me.level - 1]}</p>
              <p className="mt-3 text-xs text-muted">{me.level_set ? A.levelFromManager : A.levelFromGame}</p>
            </div>
          </div>
          <p className="mt-5 border-t border-line-soft pt-4 text-sm text-fg-2">
            {fmt(A.rules, { count: EXAM_QUESTIONS, minutes: EXAM_MINUTES, pass: me.pass })}
          </p>
        </Card>

        {/* this round's exam */}
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{me.period ? fmt(A.examFor, { period: periodLabel(me.period, t, lang) }) : A.examAnytime}</h2>
              {me.period && me.period_ends && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                  <AlarmClock className="size-4" />
                  {fmt(A.examUntil, { date: formatDate(me.period_ends, lang) })}
                </p>
              )}
            </div>
            {done && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-sm font-semibold text-success">
                <CheckCircle2 className="size-4" />
                {A.passed}
              </span>
            )}
          </div>

          <div className="mt-4">
            {running ? (
              <Link href={`/academy/test/${running.id}`} className={buttonClass.primary}>
                <PlayCircle className="size-4" />
                {A.examContinue}
              </Link>
            ) : (
              <>
                <p className="text-sm text-fg-2">
                  {done && best
                    ? fmt(A.examPassed, { score: best.score ?? 0, level: levelName(best.level, t) })
                    : me.period
                      ? fmt(A.examNotYet, { level: levelName(me.level, t) })
                      : A.examAnytimeHint}
                </p>
                {waiting ? (
                  <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
                    <Clock className="size-4" />
                    {fmt(A.examWait, { time: formatDate(waiting, lang, true) })}
                  </p>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!done && (
                      <form action={startTest}>
                        <input type="hidden" name="mode" value="exam" />
                        <input type="hidden" name="level" value={me.level} />
                        <StartButton className={buttonClass.primary}>
                          <PlayCircle className="size-4" />
                          {A.examStart}
                        </StartButton>
                      </form>
                    )}
                    {higher.map((level) => (
                      <form key={level} action={startTest}>
                        <input type="hidden" name="mode" value="exam" />
                        <input type="hidden" name="level" value={level} />
                        <StartButton className={buttonClass.secondary}>{fmt(A.examHigher, { level: levelName(level, t) })}</StartButton>
                      </form>
                    ))}
                  </div>
                )}
                {!waiting && higher.length > 0 && <p className="mt-3 text-xs text-muted">{A.examHigherHint}</p>}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* practice */}
      <Card id="practice" className="mt-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{A.practice}</h2>
            <p className="mt-1 text-sm text-muted">{fmt(A.practiceHint, { count: PRACTICE_QUESTIONS })}</p>
          </div>
          <nav aria-label={A.practiceLevel} className="flex rounded-lg border border-line p-0.5 text-sm">
            {ACADEMY_LEVELS.map((level) => (
              <Link
                key={level}
                href={`/academy?level=${level}#practice`}
                scroll={false}
                aria-current={level === practiceLevel ? "true" : undefined}
                className={`rounded-md px-3 py-1.5 font-medium transition ${level === practiceLevel ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised"}`}
              >
                {A.levelShort[level - 1]}
              </Link>
            ))}
          </nav>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ACADEMY_TOPICS.map((topic) => {
            const n = count(topic, practiceLevel);
            const hint = topic === "city" ? (me.city && n > 0 ? fmt(A.topicHints.city, { city: me.city }) : A.cityNone) : A.topicHints[topic];
            return (
              <form key={topic} action={startTest}>
                <input type="hidden" name="mode" value="practice" />
                <input type="hidden" name="level" value={practiceLevel} />
                <input type="hidden" name="topic" value={topic} />
                <StartButton
                  disabled={n === 0}
                  className="flex h-full w-full items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-accent/50 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line disabled:hover:bg-surface"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-fg">
                    <TopicIcon topic={topic} className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{A.topics[topic]}</span>
                    <span className="mt-0.5 block text-xs text-muted">{hint}</span>
                    <span className="mt-1.5 block text-xs font-medium text-subtle">{fmt(A.questionsCount, { count: n })}</span>
                  </span>
                </StartButton>
              </form>
            );
          })}
        </div>

        <form action={startTest} className="mt-4">
          <input type="hidden" name="mode" value="practice" />
          <input type="hidden" name="level" value={practiceLevel} />
          <StartButton className={buttonClass.secondary} disabled={total === 0}>
            <Shuffle className="size-4" />
            {A.practiceAll} · {A.levelShort[practiceLevel - 1]}
          </StartButton>
        </form>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* certificates */}
        <Card title={A.certificates}>
          {certificates.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Award className="size-4" />
              {A.certificatesNone}
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {certificates.map((c) => {
                const valid = c.valid_until >= today;
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${valid ? "bg-success/10 text-success" : "bg-raised text-subtle"}`}>
                        <Award className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {levelName(c.level, t)} · {c.score}%
                        </p>
                        <p className="text-xs text-muted">
                          {fmt(A.certificateNo, { number: c.number })} · {formatDate(c.issued_on, lang)} ·{" "}
                          {valid ? fmt(A.validUntil, { date: formatDate(c.valid_until, lang) }) : <span className="text-danger">{A.expired}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <a href={`/academy/certificate/${c.id}`} className={buttonClass.secondary}>
                        <Download className="size-4" />
                        {A.download}
                      </a>
                      <Link href={`/v/${c.code}`} className={buttonClass.ghost} target="_blank">
                        <ShieldCheck className="size-4" />
                        {A.check}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* strong and weak topics */}
        <Card title={A.strengths} description={A.strengthsHint}>
          {shares.length === 0 ? (
            <p className="text-sm text-muted">{A.strengthsNone}</p>
          ) : (
            <ul className="space-y-3">
              {shares.map((row) => (
                <li key={row.topic}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <TopicIcon topic={row.topic} className="size-4 text-muted" />
                      {A.topics[row.topic]}
                    </span>
                    <span className="tabular-nums text-fg-2">{Math.round(row.share * 100)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised">
                    <div className={`h-full rounded-full ${barTone(row.share, me.pass)}`} style={{ width: `${Math.max(3, Math.round(row.share * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* history */}
      <Card title={A.history} className="mt-6">
        {attempts.length === 0 ? (
          <p className="text-sm text-muted">{A.historyNone}</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {attempts.map((a) => {
              const open = !a.finished_at && (!a.deadline_at || new Date(a.deadline_at).getTime() > now);
              const what = [
                a.mode === "exam" ? (a.period ? fmt(A.examFor, { period: periodLabel(a.period, t, lang) }) : A.examAnytime) : A.practiceDone,
                levelName(a.level, t),
                a.topic ? A.topics[a.topic] : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{what}</p>
                    <p className="text-xs text-muted">{formatDate(a.started_at, lang, true)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {open ? (
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-fg">{A.inProgress}</span>
                    ) : a.mode === "exam" ? (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.passed ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                        {a.passed ? A.passed : A.failed} · {a.score ?? 0}%
                      </span>
                    ) : (
                      <span className="text-sm tabular-nums text-fg-2">{a.score ?? 0}%</span>
                    )}
                    <Link href={`/academy/test/${a.id}`} className="text-sm font-medium text-accent-fg hover:underline">
                      {A.open}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
