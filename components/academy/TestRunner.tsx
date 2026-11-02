"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Lightbulb, Loader2, Send, XCircle } from "lucide-react";
import { finishTest, answerQuestion } from "@/app/(app)/academy/actions";
import { useI18n } from "@/components/I18nProvider";
import { TopicIcon } from "@/components/academy/TopicIcon";
import { buttonClass } from "@/components/ui/form";
import { ANSWER_LETTERS, type AcademyReview } from "@/lib/academy";
import { fmt } from "@/lib/i18n/dictionaries";

/** "12:05" */
const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/**
 * A test while it runs: one question at a time. Practice shows the right answer and why at once;
 * the exam keeps the answers (they can be changed) until it's handed in or its time is up.
 */
export function TestRunner({ review }: { review: AcademyReview }) {
  const { t, lang } = useI18n();
  const A = t.academy;
  const router = useRouter();
  const exam = review.mode === "exam";
  const questions = review.questions;

  const [chosen, setChosen] = useState<Record<number, number | null>>(() =>
    Object.fromEntries(questions.map((q) => [q.position, q.chosen]))
  );
  const [shown, setShown] = useState<Record<number, { right: number; explanation: string | null }>>(() =>
    Object.fromEntries(questions.filter((q) => q.right !== null).map((q) => [q.position, { right: q.right!, explanation: q.explanation }]))
  );
  const [index, setIndex] = useState(() => Math.max(0, questions.findIndex((q) => q.chosen === null)));
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [timeUp, setTimeUp] = useState(false);

  // the exam's clock: the time left as the database counted it when the page came, then this device's clock
  const [left, setLeft] = useState<number | null>(null);
  const started = useRef<number | null>(null);
  const handedIn = useRef(false);

  async function finish() {
    if (handedIn.current) return;
    handedIn.current = true;
    setFinishing(true);
    setError(null);
    const result = await finishTest(review.id);
    if (!result.ok) {
      handedIn.current = false;
      setFinishing(false);
      setError(A.errors.answer);
      return;
    }
    router.refresh();
  }

  useEffect(() => {
    if (!review.deadline_at) return;
    const remaining = new Date(review.deadline_at).getTime() - new Date(review.now).getTime();
    if (started.current === null) started.current = Date.now();
    const tick = () => {
      const ms = remaining - (Date.now() - (started.current ?? Date.now()));
      setLeft(ms);
      if (ms <= 0 && !handedIn.current) {
        setTimeUp(true);
        void finish();
      }
    };
    const timer = setInterval(tick, 500);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
    // the clock starts once, from what the page came with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.deadline_at, review.now]);

  const q = questions[index];
  const answeredCount = Object.values(chosen).filter((c) => c !== null && c !== undefined).length;
  const unanswered = questions.length - answeredCount;
  const last = index === questions.length - 1;
  const reveal = shown[q.position];

  async function choose(option: number) {
    if (finishing || saving !== null) return;
    if (!exam && reveal) return; // practice: the first answer counts
    const before = chosen[q.position] ?? null;
    setError(null);
    setSaving(q.position);
    if (exam) setChosen((c) => ({ ...c, [q.position]: option }));
    const result = await answerQuestion(review.id, q.position, option);
    setSaving(null);
    if (!result.ok) {
      if (exam) setChosen((c) => ({ ...c, [q.position]: before }));
      setError(A.errors.answer);
      return;
    }
    if (result.finished) {
      setTimeUp(true);
      handedIn.current = true;
      router.refresh();
      return;
    }
    if (!exam && result.right !== undefined) {
      setChosen((c) => ({ ...c, [q.position]: result.chosen ?? option }));
      setShown((s) => ({ ...s, [q.position]: { right: result.right!, explanation: result.explanation ?? null } }));
    }
  }

  function handIn() {
    if (unanswered > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    void finish();
  }

  const lowTime = left !== null && left < 5 * 60 * 1000;

  return (
    <div className="mx-auto max-w-3xl">
      {/* where I am, and the time */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-fg-2">
          {fmt(A.question, { n: index + 1, total: questions.length })}
          <span className="ml-2 text-muted">· {fmt(A.answered, { count: answeredCount, total: questions.length })}</span>
        </p>
        {exam && left !== null && (
          <p
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${lowTime ? "bg-danger/10 text-danger" : "bg-raised text-fg-2"}`}
            aria-live={lowTime ? "polite" : "off"}
          >
            <Clock className="size-4" />
            {fmt(A.timeLeft, { time: clock(left) })}
          </p>
        )}
      </div>
      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }} />
      </div>

      {timeUp && (
        <p role="alert" className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {A.timeUp}
        </p>
      )}

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-7">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-fg">
          <TopicIcon topic={q.topic} className="size-3.5" />
          {A.topics[q.topic]}
        </p>
        <h2 className="text-lg font-semibold leading-snug sm:text-xl">{q.question}</h2>

        <ul className="mt-5 space-y-2.5">
          {q.options.map((option, i) => {
            const picked = chosen[q.position] === i;
            const isRight = reveal && reveal.right === i;
            const isWrong = reveal && picked && reveal.right !== i;
            const tone = isRight
              ? "border-success bg-success/10"
              : isWrong
                ? "border-danger bg-danger/10"
                : picked
                  ? "border-accent bg-accent-soft"
                  : "border-line hover:border-accent/50 hover:bg-raised";
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => choose(i)}
                  disabled={finishing || (!exam && Boolean(reveal))}
                  aria-pressed={picked}
                  className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition disabled:cursor-default sm:text-base ${tone}`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      isRight ? "bg-success text-white" : isWrong ? "bg-danger text-white" : picked ? "bg-accent text-on-accent" : "bg-raised text-fg-2"
                    }`}
                  >
                    {isRight ? <CheckCircle2 className="size-4" /> : isWrong ? <XCircle className="size-4" /> : ANSWER_LETTERS[lang][i]}
                  </span>
                  <span className="min-w-0 pt-0.5">{option}</span>
                  {saving === q.position && picked && <Loader2 className="ml-auto size-4 shrink-0 animate-spin text-muted" />}
                </button>
              </li>
            );
          })}
        </ul>

        {/* practice: right or not, and why */}
        {reveal && (
          <div className={`mt-5 rounded-xl px-4 py-3 text-sm ${chosen[q.position] === reveal.right ? "bg-success/10" : "bg-danger/10"}`}>
            <p className={`font-semibold ${chosen[q.position] === reveal.right ? "text-success" : "text-danger"}`}>
              {chosen[q.position] === reveal.right ? A.right : A.wrong}
            </p>
            {reveal.explanation && (
              <p className="mt-2 flex gap-2 text-fg-2">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  <span className="font-semibold">{A.why}: </span>
                  {reveal.explanation}
                </span>
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </section>

      {/* the way on */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={buttonClass.secondary} onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0 || finishing}>
          <ArrowLeft className="size-4" />
          {A.previous}
        </button>
        {last || (!exam && unanswered === 0) ? (
          <button type="button" className={buttonClass.primary} onClick={handIn} disabled={finishing}>
            {finishing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {exam ? A.finish : A.finishPractice}
          </button>
        ) : (
          <button type="button" className={buttonClass.primary} onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))} disabled={finishing}>
            {A.next}
            <ArrowRight className="size-4" />
          </button>
        )}
      </div>

      {confirming && (
        <div role="alertdialog" className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4">
          <p className="text-sm font-medium text-fg">{fmt(A.finishConfirm, { count: unanswered })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass.primary} onClick={handIn} disabled={finishing}>
              {exam ? A.finish : A.finishPractice}
            </button>
            <button type="button" className={buttonClass.secondary} onClick={() => setConfirming(false)}>
              {A.cancel}
            </button>
          </div>
        </div>
      )}

      {/* the exam: jump to any question; the answered ones filled */}
      {exam && (
        <nav aria-label={A.answered} className="mt-6 flex flex-wrap gap-1.5">
          {questions.map((item, i) => {
            const has = chosen[item.position] !== null && chosen[item.position] !== undefined;
            return (
              <button
                key={item.position}
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? "step" : undefined}
                className={`grid size-9 place-items-center rounded-lg text-xs font-semibold tabular-nums transition ${
                  i === index ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas" : ""
                } ${has ? "bg-accent text-on-accent" : "border border-line bg-surface text-fg-2 hover:bg-raised"}`}
              >
                {i + 1}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
