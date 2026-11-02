"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { deleteQuestion, saveQuestion, setQuestionActive, type QuestionInput } from "@/app/(app)/academy/actions";
import { useI18n } from "@/components/I18nProvider";
import { TopicIcon } from "@/components/academy/TopicIcon";
import { Field, buttonClass, inputClass } from "@/components/ui/form";
import { ACADEMY_LEVELS, ACADEMY_TOPICS, ANSWER_LETTERS, levelName, type AcademyQuestion, type AcademyTopic } from "@/lib/academy";

const iconButton = "grid size-9 shrink-0 place-items-center rounded-lg text-subtle transition hover:bg-raised hover:text-fg disabled:opacity-50";

type Draft = Omit<QuestionInput, "brixa">;

const blank = (city: string | null): Draft => ({
  id: null,
  topic: "city",
  level: 1,
  city: city ?? "",
  question: "",
  options: ["", "", "", ""],
  correct: 0,
  explanation: "",
});

const draftOf = (q: AcademyQuestion): Draft => ({
  id: q.id,
  topic: q.topic,
  level: q.level,
  city: q.city ?? "",
  question: q.question,
  options: [...q.options],
  correct: q.correct,
  explanation: q.explanation ?? "",
});

/** Add, change, turn off or delete questions: the agency's own, or (the platform admin) BRIXA's. */
export function QuestionManager({ questions, brixa, city }: { questions: AcademyQuestion[]; brixa: boolean; city: string | null }) {
  const { t } = useI18n();
  const A = t.academy;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [topic, setTopic] = useState<AcademyTopic | "">("");
  const [level, setLevel] = useState<number | 0>(0);
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return questions.filter(
      (q) =>
        (!topic || q.topic === topic) &&
        (!level || q.level === level) &&
        (!words || q.question.toLowerCase().includes(words) || q.options.some((o) => o.toLowerCase().includes(words)) || (q.code ?? "").includes(words))
    );
  }, [questions, topic, level, search]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass.primary} onClick={() => setDraft(blank(city))}>
          <Plus className="size-4" />
          {A.add}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select aria-label={A.form.topic} value={topic} onChange={(e) => setTopic(e.target.value as AcademyTopic | "")} className={`${inputClass} w-auto! py-1.5`}>
            <option value="">{A.form.topic}: {A.all}</option>
            {ACADEMY_TOPICS.map((key) => (
              <option key={key} value={key}>
                {A.topics[key]}
              </option>
            ))}
          </select>
          <select aria-label={A.form.level} value={level} onChange={(e) => setLevel(Number(e.target.value))} className={`${inputClass} w-auto! py-1.5`}>
            <option value={0}>{A.form.level}: {A.all}</option>
            {ACADEMY_LEVELS.map((n) => (
              <option key={n} value={n}>
                {levelName(n, t)}
              </option>
            ))}
          </select>
          <label className="relative">
            <span className="sr-only">{A.search}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={A.search} className={`${inputClass} w-56! py-1.5 pl-9`} />
          </label>
        </div>
      </div>

      {draft && !draft.id && <QuestionEditor draft={draft} brixa={brixa} onClose={() => setDraft(null)} />}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-muted">{questions.length === 0 ? A.ownNone : A.noMatch}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((q) =>
            draft?.id === q.id ? (
              <li key={q.id}>
                <QuestionEditor draft={draft} brixa={brixa} onClose={() => setDraft(null)} />
              </li>
            ) : (
              <QuestionRow key={q.id} question={q} brixa={brixa} onEdit={() => setDraft(draftOf(q))} />
            )
          )}
        </ul>
      )}
    </div>
  );
}

function QuestionRow({ question: q, brixa, onEdit }: { question: AcademyQuestion; brixa: boolean; onEdit: () => void }) {
  const { t, lang } = useI18n();
  const A = t.academy;
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  function toggle() {
    start(async () => setFailed(!(await setQuestionActive(q.id, !q.active)).ok));
  }
  function remove() {
    if (!window.confirm(A.deleteConfirm)) return;
    start(async () => setFailed(!(await deleteQuestion(q.id)).ok));
  }

  return (
    <li className={`rounded-2xl border border-line bg-surface p-4 shadow-xs sm:p-5 ${q.active ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-fg">
          <TopicIcon topic={q.topic} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span className="font-medium">{A.topics[q.topic]}</span>· {levelName(q.level, t)}
            {q.city && <span>· {q.city}</span>}
            {q.code && <span className="font-mono">· {q.code}</span>}
            {!q.active && <span className="rounded-full bg-raised px-2 py-0.5 font-semibold text-fg-2">{A.off}</span>}
          </p>
          <p className="mt-1 font-semibold leading-snug">{q.question}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {q.options.map((option, i) => (
              <li key={i} className={`flex gap-2 ${i === q.correct ? "font-medium text-success" : "text-fg-2"}`}>
                <span className="w-4 shrink-0">{i === q.correct ? <CheckCircle2 className="mt-0.5 size-4" /> : ANSWER_LETTERS[lang][i]}</span>
                {option}
              </li>
            ))}
          </ul>
          {q.explanation && <p className="mt-2 text-xs text-muted">{q.explanation}</p>}
          {failed && <p className="mt-2 text-xs font-medium text-danger">{A.saveError}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          {pending && <Loader2 className="mx-2 size-4 animate-spin text-muted" />}
          <button type="button" className={iconButton} onClick={onEdit} disabled={pending} aria-label={A.edit} title={A.edit}>
            <Pencil className="size-4" />
          </button>
          <button type="button" className={iconButton} onClick={toggle} disabled={pending} aria-label={q.active ? A.turnOff : A.turnOn} title={q.active ? A.turnOff : A.turnOn}>
            {q.active ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
          {!brixa && (
            <button type="button" className={`${iconButton} hover:text-danger`} onClick={remove} disabled={pending} aria-label={A.delete} title={A.delete}>
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function QuestionEditor({ draft: initial, brixa, onClose }: { draft: Draft; brixa: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const A = t.academy;
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<"question" | "options" | "generic" | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  function setOption(i: number, value: string) {
    set({ options: draft.options.map((o, j) => (j === i ? value : o)) });
  }
  function removeOption(i: number) {
    const options = draft.options.filter((_, j) => j !== i);
    set({ options, correct: draft.correct === i ? 0 : draft.correct > i ? draft.correct - 1 : draft.correct });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await saveQuestion({ ...draft, brixa });
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={save} className="mb-4 rounded-2xl border-2 border-accent/40 bg-surface p-5 shadow-xs sm:p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={A.form.topic}>
          {(props) => (
            <select {...props} value={draft.topic} onChange={(e) => set({ topic: e.target.value })} className={inputClass}>
              {ACADEMY_TOPICS.map((key) => (
                <option key={key} value={key}>
                  {A.topics[key]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={A.form.level}>
          {(props) => (
            <select {...props} value={draft.level} onChange={(e) => set({ level: Number(e.target.value) })} className={inputClass}>
              {ACADEMY_LEVELS.map((n) => (
                <option key={n} value={n}>
                  {levelName(n, t)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {draft.topic === "city" && (
          <Field label={A.form.city}>
            {(props) => <input {...props} value={draft.city} onChange={(e) => set({ city: e.target.value })} maxLength={80} className={inputClass} />}
          </Field>
        )}
      </div>

      <Field label={A.form.question} required error={error === "question" ? A.formErrors.question : undefined} className="mt-4">
        {(props) => <textarea {...props} value={draft.question} onChange={(e) => set({ question: e.target.value })} rows={2} maxLength={600} className={inputClass} />}
      </Field>

      <fieldset className="mt-4">
        <legend className="mb-1.5 block text-sm font-medium text-fg-2">{A.form.options}</legend>
        <ul className="space-y-2">
          {draft.options.map((option, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct"
                checked={draft.correct === i}
                onChange={() => set({ correct: i })}
                aria-label={`${A.right} ${i + 1}`}
                className="size-4 shrink-0 accent-[var(--success)]"
              />
              <input
                value={option}
                onChange={(e) => setOption(i, e.target.value)}
                maxLength={400}
                aria-label={`${A.form.options} ${i + 1}`}
                className={`${inputClass} ${draft.correct === i ? "border-success/60" : ""}`}
              />
              {draft.options.length > 2 && (
                <button type="button" className={iconButton} onClick={() => removeOption(i)} aria-label={A.form.removeOption} title={A.form.removeOption}>
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {draft.options.length < 5 && (
          <button type="button" className={`${buttonClass.ghost} mt-2`} onClick={() => set({ options: [...draft.options, ""] })}>
            <Plus className="size-4" />
            {A.form.addOption}
          </button>
        )}
        {error === "options" && <p className="mt-1.5 text-xs font-medium text-danger">{A.formErrors.options}</p>}
      </fieldset>

      <Field label={A.form.explanation} className="mt-4">
        {(props) => <textarea {...props} value={draft.explanation} onChange={(e) => set({ explanation: e.target.value })} rows={2} maxLength={1000} className={inputClass} />}
      </Field>

      {error === "generic" && <p className="mt-3 text-sm font-medium text-danger">{A.saveError}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" className={buttonClass.primary} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {A.save}
        </button>
        <button type="button" className={buttonClass.secondary} onClick={onClose} disabled={pending}>
          {A.cancel}
        </button>
      </div>
    </form>
  );
}
