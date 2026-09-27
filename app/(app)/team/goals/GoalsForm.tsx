"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { saveGoals, type GoalRow } from "../actions";

type Person = { profileId: string; name: string; avatarPath: string | null };
type Values = Record<Exclude<keyof GoalRow, "profileId">, string>;

const FIELDS = ["dailyCalls", "dailyViewings", "dailyListings", "monthlyTarget", "yearlyTarget"] as const;
const BONUSES = ["monthlyBonus", "yearlyBonus"] as const;

export function GoalsForm({ people, initial }: { people: Person[]; initial: Record<string, GoalRow | undefined> }) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, Values>>(() =>
    Object.fromEntries(
      people.map((p) => {
        const g = initial[p.profileId];
        return [
          p.profileId,
          {
            ...Object.fromEntries(FIELDS.map((f) => [f, g && g[f] ? String(g[f]) : ""])),
            monthlyBonus: g?.monthlyBonus ?? "",
            yearlyBonus: g?.yearlyBonus ?? "",
          } as Values,
        ];
      })
    )
  );
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  const labels: Record<(typeof FIELDS)[number], string> = {
    dailyCalls: t.goals.calls,
    dailyViewings: t.goals.viewings,
    dailyListings: t.goals.listings,
    monthlyTarget: t.goals.monthly,
    yearlyTarget: t.goals.yearly,
  };
  const bonusLabels: Record<(typeof BONUSES)[number], string> = {
    monthlyBonus: t.goals.monthlyBonus,
    yearlyBonus: t.goals.yearlyBonus,
  };

  function set(profileId: string, field: (typeof FIELDS)[number], value: string) {
    if (!/^\d*$/.test(value.replace(/\s/g, ""))) return;
    setValues((v) => ({ ...v, [profileId]: { ...v[profileId], [field]: value.replace(/\s/g, "") } }));
    setStatus("idle");
  }

  function copyFirst() {
    const first = values[people[0]?.profileId];
    if (!first) return;
    setValues(Object.fromEntries(people.map((p) => [p.profileId, { ...first }])));
    setStatus("idle");
  }

  function save() {
    const rows: GoalRow[] = people.map((p) => {
      const v = values[p.profileId];
      const n = (s: string) => (s === "" ? 0 : Number(s));
      return {
        profileId: p.profileId,
        dailyCalls: n(v.dailyCalls),
        dailyViewings: n(v.dailyViewings),
        dailyListings: n(v.dailyListings),
        monthlyTarget: n(v.monthlyTarget),
        yearlyTarget: n(v.yearlyTarget),
        monthlyBonus: v.monthlyBonus,
        yearlyBonus: v.yearlyBonus,
      };
    });
    startTransition(async () => {
      const result = await saveGoals(rows);
      setStatus(result.ok ? "saved" : "failed");
    });
  }

  return (
    <div className="space-y-4 pb-24">
      <ul className="space-y-3">
        {people.map((person) => (
          <li key={person.profileId} className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
            <div className="mb-3 flex items-center gap-2.5">
              <Avatar path={person.avatarPath} name={person.name} size="sm" />
              <span className="font-medium">{person.name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {FIELDS.map((field) => (
                <label
                  key={field}
                  className={`block text-[11px] font-medium text-muted ${field === "monthlyTarget" ? "col-span-3 sm:col-span-1" : ""} ${field === "yearlyTarget" ? "col-span-3 sm:col-span-1" : ""}`}
                >
                  {labels[field]}
                  <input
                    inputMode="numeric"
                    value={values[person.profileId][field]}
                    placeholder="0"
                    onChange={(e) => set(person.profileId, field, e.target.value)}
                    className={`${inputClass} mt-1`}
                  />
                </label>
              ))}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {BONUSES.map((field) => (
                <label key={field} className="block text-[11px] font-medium text-muted">
                  {bonusLabels[field]}
                  <input
                    value={values[person.profileId][field]}
                    maxLength={200}
                    placeholder={t.goals.bonusPlaceholder}
                    onChange={(e) => {
                      const value = e.target.value;
                      setValues((v) => ({ ...v, [person.profileId]: { ...v[person.profileId], [field]: value } }));
                      setStatus("idle");
                    }}
                    className={`${inputClass} mt-1`}
                  />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2 sm:px-2">
          {status === "saved" && (
            <span className="mr-auto inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" />
              {t.goals.saved}
            </span>
          )}
          {status === "failed" && <span className="mr-auto text-sm font-medium text-danger">{t.errors.generic}</span>}
          {people.length > 1 && (
            <button type="button" onClick={copyFirst} className={buttonClass.secondary}>
              <Copy className="size-4" />
              <span className="hidden sm:inline">{t.goals.applyAll}</span>
            </button>
          )}
          <button type="button" onClick={save} disabled={pending} className={buttonClass.primary}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t.goals.save}
          </button>
        </div>
      </div>
    </div>
  );
}
