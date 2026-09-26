"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { saveTask } from "@/app/(app)/tasks/actions";
import { useI18n } from "@/components/I18nProvider";
import { Combobox } from "@/components/ui/Combobox";
import { Card, Field, buttonClass, inputClass } from "@/components/ui/form";
import { addDays } from "@/lib/dates";
import { TASK_TYPES, type TaskType } from "@/lib/options";
import { TASK_LIMITS, validateTask, type TaskErrors, type TaskInput } from "@/lib/task-validation";
import type { Member } from "@/lib/types";
import { TypeIcon } from "./TypeIcon";

export type TaskFormLookups = {
  members: Member[];
  clients: { id: string; full_name: string; phone: string | null }[];
  properties: { id: string; title: string }[];
};

export function TaskForm({
  taskId,
  initial,
  lookups,
  canAssign,
  today,
}: {
  taskId?: string;
  initial: TaskInput;
  lookups: TaskFormLookups;
  canAssign: boolean;
  today: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<TaskErrors>({});
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors: TaskErrors = { ...serverErrors, ...(submitted ? validateTask(values) : {}) };
  const err = (key: keyof TaskInput) => (errors[key] ? t.errors[errors[key]!] : undefined);

  function set<K extends keyof TaskInput>(key: K, value: TaskInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setServerErrors({});
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setFailed(false);
    if (Object.keys(validateTask(values)).length > 0) return;
    setSaving(true);
    const result = await saveTask(values, taskId);
    if (result.ok) {
      router.push(`/tasks/${result.id}`);
      return;
    }
    setSaving(false);
    setServerErrors(result.errors ?? {});
    setFailed(Boolean(result.message));
  }

  const quickDates = [
    { label: t.tasks.today, value: today },
    { label: t.tasks.tomorrow, value: addDays(today, 1) },
  ];

  return (
    <form onSubmit={submit} noValidate className="space-y-6 pb-24">
      {(failed || (submitted && Object.keys(errors).length > 0)) && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {failed ? t.errors.generic : t.form.fixErrors}
        </div>
      )}

      <Card>
        <div className="space-y-5">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg-2">{t.tasks.fieldType}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {TASK_TYPES.map((type: TaskType) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={values.type === type}
                  onClick={() => set("type", type)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    values.type === type
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line-strong text-fg-2 hover:border-subtle"
                  }`}
                >
                  <TypeIcon type={type} className="size-3.5" />
                  {t.options.taskType[type]}
                </button>
              ))}
            </div>
          </div>

          <Field label={t.tasks.fieldTitle} required error={err("title")}>
            {(props) => (
              <input
                {...props}
                value={values.title}
                maxLength={TASK_LIMITS.title}
                placeholder={t.tasks.titlePlaceholder}
                onChange={(e) => set("title", e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t.tasks.fieldClient} error={err("clientId")}>
              {(props) => (
                <Combobox
                  {...props}
                  options={lookups.clients.map((c) => ({ value: c.id, label: c.full_name, hint: c.phone ?? undefined }))}
                  value={values.clientId}
                  onChange={(id) => set("clientId", id)}
                  placeholder={t.tasks.searchClient}
                  emptyText={t.location.noMatches}
                />
              )}
            </Field>
            <Field label={t.tasks.fieldProperty} error={err("propertyId")}>
              {(props) => (
                <Combobox
                  {...props}
                  options={lookups.properties.map((p) => ({ value: p.id, label: p.title }))}
                  value={values.propertyId}
                  onChange={(id) => set("propertyId", id)}
                  placeholder={t.tasks.searchProperty}
                  emptyText={t.location.noMatches}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <Field label={t.tasks.fieldDue} required error={err("dueDate")}>
              {(props) => (
                <div className="space-y-2">
                  <input
                    {...props}
                    type="date"
                    value={values.dueDate}
                    onChange={(e) => set("dueDate", e.target.value)}
                    className={inputClass}
                  />
                  <div className="flex gap-2">
                    {quickDates.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => set("dueDate", d.value)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          values.dueDate === d.value
                            ? "border-accent bg-accent-soft text-accent-fg"
                            : "border-line-strong text-fg-2 hover:border-subtle"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Field>
            <Field label={t.tasks.fieldTime} error={err("dueTime")}>
              {(props) => (
                <input
                  {...props}
                  type="time"
                  value={values.dueTime ?? ""}
                  onChange={(e) => set("dueTime", e.target.value || null)}
                  className={inputClass}
                />
              )}
            </Field>
          </div>

          <Field label={t.tasks.fieldAssignee} error={err("assignedTo")} hint={canAssign ? undefined : t.form.brokerLocked}>
            {(props) => (
              <select
                {...props}
                value={values.assignedTo}
                disabled={!canAssign}
                onChange={(e) => set("assignedTo", e.target.value)}
                className={inputClass}
              >
                {lookups.members.map((m) => (
                  <option key={m.profile_id} value={m.profile_id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label={t.tasks.fieldDescription} error={err("description")}>
            {(props) => (
              <textarea
                {...props}
                rows={4}
                maxLength={TASK_LIMITS.description}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                className={`${inputClass} resize-y`}
              />
            )}
          </Field>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 sm:px-2">
          <Link href={taskId ? `/tasks/${taskId}` : "/tasks"} className={buttonClass.secondary}>
            {t.common.cancel}
          </Link>
          <button type="submit" disabled={saving} className={buttonClass.primary}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? t.common.saving : taskId ? t.tasks.save : t.tasks.create}
          </button>
        </div>
      </div>
    </form>
  );
}
