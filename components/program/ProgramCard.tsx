import Link from "next/link";
import { ArrowRight, Repeat } from "lucide-react";
import { Card } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import { PROGRAMS, isProgram, type ProgramKey } from "@/lib/programs";
import { ResumeProgram, StartProgram, StopProgram } from "./ProgramControls";

export type ClientProgram = {
  id: string;
  program: string;
  step: number;
  round: number;
  status: "active" | "stopped" | "finished";
  started_on: string;
};

/** The client's contact program: where it is and what's next — or the programs to start. */
export function ProgramCard({
  programs,
  openTask,
  canEdit,
  hasBroker,
  clientId,
  suggested,
  t,
  lang,
}: {
  programs: ClientProgram[];
  /** the active program's open step */
  openTask: { id: string; due_date: string } | null;
  canEdit: boolean;
  hasBroker: boolean;
  clientId: string;
  suggested: ProgramKey;
  t: Dictionary;
  lang: Lang;
}) {
  const active = programs.find((p) => p.status === "active" && isProgram(p.program));
  const past = programs.filter((p) => p !== active && isProgram(p.program)).slice(0, 3);

  if (!active && !canEdit && past.length === 0) return null;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Repeat className="size-4 text-brand-cyan" />
          {t.programs.cardTitle}
        </span>
      }
      description={active ? undefined : t.programs.cardHint}
    >
      {active ? (
        (() => {
          const key = active.program as ProgramKey;
          const total = PROGRAMS[key].steps.length;
          const repeating = PROGRAMS[key].cycle !== null;
          return (
            <div>
              <p className="font-semibold">{t.programs.names[key]}</p>
              <p className="mt-0.5 text-xs text-muted">
                {total > 1 && fmt(t.programs.stepOf, { step: active.step + 1, total })}
                {repeating && active.round > 1 && ` · ${fmt(t.programs.round, { n: active.round })}`}
                {!(total > 1) && !(repeating && active.round > 1) && fmt(t.programs.started, { date: formatDate(active.started_on, lang) })}
              </p>
              {total > 1 && (
                <div className="mt-2 flex gap-1">
                  {PROGRAMS[key].steps.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${i < active.step ? "bg-success" : i === active.step ? "bg-accent" : "bg-raised"}`}
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 rounded-xl bg-raised/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{t.programs.nextStep}</p>
                <p className="mt-0.5 text-sm font-medium">{t.programs.steps[key][active.step]?.title}</p>
                {openTask ? (
                  <Link href={`/tasks/${openTask.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">
                    {t.programs.openTask} · {fmt(t.programs.due, { date: formatDate(openTask.due_date, lang) })}
                    <ArrowRight className="size-3.5" />
                  </Link>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted">{t.programs.noTask}</p>
                    {canEdit && <ResumeProgram programId={active.id} />}
                  </div>
                )}
              </div>
              {canEdit && (
                <div className="mt-3">
                  <StopProgram programId={active.id} />
                </div>
              )}
            </div>
          );
        })()
      ) : canEdit ? (
        hasBroker ? (
          <StartProgram clientId={clientId} suggested={suggested} />
        ) : (
          <p className="text-sm text-muted">{t.programs.needsBroker}</p>
        )
      ) : null}

      {past.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line-soft pt-3 text-xs text-subtle">
          {past.map((p) => (
            <li key={p.id}>
              {fmt(p.status === "finished" ? t.programs.finished : t.programs.stopped, { name: t.programs.names[p.program as ProgramKey] })}
              {" · "}
              {formatDate(p.started_on, lang)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
