"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { setAcademyLevel, setAcademyRules } from "@/app/(app)/academy/actions";
import { useI18n } from "@/components/I18nProvider";
import { Field, buttonClass, inputClass } from "@/components/ui/form";
import { ACADEMY_EVERY, ACADEMY_LEVELS, levelName, type AcademyEvery } from "@/lib/academy";
import { fmt } from "@/lib/i18n/dictionaries";

/** A person's level in the academy: set by the leader, or from their BRIXA level. */
export function LevelSelect({ profileId, level, levelSet, autoLevel, name }: { profileId: string; level: number; levelSet: boolean; autoLevel: number; name: string }) {
  const { t } = useI18n();
  const A = t.academy;
  const [value, setValue] = useState(levelSet ? String(level) : "");
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, start] = useTransition();

  function change(next: string) {
    const before = value;
    setValue(next);
    setState("idle");
    start(async () => {
      const result = await setAcademyLevel(profileId, next === "" ? null : Number(next));
      if (!result.ok) setValue(before);
      setState(result.ok ? "saved" : "error");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={`${A.yourLevel}: ${name}`}
        value={value}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        className={`${inputClass} w-auto! py-1.5 text-sm`}
      >
        <option value="">{fmt(A.levelAuto, { level: A.levelShort[autoLevel - 1] })}</option>
        {ACADEMY_LEVELS.map((n) => (
          <option key={n} value={n}>
            {levelName(n, t)}
          </option>
        ))}
      </select>
      {pending ? (
        <Loader2 className="size-4 animate-spin text-muted" />
      ) : state === "saved" ? (
        <Check className="size-4 text-success" aria-label={A.levelSaved} />
      ) : state === "error" ? (
        <span className="text-xs text-danger">{A.saveError}</span>
      ) : null}
    </div>
  );
}

/** The owner: how often the exam comes round and its pass mark. */
export function RulesForm({ every, pass }: { every: AcademyEvery; pass: number }) {
  const { t } = useI18n();
  const A = t.academy;
  const [often, setOften] = useState<AcademyEvery>(every);
  const [mark, setMark] = useState(String(pass));
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, start] = useTransition();
  const markNumber = Number(mark);
  const markOk = Number.isInteger(markNumber) && markNumber >= 50 && markNumber <= 100;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!markOk) return;
    setState("idle");
    start(async () => {
      const result = await setAcademyRules(often, markNumber);
      setState(result.ok ? "saved" : "error");
    });
  }

  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
      <Field label={A.every}>
        {(props) => (
          <select {...props} value={often} onChange={(e) => setOften(e.target.value as AcademyEvery)} className={inputClass}>
            {ACADEMY_EVERY.map((key) => (
              <option key={key} value={key}>
                {A.everyOptions[key]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={A.passMark} error={markOk ? undefined : t.errors.range}>
        {(props) => <input {...props} type="number" min={50} max={100} step={1} inputMode="numeric" value={mark} onChange={(e) => setMark(e.target.value)} className={inputClass} />}
      </Field>
      <div className="flex items-center gap-3">
        <button type="submit" className={buttonClass.primary} disabled={pending || !markOk}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {A.save}
        </button>
        {state === "saved" && <span className="text-sm text-success">{A.saved}</span>}
        {state === "error" && <span className="text-sm text-danger">{A.saveError}</span>}
      </div>
    </form>
  );
}
