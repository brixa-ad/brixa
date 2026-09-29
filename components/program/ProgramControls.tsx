"use client";

import { useState, useTransition } from "react";
import { Loader2, Play, RotateCcw, Square } from "lucide-react";
import { resumeProgram, startProgram, stopProgram } from "@/app/(app)/clients/program-actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { PROGRAM_KEYS, type ProgramKey } from "@/lib/programs";

/** The four programs to pick from, the best fit first. */
export function StartProgram({ clientId, suggested }: { clientId: string; suggested: ProgramKey }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<ProgramKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const order = [suggested, ...PROGRAM_KEYS.filter((k) => k !== suggested)];

  return (
    <div className="space-y-2">
      {order.map((key) => (
        <div
          key={key}
          className={`flex items-start gap-3 rounded-xl border p-3 ${key === suggested ? "border-accent/40 bg-accent-soft/30" : "border-line"}`}
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {t.programs.names[key]}
              {key === suggested && (
                <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-accent">
                  {t.programs.recommended}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.programs.hints[key]}</p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              setBusy(key);
              startTransition(async () => {
                const result = await startProgram(clientId, key);
                if (!result.ok) {
                  setError(
                    result.reason === "needsBroker" ? t.programs.needsBroker : result.reason === "alreadyActive" ? t.programs.alreadyActive : t.errors.generic
                  );
                }
                setBusy(null);
              });
            }}
            className={`${key === suggested ? buttonClass.primary : buttonClass.secondary} shrink-0 px-3! py-1.5!`}
          >
            {pending && busy === key ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {t.programs.start}
          </button>
        </div>
      ))}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

export function StopProgram({ programId }: { programId: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.programs.stopConfirm)) return;
        startTransition(async () => {
          await stopProgram(programId);
        });
      }}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-danger"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
      {t.programs.stop}
    </button>
  );
}

export function ResumeProgram({ programId }: { programId: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await resumeProgram(programId)))}
      className={`${buttonClass.primary} px-3! py-1.5!`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
      {t.programs.resume}
    </button>
  );
}
