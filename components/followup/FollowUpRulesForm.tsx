"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { saveFollowUpRules, type FollowUpRules } from "@/app/(app)/follow-up/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";

const FIELDS = ["firstHours", "daysA", "daysB", "daysC", "releaseDays"] as const;

/** Managers: the agency's follow-up deadlines. */
export function FollowUpRulesForm({ initial, solo = false }: { initial: FollowUpRules; solo?: boolean }) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<(typeof FIELDS)[number], string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f, String(initial[f])])) as Record<(typeof FIELDS)[number], string>
  );
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const labels = {
    firstHours: t.followUp.firstHours,
    daysA: t.followUp.daysA,
    daysB: t.followUp.daysB,
    daysC: t.followUp.daysC,
    releaseDays: t.followUp.releaseDays,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {/* alone: a client never goes to anyone else */}
        {FIELDS.filter((field) => !(solo && field === "releaseDays")).map((field) => (
          <label key={field} className={`block text-xs font-medium text-muted ${field === "releaseDays" ? "col-span-2" : ""}`}>
            {labels[field]}
            <input
              inputMode="numeric"
              value={values[field]}
              onChange={(e) => {
                if (!/^\d{0,3}$/.test(e.target.value)) return;
                setValues((v) => ({ ...v, [field]: e.target.value }));
                setStatus("idle");
              }}
              className={`${inputClass} mt-1`}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">{solo ? t.followUp.rulesHintSolo : t.followUp.rulesHint}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const n = (key: (typeof FIELDS)[number]) => Number(values[key] || "0");
              const result = await saveFollowUpRules({
                firstHours: n("firstHours"),
                daysA: n("daysA"),
                daysB: n("daysB"),
                daysC: n("daysC"),
                releaseDays: n("releaseDays"),
              });
              setStatus(result.ok ? "saved" : "failed");
            })
          }
          className={buttonClass.primary}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t.followUp.save}
        </button>
        {status === "saved" && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" />
            {t.followUp.saved}
          </span>
        )}
        {status === "failed" && <span className="text-sm font-medium text-danger">{t.errors.invalid}</span>}
      </div>
    </div>
  );
}
