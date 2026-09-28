"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { setTaskDone } from "@/app/(app)/tasks/actions";
import { useI18n } from "@/components/I18nProvider";
import { NoteArea } from "@/components/ui/Dictate";
import { buttonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { TASK_LIMITS } from "@/lib/task-validation";

/** Ticking a task off asks what happened (required — it goes into the history); reopening is one tap. */
export function TaskCheckbox({ taskId, done }: { taskId: string; done: boolean }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useOptimistic(done);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);

  function finish() {
    setFailed(false);
    startTransition(async () => {
      setChecked(true);
      const result = await setTaskDone(taskId, true, note);
      if (result.ok) {
        setAsking(false);
        setNote("");
      } else setFailed(true);
    });
  }

  return (
    <>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={checked ? t.tasks.reopen : t.tasks.markDone}
        disabled={pending}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!checked) {
            setAsking(true);
            return;
          }
          startTransition(async () => {
            setChecked(false);
            await setTaskDone(taskId, false);
          });
        }}
        className={`grid size-7 shrink-0 place-items-center rounded-full border-2 transition ${
          checked
            ? "border-accent bg-accent text-on-accent"
            : "border-line-strong text-transparent hover:border-accent hover:text-accent-fg/50"
        }`}
      >
        <Check className="size-4" strokeWidth={3} />
      </button>

      {asking && (
        // the dialog sits inside the task's link in React's tree: keep its clicks from opening the task
        <span onClick={(e) => e.stopPropagation()}>
        <Modal title={t.done.title} onClose={() => setAsking(false)}>
          <div className="space-y-3">
            <p className="text-sm text-muted">{t.done.hint}</p>
            <NoteArea
              rows={4}
              autoFocus
              maxLength={TASK_LIMITS.note}
              value={note}
              placeholder={t.tasks.completeNotePlaceholder}
              onChange={setNote}
            />
            {failed && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}
            <button type="button" onClick={finish} disabled={pending || !note.trim()} className={`${buttonClass.primary} w-full py-3`}>
              {pending ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
              {t.done.save}
            </button>
          </div>
        </Modal>
        </span>
      )}
    </>
  );
}
