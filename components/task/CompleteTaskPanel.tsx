"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { deleteTask, setTaskDone } from "@/app/(app)/tasks/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { TASK_LIMITS } from "@/lib/task-validation";

/** Tick off with a short "what happened", or reopen. */
export function CompleteTaskPanel({ taskId, done }: { taskId: string; done: boolean }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function run(nextDone: boolean) {
    setFailed(false);
    startTransition(async () => {
      const result = await setTaskDone(taskId, nextDone, note);
      if (!result.ok) setFailed(true);
      else setNote("");
    });
  }

  if (done) {
    return (
      <button type="button" onClick={() => run(false)} disabled={pending} className={buttonClass.secondary}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        {t.tasks.reopen}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-fg-2">
        {t.tasks.completeNote}
        <textarea
          rows={3}
          value={note}
          maxLength={TASK_LIMITS.note}
          placeholder={t.tasks.completeNotePlaceholder}
          onChange={(e) => setNote(e.target.value)}
          className={`${inputClass} mt-1.5 resize-y`}
        />
      </label>
      {failed && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}
      <button type="button" onClick={() => run(true)} disabled={pending} className={`${buttonClass.primary} w-full py-3`}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
        {t.tasks.completeTitle}
      </button>
    </div>
  );
}

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.tasks.deleteConfirm)) return;
        startTransition(async () => {
          const result = await deleteTask(taskId);
          if (result && !result.ok) window.alert(t.errors.generic);
        });
      }}
      className={buttonClass.danger}
    >
      <Trash2 className="size-4" />
      {pending ? t.common.deleting : t.common.delete}
    </button>
  );
}
