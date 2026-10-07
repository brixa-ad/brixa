"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { saveGroupGoals, type GroupGoalRow } from "../actions";

export type GroupGoalLine = {
  scope: GroupGoalRow["scope"];
  scopeId: string | null;
  name: string;
  target: number | null;
  reached: number;
};

/** The month's commission goals of the agency, offices and teams this leader may set. */
export function GroupGoalsForm({ month, lines }: { month: string; lines: GroupGoalLine[] }) {
  const { t, lang } = useI18n();
  const G = t.groupGoals;
  const key = (l: GroupGoalLine) => `${l.scope}:${l.scopeId ?? ""}`;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [key(l), l.target ? String(l.target) : ""]))
  );
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const parse = (v: string) => {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return v.trim() === "" ? null : n;
  };
  const valid = Object.values(values).every((v) => {
    const n = parse(v);
    return n === null || (Number.isFinite(n) && n > 0);
  });

  function save() {
    setStatus("idle");
    startTransition(async () => {
      const result = await saveGroupGoals(
        month,
        lines.map((l) => ({ scope: l.scope, scopeId: l.scopeId, target: parse(values[key(l)] ?? "") }))
      );
      setStatus(result.ok ? "saved" : "failed");
    });
  }

  return (
    <div>
      <ul className="divide-y divide-line-soft">
        {lines.map((l) => {
          const target = parse(values[key(l)] ?? "");
          const percent = target && target > 0 ? Math.min(100, (l.reached / target) * 100) : null;
          return (
            <li key={key(l)} className="grid grid-cols-1 items-center gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">{G[l.scope]}</span>
                  {l.scope === "agency" ? "" : l.name}
                </p>
                {percent !== null && (
                  <>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                      <div className="h-full rounded-full bg-gradient-to-r from-accent to-brand-cyan" style={{ width: `${percent}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {fmt(G.reached, { reached: formatPrice(l.reached, "EUR", lang) ?? "", target: formatPrice(target!, "EUR", lang) ?? "" })}
                    </p>
                  </>
                )}
              </div>
              <input
                inputMode="numeric"
                aria-label={`${G.target}: ${l.name}`}
                placeholder={G.target}
                value={values[key(l)] ?? ""}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [key(l)]: e.target.value }));
                  setStatus("idle");
                }}
                className={`${inputClass} text-right tabular-nums`}
              />
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending || !valid} className={buttonClass.primary}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {G.save}
        </button>
        {status === "saved" && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" />
            {G.saved}
          </span>
        )}
        {status === "failed" && <span className="text-sm text-danger">{t.errors.generic}</span>}
      </div>
    </div>
  );
}
