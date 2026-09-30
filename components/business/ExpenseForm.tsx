"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { addExpense, deleteExpense } from "@/app/(app)/business/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/business";

/** A quick line: how much, for what, when. */
export function ExpenseForm({ today }: { today: string }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("marketing");
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const value = Number(amount.replace(",", ".").replace(/\s/g, ""));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!(value > 0)) return;
        setFailed(false);
        startTransition(async () => {
          const result = await addExpense({ spentOn: day, category, amount: value, note });
          if (result.ok) {
            setAmount("");
            setNote("");
          } else setFailed(true);
        });
      }}
      className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_10rem]"
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{t.business.amount}</span>
        <input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} tabular-nums`} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{t.business.category}</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={inputClass}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t.business.categories[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{t.business.date}</span>
        <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className={inputClass} />
      </label>
      <label className="block sm:col-span-3">
        <span className="mb-1 block text-xs font-medium text-muted">{t.business.note}</span>
        <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={pending || !(value > 0)} className={buttonClass.primary}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t.business.add}
        </button>
        {failed && <span className="text-sm font-medium text-danger">{t.errors.generic}</span>}
      </div>
    </form>
  );
}

export function DeleteExpense({ id }: { id: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.business.deleteConfirm)) return;
        startTransition(async () => void (await deleteExpense(id)));
      }}
      aria-label={t.common.delete}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );
}
