"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Loader2, Trash2, X } from "lucide-react";
import { deleteTasks } from "@/app/(app)/tasks/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";

type Selection = { on: boolean; picked: Set<string>; toggle: (id: string) => void };
const SelectionContext = createContext<Selection>({ on: false, picked: new Set(), toggle: () => {} });

/**
 * The task list with deleting from the outside: a bin on each task, and "Select" to tick many
 * (or all shown) and delete them at once.
 */
export function TaskSelection({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const all = picked.size === ids.length && ids.length > 0;

  return (
    <SelectionContext.Provider value={{ on, picked, toggle }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {on ? (
          <>
            <button type="button" onClick={() => setPicked(all ? new Set() : new Set(ids))} className={`${buttonClass.secondary} px-3! py-1.5! text-xs!`}>
              <CheckSquare className="size-3.5" />
              {all ? t.tasks.selectNone : fmt(t.tasks.selectAll, { count: ids.length })}
            </button>
            <button
              type="button"
              disabled={pending || picked.size === 0}
              onClick={() => {
                if (!window.confirm(fmt(t.tasks.deleteManyConfirm, { count: picked.size }))) return;
                start(async () => {
                  await deleteTasks([...picked]);
                  setPicked(new Set());
                  setOn(false);
                  router.refresh();
                });
              }}
              className={`${buttonClass.danger} px-3! py-1.5! text-xs!`}
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              {fmt(t.tasks.deleteMany, { count: picked.size })}
            </button>
            <button
              type="button"
              onClick={() => {
                setOn(false);
                setPicked(new Set());
              }}
              className={`${buttonClass.ghost} px-3! py-1.5! text-xs!`}
            >
              <X className="size-3.5" />
              {t.common.cancel}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setOn(true)} className={`${buttonClass.ghost} px-3! py-1.5! text-xs!`}>
            <CheckSquare className="size-3.5" />
            {t.tasks.select}
          </button>
        )}
      </div>
      {children}
    </SelectionContext.Provider>
  );
}

/** In "Select": the tick box on a task. */
export function TaskPick({ id }: { id: string }) {
  const { on, picked, toggle } = useContext(SelectionContext);
  if (!on) return null;
  return (
    <input
      type="checkbox"
      checked={picked.has(id)}
      onChange={() => toggle(id)}
      aria-label="✓"
      className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
    />
  );
}

/** The bin on a task: delete it right from the list. */
export function TaskDeleteButton({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { on } = useContext(SelectionContext);
  const [pending, start] = useTransition();
  if (on) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.tasks.deleteOneConfirm)) return;
        start(async () => {
          await deleteTasks([id]);
          router.refresh();
        });
      }}
      title={t.common.delete}
      aria-label={t.common.delete}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-subtle transition hover:bg-danger/10 hover:text-danger"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );
}
