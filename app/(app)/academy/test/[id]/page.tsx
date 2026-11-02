import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CheckCircle2, Clock, Download, Lightbulb, RotateCcw, XCircle } from "lucide-react";
import { StartButton } from "@/components/academy/StartButton";
import { TestRunner } from "@/components/academy/TestRunner";
import { TopicIcon } from "@/components/academy/TopicIcon";
import { PageHeader } from "@/components/PageHeader";
import { Card, buttonClass } from "@/components/ui/form";
import { ANSWER_LETTERS, isOpen, levelName, periodLabel, type AcademyReview } from "@/lib/academy";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { UUID } from "@/lib/share";
import { createClient } from "@/lib/supabase/server";
import { startTest } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.academy };
}

/** A test: running (the person's own), or its result with every question, the right answer and why. */
export default async function AcademyTestPage({ params }: PageProps<"/academy/test/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [{ t, lang }, first] = await Promise.all([getI18n(), supabase.rpc("academy_review", { target: id })]);
  let review = first.data as AcademyReview | null;
  if (!review) notFound();

  // my exam whose time ran out while I was away: it's handed in now
  if (review.mine && !review.finished_at && review.deadline_at && !isOpen(review)) {
    await supabase.rpc("academy_finish", { target: id });
    review = ((await supabase.rpc("academy_review", { target: id })).data as AcademyReview | null) ?? review;
  }

  const A = t.academy;
  const exam = review.mode === "exam";
  const title = exam
    ? review.period
      ? fmt(A.examFor, { period: periodLabel(review.period, t, lang) })
      : A.examAnytime
    : [A.practice, review.topic ? A.topics[review.topic] : null].filter(Boolean).join(" · ");
  const subtitle = [review.mine ? null : fmt(A.someoneElse, { name: review.name }), levelName(review.level, t)].filter(Boolean).join(" · ");

  // still running (or, someone else's, its time up but not yet handed in)
  if (!review.finished_at) {
    return (
      <>
        <PageHeader title={title} subtitle={subtitle} backHref="/academy" backLabel={A.toAcademy} />
        {review.mine ? (
          <TestRunner review={review} />
        ) : (
          <Card>
            <p className="flex items-center gap-2 text-sm text-muted">
              <Clock className="size-4" />
              {A.stillRunning}
            </p>
          </Card>
        )}
      </>
    );
  }

  const score = review.score ?? 0;
  const passed = review.passed === true;
  const tone = !exam ? "text-accent-fg" : passed ? "text-success" : "text-danger";

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} backHref={review.mine ? "/academy" : "/academy/team"} backLabel={review.mine ? A.toAcademy : A.team} />

      {/* the result */}
      <Card>
        <div className="flex flex-wrap items-center gap-5">
          <div className={`grid size-24 shrink-0 place-items-center rounded-full border-8 ${!exam ? "border-accent/30" : passed ? "border-success/30" : "border-danger/30"}`}>
            <span className={`text-2xl font-bold tabular-nums ${tone}`}>{score}%</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-lg font-bold ${tone}`}>{!exam ? A.resultPractice : passed ? A.resultPassed : A.resultFailed}</p>
            <p className="mt-1 text-sm text-fg-2">{fmt(A.resultScore, { correct: review.correct ?? 0, total: review.total, score })}</p>
            {exam && <p className="mt-0.5 text-sm text-muted">{fmt(A.resultPass, { pass: review.pass })}</p>}
            {exam && !passed && review.mine && <p className="mt-2 text-sm text-fg-2">{A.retakeTomorrow}</p>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {review.certificate && (
            <a href={`/academy/certificate/${review.certificate}`} className={buttonClass.primary}>
              <Award className="size-4" />
              {A.downloadCertificate}
              <Download className="size-4" />
            </a>
          )}
          {review.mine && !exam && (
            <form action={startTest}>
              <input type="hidden" name="mode" value="practice" />
              <input type="hidden" name="level" value={review.level} />
              {review.topic && <input type="hidden" name="topic" value={review.topic} />}
              <StartButton className={review.certificate ? buttonClass.secondary : buttonClass.primary}>
                <RotateCcw className="size-4" />
                {A.again}
              </StartButton>
            </form>
          )}
          {review.mine && (
            <Link href="/academy" className={buttonClass.secondary}>
              {A.toAcademy}
            </Link>
          )}
        </div>
      </Card>

      {/* every question: what was chosen, the right one and why */}
      <ol className="mt-6 space-y-4">
        {review.questions.map((q) => {
          const right = q.right !== null && q.chosen === q.right;
          return (
            <li key={q.position} className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
              <div className="flex items-start gap-3">
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${right ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                  {right ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    {q.position}. <TopicIcon topic={q.topic} className="size-3.5" /> {A.topics[q.topic]}
                  </p>
                  <h2 className="mt-1 font-semibold leading-snug">{q.question}</h2>
                  <ul className="mt-3 space-y-1.5">
                    {q.options.map((option, i) => {
                      const isRight = q.right === i;
                      const isChosen = q.chosen === i;
                      return (
                        <li
                          key={i}
                          className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm ${
                            isRight ? "bg-success/10 font-medium text-fg" : isChosen ? "bg-danger/10 text-fg" : "text-fg-2"
                          }`}
                        >
                          <span className={`w-4 shrink-0 font-semibold ${isRight ? "text-success" : isChosen ? "text-danger" : "text-subtle"}`}>{ANSWER_LETTERS[lang][i]}</span>
                          <span className="min-w-0 flex-1">{option}</span>
                          {isChosen && <span className="shrink-0 text-xs font-medium text-muted">{A.yourAnswer}</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {q.chosen === null && <p className="mt-2 text-xs font-medium text-danger">{A.noAnswer}</p>}
                  {q.explanation && (
                    <p className="mt-3 flex gap-2 rounded-lg bg-raised px-3 py-2 text-sm text-fg-2">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span>
                        <span className="font-semibold">{A.why}: </span>
                        {q.explanation}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
