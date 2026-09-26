"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { setTaskDone } from "@/app/(app)/tasks/actions";
import { useI18n } from "@/components/I18nProvider";

/** One tap ticks the task off; the database logs it for the goals and the client's history. */
export function TaskCheckbox({ taskId, done }: { taskId: string; done: boolean }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useOptimistic(done);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? t.tasks.reopen : t.tasks.markDone}
      disabled={pending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        startTransition(async () => {
          setChecked(!checked);
          await setTaskDone(taskId, !checked);
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
  );
}
