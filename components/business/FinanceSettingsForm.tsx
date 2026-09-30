"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { saveFinance } from "@/app/(app)/business/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { EXPENSE_CATEGORIES, type ExpenseCategory, type FinanceSettings } from "@/lib/business";

const num = (text: string) => {
  const v = Number(text.replace(",", ".").replace(/\s/g, ""));
  return text.trim() === "" || !Number.isFinite(v) ? null : v;
};

/** My share of the commission, "pay yourself first", the goal, the monthly budget. */
export function FinanceSettingsForm({ initial }: { initial: FinanceSettings }) {
  const { t } = useI18n();
  const [share, setShare] = useState(String(initial.commissionShare));
  const [savings, setSavings] = useState(String(initial.savingsPercent));
  const [goalName, setGoalName] = useState(initial.savingsGoalName);
  const [goal, setGoal] = useState(initial.savingsGoal === null ? "" : String(initial.savingsGoal));
  const [budget, setBudget] = useState<Record<ExpenseCategory, string>>(
    Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, initial.budget[c] ? String(initial.budget[c]) : ""])) as Record<ExpenseCategory, string>
  );
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function save() {
    const input: FinanceSettings = {
      commissionShare: num(share) ?? 100,
      savingsPercent: num(savings) ?? 0,
      savingsGoal: num(goal),
      savingsGoalName: goalName,
      budget: Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, num(budget[c]) ?? 0])),
    };
    setState("idle");
    startTransition(async () => {
      const result = await saveFinance(input);
      setState(result.ok ? "ok" : "error");
    });
  }

  const field = "mb-1 block text-xs font-medium text-muted";
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={field}>{t.business.share}</span>
          <input inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} className={`${inputClass} tabular-nums`} />
          <span className="mt-1 block text-[11px] text-subtle">{t.business.shareHint}</span>
        </label>
        <label className="block">
          <span className={field}>{t.business.savingsPercent}</span>
          <input inputMode="decimal" value={savings} onChange={(e) => setSavings(e.target.value)} className={`${inputClass} tabular-nums`} />
          <span className="mt-1 block text-[11px] text-subtle">{t.business.savingsHint}</span>
        </label>
        <label className="block">
          <span className={field}>{t.business.goalName}</span>
          <input maxLength={120} value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder={t.business.goalNamePlaceholder} className={inputClass} />
        </label>
        <label className="block">
          <span className={field}>{t.business.goalAmount}</span>
          <input inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} className={`${inputClass} tabular-nums`} />
        </label>
      </div>

      <div>
        <p className={field}>{t.business.budgetLabel}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {EXPENSE_CATEGORIES.map((c) => (
            <label key={c} className="block">
              <span className="mb-1 block truncate text-[11px] text-subtle">{t.business.categories[c]}</span>
              <input
                inputMode="numeric"
                value={budget[c]}
                onChange={(e) => setBudget((b) => ({ ...b, [c]: e.target.value }))}
                className={`${inputClass} tabular-nums`}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className={buttonClass.primary}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t.business.save}
        </button>
        {state === "ok" && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
            <Check className="size-4" />
            {t.business.savedOk}
          </span>
        )}
        {state === "error" && <span className="text-sm font-medium text-danger">{t.errors.generic}</span>}
      </div>
    </div>
  );
}
