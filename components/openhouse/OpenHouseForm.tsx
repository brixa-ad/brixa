"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Check, Loader2 } from "lucide-react";
import { planOpenHouse, type OpenHouseErrors, type OpenHouseInput } from "@/app/(app)/open-houses/actions";
import { useI18n } from "@/components/I18nProvider";
import { Card, Field, buttonClass, inputClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { PREP_STEPS } from "@/lib/open-house-steps";

/** Which listing, which day and hours, who hosts — BRIXA plans the rest. */
export function OpenHouseForm({
  initial,
  listings,
  members,
}: {
  initial: OpenHouseInput;
  listings: { id: string; title: string }[];
  /** managers pick the host; empty for brokers (they host themselves) */
  members: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<OpenHouseErrors>({});
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof OpenHouseInput>(key: K, value: OpenHouseInput[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const err = (key: keyof OpenHouseInput) => (errors[key] ? t.errors[errors[key]!] : undefined);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setFailed(false);
        startTransition(async () => {
          const result = await planOpenHouse(draft);
          // on success the action moves on to the open house's page
          if (result && !result.ok) {
            setErrors(result.errors ?? {});
            if (!result.errors) setFailed(true);
          }
        });
      }}
      className="space-y-6"
    >
      <Card description={t.openHouses.planHint}>
        <div className="space-y-5">
          <Field label={t.openHouses.property} error={err("propertyId")} required>
            {(props) => (
              <select {...props} value={draft.propertyId} onChange={(e) => set("propertyId", e.target.value)} className={inputClass}>
                <option value="">—</option>
                {listings.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t.openHouses.day} error={err("day")} hint={t.openHouses.dayHint} required>
              {(props) => <input {...props} type="date" value={draft.day} onChange={(e) => set("day", e.target.value)} className={inputClass} />}
            </Field>
            <Field label={t.openHouses.from} error={err("from")} required>
              {(props) => <input {...props} type="time" value={draft.from} onChange={(e) => set("from", e.target.value)} className={inputClass} />}
            </Field>
            <Field label={t.openHouses.to} error={err("to")} required>
              {(props) => <input {...props} type="time" value={draft.to} onChange={(e) => set("to", e.target.value)} className={inputClass} />}
            </Field>
          </div>

          {members.length > 0 && (
            <Field label={t.openHouses.host}>
              {(props) => (
                <select {...props} value={draft.hostId} onChange={(e) => set("hostId", e.target.value)} className={inputClass}>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          <Field label={t.openHouses.note} error={err("note")}>
            {(props) => (
              <textarea {...props} rows={2} maxLength={1000} value={draft.note} onChange={(e) => set("note", e.target.value)} className={inputClass} />
            )}
          </Field>
        </div>
      </Card>

      {/* the checklist: what the host will do — only the ticked steps become tasks (and reminders) */}
      <Card title={t.openHouses.stepsTitle} description={t.openHouses.stepsHint}>
        <ul className="space-y-1">
          {PREP_STEPS.map((step) => {
            const on = draft.steps.includes(step.key);
            const when =
              step.offset < 0
                ? fmt(t.openHouses.stepBefore, { n: -step.offset })
                : step.offset === 0
                  ? t.openHouses.stepOnDay
                  : t.openHouses.stepAfter;
            return (
              <li key={step.key}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => set("steps", on ? draft.steps.filter((k) => k !== step.key) : [...draft.steps, step.key])}
                  className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-raised"
                >
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${on ? "border-accent bg-accent text-on-accent" : "border-line-strong"}`}>
                    {on && <Check className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t.openHouses.prep[step.key].title}</span>
                    <span className="block text-xs text-muted">{when}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {failed && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}
      <button type="submit" disabled={pending} className={`${buttonClass.primary} w-full py-3 sm:w-auto`}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : <CalendarPlus className="size-5" />}
        {t.openHouses.create}
      </button>
    </form>
  );
}
