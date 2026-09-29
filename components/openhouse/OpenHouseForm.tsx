"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { planOpenHouse, type OpenHouseErrors, type OpenHouseInput } from "@/app/(app)/open-houses/actions";
import { useI18n } from "@/components/I18nProvider";
import { Card, Field, buttonClass, inputClass } from "@/components/ui/form";

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

          <div className="grid gap-4 sm:grid-cols-3">
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

      {failed && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}
      <button type="submit" disabled={pending} className={`${buttonClass.primary} w-full py-3 sm:w-auto`}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : <CalendarPlus className="size-5" />}
        {t.openHouses.create}
      </button>
    </form>
  );
}
